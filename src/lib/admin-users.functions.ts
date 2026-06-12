import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const ADMIN_DOMAIN = "marmita.local";

const strongPassword = z
  .string()
  .min(12, "Senha deve ter no mínimo 12 caracteres")
  .max(72)
  .regex(/[A-Z]/, "Senha deve conter letra maiúscula")
  .regex(/[a-z]/, "Senha deve conter letra minúscula")
  .regex(/[0-9]/, "Senha deve conter número")
  .regex(/[^A-Za-z0-9]/, "Senha deve conter símbolo");

async function ensureAdmin() {
  const { requireServerSession, assertAdmin } = await import(
    "@/integrations/supabase/session.server"
  );
  const s = await requireServerSession();
  await assertAdmin(s);
  return s;
}

async function audit(
  actorId: string,
  action: string,
  table_name: string,
  record_id: string | null,
  new_data: Record<string, unknown> | null,
  old_data: Record<string, unknown> | null = null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("username")
    .eq("id", actorId)
    .maybeSingle();
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    ip =
      getRequestIP({ xForwardedFor: true }) ||
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-real-ip") ||
      null;
    ua = getRequestHeader("user-agent") ?? null;
  } catch {
    /* noop */
  }
  await (supabaseAdmin.from("audit_logs") as any).insert({
    user_id: actorId,
    username: prof?.username ?? null,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    ip_address: ip,
    user_agent: ua,
  });
}

export const listAppUsers = createServerFn({ method: "GET" }).handler(async () => {
  await ensureAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, username, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
  return (profiles ?? []).map((p) => ({
    ...p,
    roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
  }));
});

export const createAppUser = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        username: z.string().regex(USERNAME_RE, "Usuário inválido (3-32, letras/números/._-)"),
        password: strongPassword,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const s = await ensureAdmin();
    const username = data.username.toLowerCase();
    if (username === "admin") throw new Error("Nome reservado");
    const email = `${username}@${ADMIN_DOMAIN}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (error) throw new Error(error.message);
    await audit(s.userId, "USER_CREATED", "auth.users", created.user?.id ?? null, {
      username,
      email,
    });
    return { id: created.user?.id, username };
  });

export const deleteAppUser = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const s = await ensureAdmin();
    if (data.userId === s.userId) throw new Error("Você não pode excluir a si mesmo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", data.userId)
      .maybeSingle();
    if (prof?.username === "admin") throw new Error("Não é possível excluir o admin do sistema");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await audit(s.userId, "USER_DELETED", "auth.users", data.userId, null, {
      username: prof?.username ?? null,
    });
    return { ok: true };
  });

export const resetAppUserPassword = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), password: strongPassword }).parse(input),
  )
  .handler(async ({ data }) => {
    const s = await ensureAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await audit(s.userId, "ADMIN_PASSWORD_RESET", "auth.users", data.userId, null);
    return { ok: true };
  });
