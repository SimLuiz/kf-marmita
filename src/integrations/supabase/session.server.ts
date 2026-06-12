// Server-only: lê cookies HttpOnly e devolve um client Supabase autenticado como o usuário.
// SECURITY: nunca importar diretamente em código client-reachable; .server.ts é bloqueado pelo bundler.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import type { Database } from "./types";

export const COOKIE_AT = "mc_at";
export const COOKIE_RT = "mc_rt";

const COOKIE_OPTS_BASE = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
};

export interface SessionContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  accessToken: string;
}

function clientWithToken(token: string): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

export function setSessionCookies(access_token: string, refresh_token: string) {
  setCookie(COOKIE_AT, access_token, { ...COOKIE_OPTS_BASE, maxAge: 60 * 60 });
  setCookie(COOKIE_RT, refresh_token, { ...COOKIE_OPTS_BASE, maxAge: 60 * 60 * 24 * 30 });
}

export function clearSessionCookies() {
  deleteCookie(COOKIE_AT, { path: "/" });
  deleteCookie(COOKIE_RT, { path: "/" });
}

/**
 * Tenta obter uma sessão válida a partir dos cookies HttpOnly.
 * - Se `mc_at` estiver válido, devolve o client autenticado.
 * - Se expirado e `mc_rt` presente, faz refresh via admin client e seta novos cookies.
 * - Caso contrário, retorna null.
 */
export async function getServerSession(): Promise<SessionContext | null> {
  let at = getCookie(COOKIE_AT);
  const rt = getCookie(COOKIE_RT);
  if (!at && !rt) return null;

  // Tenta validar o access_token atual
  if (at) {
    const sb = clientWithToken(at);
    const { data, error } = await sb.auth.getUser(at);
    if (!error && data?.user) {
      return { supabase: sb, userId: data.user.id, accessToken: at };
    }
  }

  // Refresh via refresh_token
  if (rt) {
    const { supabaseAdmin } = await import("./client.server");
    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: rt });
    if (error || !data.session) {
      clearSessionCookies();
      return null;
    }
    setSessionCookies(data.session.access_token, data.session.refresh_token);
    at = data.session.access_token;
    const sb = clientWithToken(at);
    return { supabase: sb, userId: data.session.user.id, accessToken: at };
  }

  clearSessionCookies();
  return null;
}

export async function requireServerSession(): Promise<SessionContext> {
  const s = await getServerSession();
  if (!s) throw new Response("Unauthorized", { status: 401 });
  return s;
}

export async function assertAdmin(ctx: SessionContext): Promise<void> {
  const { supabaseAdmin } = await import("./client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}
