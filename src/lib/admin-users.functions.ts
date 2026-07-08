import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado: somente admin");
}

async function audit(
  actorId: string,
  action: string,
  table_name: string,
  record_id: string | null,
  new_data: Record<string, unknown> | null,
  old_data: Record<string, unknown> | null = null,
) {
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

export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, username, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");

    // Puxa banned_until de auth.users para saber quem está bloqueado
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const bannedMap = new Map<string, string | null>();
    for (const u of authList?.users ?? []) {
      const bu = (u as any).banned_until as string | null | undefined;
      bannedMap.set(u.id, bu ?? null);
    }

    const now = Date.now();
    return (profiles ?? []).map((p) => {
      const bu = bannedMap.get(p.id) ?? null;
      const blocked = !!bu && new Date(bu).getTime() > now;
      return {
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
        blocked,
        banned_until: blocked ? bu : null,
      };
    });
  });

export const setAppUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), blocked: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId && data.blocked) {
      throw new Error("Você não pode bloquear a si mesmo");
    }
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", data.userId)
      .maybeSingle();
    if (data.blocked && prof?.username === "admin") {
      throw new Error("Não é possível bloquear o admin do sistema");
    }
    // 'none' desbloqueia; qualquer duração no futuro bloqueia. Usamos 100 anos = permanente.
    const ban_duration = data.blocked ? "876000h" : "none";
    const { error } = await (supabaseAdmin.auth.admin.updateUserById as any)(data.userId, {
      ban_duration,
    });
    if (error) throw new Error(error.message);
    await audit(
      context.userId,
      data.blocked ? "USER_BLOCKED" : "USER_UNBLOCKED",
      "auth.users",
      data.userId,
      { username: prof?.username ?? null },
    );
    return { ok: true };
  });


export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        username: z.string().regex(USERNAME_RE, "Usuário inválido (3-32, letras/números/._-)"),
        password: strongPassword,
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const username = data.username.toLowerCase();
    if (username === "admin") throw new Error("Nome reservado");
    const email = `${username}@${ADMIN_DOMAIN}`;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, "USER_CREATED", "auth.users", created.user?.id ?? null, {
      username,
      email,
    });
    return { id: created.user?.id, username };
  });

export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Você não pode excluir a si mesmo");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", data.userId)
      .maybeSingle();
    if (prof?.username === "admin") throw new Error("Não é possível excluir o admin do sistema");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await audit(context.userId, "USER_DELETED", "auth.users", data.userId, null, {
      username: prof?.username ?? null,
    });
    return { ok: true };
  });

export const resetAppUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), password: strongPassword }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, "ADMIN_PASSWORD_RESET", "auth.users", data.userId, null);
    return { ok: true };
  });
