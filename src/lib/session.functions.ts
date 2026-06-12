// Server functions de lockout (única coisa exposta da Parte 2 nesta entrega).
// As demais (loginWithPassword, logout, getMe, verifyAdminPassword com cookies HttpOnly)
// estão escritas mas inativas — serão religadas quando todas as rotas migrarem.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
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
