// Server functions de sessão (HttpOnly cookies). Nada do supabase-js auth no browser.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

const ADMIN_DOMAIN = "marmita.local";
const USERNAME_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

function usernameToEmail(u: string) {
  return `${u.trim().toLowerCase()}@${ADMIN_DOMAIN}`;
}

function getIp(): string | null {
  try {
    return (
      getRequestIP({ xForwardedFor: true }) ||
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-real-ip") ||
      null
    );
  } catch {
    return null;
  }
}

function getUa(): string | null {
  try {
    return getRequestHeader("user-agent") ?? null;
  } catch {
    return null;
  }
}

async function recordAttempt(username: string, success: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin.from("login_attempts") as any).insert({
    username: username.toLowerCase(),
    ip: getIp(),
    user_agent: getUa(),
    success,
  });
}

async function writeAudit(
  user_id: string | null,
  username: string | null,
  action: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin.from("audit_logs") as any).insert({
    user_id,
    username,
    action,
    ip_address: getIp(),
    user_agent: getUa(),
  });
}

// Public: checa lockout antes de tentar o login (UX)
export const checkLoginAllowed = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ username: z.string().regex(USERNAME_RE) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any).rpc("check_login_lockout", {
      _username: data.username.toLowerCase(),
      _ip: getIp(),
    });
    if (error) return { locked: false, retry_after_seconds: 0, reason: null as string | null };
    const r = (rows?.[0] ?? {}) as { locked?: boolean; retry_after_seconds?: number; reason?: string | null };
    return {
      locked: !!r.locked,
      retry_after_seconds: Number(r.retry_after_seconds ?? 0),
      reason: r.reason ?? null,
    };
  });

// Public: login. Faz signInWithPassword via admin client (sem persistir), emite cookies HttpOnly.
export const loginWithPassword = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        username: z.string().regex(USERNAME_RE),
        password: z.string().min(1).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { setSessionCookies } = await import("@/integrations/supabase/session.server");

    // Lockout no servidor
    const { data: lockRows } = await (supabaseAdmin as any).rpc("check_login_lockout", {
      _username: data.username.toLowerCase(),
      _ip: getIp(),
    });
    const lock = (lockRows?.[0] ?? {}) as { locked?: boolean; retry_after_seconds?: number };
    if (lock.locked) {
      throw new Response(
        JSON.stringify({ error: "locked", retry_after_seconds: lock.retry_after_seconds ?? 0 }),
        { status: 429 },
      );
    }

    const email = usernameToEmail(data.username);
    // signInWithPassword devolve sessão; usamos só os tokens, nada persistido server-side.
    const { data: signin, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password: data.password,
    });

    if (error || !signin.session) {
      await recordAttempt(data.username, false);
      await writeAudit(null, data.username.toLowerCase(), "LOGIN_FAILED");
      throw new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401 });
    }

    setSessionCookies(signin.session.access_token, signin.session.refresh_token);
    await recordAttempt(data.username, true);
    await writeAudit(signin.user!.id, data.username.toLowerCase(), "LOGIN");

    return { ok: true };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { clearSessionCookies, getServerSession } = await import(
    "@/integrations/supabase/session.server"
  );
  const s = await getServerSession();
  if (s) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", s.userId)
      .maybeSingle();
    await writeAudit(s.userId, prof?.username ?? null, "LOGOUT");
    // Revoga o refresh_token no Supabase
    try {
      await supabaseAdmin.auth.admin.signOut(s.accessToken);
    } catch {
      /* noop */
    }
  }
  clearSessionCookies();
  return { ok: true };
});

// Devolve o estado da sessão. Não vaza tokens.
export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const { getServerSession } = await import("@/integrations/supabase/session.server");
  const s = await getServerSession();
  if (!s) return { signedIn: false as const };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: prof }, { data: roles }] = await Promise.all([
    supabaseAdmin.from("profiles").select("username").eq("id", s.userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", s.userId),
  ]);
  return {
    signedIn: true as const,
    userId: s.userId,
    username: prof?.username ?? null,
    isAdmin: !!roles?.some((r) => r.role === "admin"),
  };
});

// Verifica senha do admin sem perturbar a sessão atual (para confirmação de exclusões).
// Exige sessão ativa para evitar uso como oracle de senhas.
export const verifyAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ password: z.string().min(1).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { requireServerSession } = await import("@/integrations/supabase/session.server");
    await requireServerSession();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // signInWithPassword no admin client — não persiste sessão nos cookies, só valida credencial.
    const { error } = await supabaseAdmin.auth.signInWithPassword({
      email: usernameToEmail("admin"),
      password: data.password,
    });
    return { ok: !error };
  });
