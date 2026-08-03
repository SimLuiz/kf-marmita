import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Somente eventos self-service podem ser registrados pelo cliente.
// Ações privilegiadas (USER_CREATED, USER_DELETED, ADMIN_PASSWORD_RESET, PASSWORD_RESET)
// são gravadas exclusivamente pelas server functions que as executam.
const ACTIONS = ["LOGIN", "LOGOUT"] as const;


function getIp() {
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

function getUa() {
  try {
    return getRequestHeader("user-agent") ?? null;
  } catch {
    return null;
  }
}

export const logAuditEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        action: z.enum(ACTIONS),
        table_name: z.string().max(64).optional(),
        record_id: z.string().max(128).optional(),
        old_data: z.record(z.string(), z.any()).optional(),
        new_data: z.record(z.string(), z.any()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", context.userId)
      .maybeSingle();
    const { error } = await (supabaseAdmin.from("audit_logs") as any).insert({
      user_id: context.userId,
      username: prof?.username ?? null,
      action: data.action,
      table_name: data.table_name ?? null,
      record_id: data.record_id ?? null,
      old_data: data.old_data ?? null,
      new_data: data.new_data ?? null,
      ip_address: getIp(),
      user_agent: getUa(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Public: registra falha de login + grava em login_attempts (lockout server-side)
export const logFailedLogin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ username: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_.@-]+$/) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ip = getIp();
    const ua = getUa();
    const uname = data.username.toLowerCase();
    await Promise.all([
      (supabaseAdmin.from("audit_logs") as any).insert({
        user_id: null,
        username: uname,
        action: "LOGIN_FAILED",
        table_name: null,
        record_id: null,
        old_data: null,
        new_data: null,
        ip_address: ip,
        user_agent: ua,
      }),
      (supabaseAdmin.from("login_attempts") as any).insert({
        username: uname,
        ip,
        user_agent: ua,
        success: false,
      }),
    ]);
    return { ok: true };
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Acesso negado: somente admin");
    const { data, error } = await supabaseAdmin
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
