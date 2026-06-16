// Server functions de lockout (única coisa exposta da Parte 2 nesta entrega).
// As demais (loginWithPassword, logout, getMe, verifyAdminPassword com cookies HttpOnly)
// estão escritas mas inativas — serão religadas quando todas as rotas migrarem.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";


const USERNAME_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

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

export const checkLoginAllowed = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ username: z.string().regex(USERNAME_RE) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await (supabaseAdmin as any).rpc("check_login_lockout", {
      _username: data.username.toLowerCase(),
      _ip: getIp(),
    });
    const r = (rows?.[0] ?? {}) as {
      locked?: boolean;
      retry_after_seconds?: number;
      reason?: string | null;
    };
    return {
      locked: !!r.locked,
      retry_after_seconds: Number(r.retry_after_seconds ?? 0),
      reason: r.reason ?? null,
    };
  });

export const recordLoginSuccess = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ username: z.string().regex(USERNAME_RE) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin.from("login_attempts") as any).insert({
      username: data.username.toLowerCase(),
      ip: getIp(),
      user_agent: getUa(),
      success: true,
    });
    return { ok: true };
  });

// Ping de inatividade no servidor — fonte da verdade.
// Cliente chama periodicamente. Se expired=true, faz signOut.
export const pingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ max_minutes: z.number().int().min(1).max(720) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any).rpc(
      "touch_and_check_idle",
      { _max_minutes: data.max_minutes },
    );
    if (error) {
      return { expired: false, idle_seconds: 0 };
    }
    const r = (rows?.[0] ?? {}) as { expired?: boolean; idle_seconds?: number };
    return {
      expired: !!r.expired,
      idle_seconds: Number(r.idle_seconds ?? 0),
    };
  });

