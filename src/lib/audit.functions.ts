// Audit log helpers — agora baseados em cookies HttpOnly (requireServerSession).
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

const ACTIONS = [
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_RESET",
  "USER_CREATED",
  "USER_DELETED",
  "ADMIN_PASSWORD_RESET",
] as const;

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
  .handler(async ({ data }) => {
    const { requireServerSession } = await import("@/integrations/supabase/session.server");
    const s = await requireServerSession();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", s.userId)
      .maybeSingle();
    const { error } = await (supabaseAdmin.from("audit_logs") as any).insert({
      user_id: s.userId,
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

export const listAuditLogs = createServerFn({ method: "GET" }).handler(async () => {
  const { requireServerSession, assertAdmin } = await import(
    "@/integrations/supabase/session.server"
  );
  const s = await requireServerSession();
  await assertAdmin(s);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
});
