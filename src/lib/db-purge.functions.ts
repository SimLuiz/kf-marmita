import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirSenhaAdmin, soAdmin, falhaDoBanco } from "./middleware";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

export type PurgeTarget = "meal_records" | "audit_logs" | "logs_acesso";

const TARGET_COLUMN: Record<PurgeTarget, string> = {
  meal_records: "taken_at",
  audit_logs: "created_at",
  logs_acesso: "criado_em",
};

const TARGET_LABEL: Record<PurgeTarget, string> = {
  meal_records: "Lançamentos de refeições",
  audit_logs: "Logs de auditoria",
  logs_acesso: "Registro de acessos (entradas, saídas, falhas)",
};

const rangeSchema = z
  .object({
    targets: z.array(z.enum(["meal_records", "audit_logs", "logs_acesso"])).min(1),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  })
  .refine((v) => new Date(v.from).getTime() <= new Date(v.to).getTime(), {
    message: "Data inicial deve ser anterior à final",
  });

export const previewPurge = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .validator((i) => rangeSchema.parse(i))
  .handler(async ({ context, data }) => {
    // Conexão com o autor nos cabeçalhos: a auditoria registra quem apagou.
    const supabaseAdmin = context.db;
    const fromIso = new Date(`${data.from}T00:00:00-03:00`).toISOString();
    const toIso = new Date(`${data.to}T23:59:59.999-03:00`).toISOString();
    const result: { target: PurgeTarget; label: string; count: number }[] = [];
    for (const t of data.targets) {
      const col = TARGET_COLUMN[t];
      const { count, error } = await (supabaseAdmin.from(t) as any)
        .select("id", { count: "exact", head: true })
        .gte(col, fromIso)
        .lte(col, toIso);
      if (error) falhaDoBanco(error);
      result.push({ target: t, label: TARGET_LABEL[t], count: count ?? 0 });
    }
    return { from: fromIso, to: toIso, items: result };
  });

// 🔴 Exclusão em massa e PERMANENTE: exige a senha de quem está logado,
// conferida aqui — a tela pedir a senha não protege nada se o servidor não
// conferir (era o caso até 30/09).
export const executePurge = createServerFn({ method: "POST" })
  .middleware([soAdmin])
  .validator((i) =>
    rangeSchema.and(z.object({ senha: z.string().min(1).max(200) })).parse(i),
  )
  .handler(async ({ context, data }) => {
    await exigirSenhaAdmin(context.usuario, data.senha);
    // Conexão com o autor nos cabeçalhos: a auditoria registra quem apagou.
    const supabaseAdmin = context.db;
    const fromIso = new Date(`${data.from}T00:00:00-03:00`).toISOString();
    const toIso = new Date(`${data.to}T23:59:59.999-03:00`).toISOString();

    const deleted: { target: PurgeTarget; label: string; count: number }[] = [];
    let photosRemoved = 0;

    for (const t of data.targets) {
      const col = TARGET_COLUMN[t];

      // Se for meal_records, remove antes as fotos do storage
      if (t === "meal_records") {
        const { data: rows, error: selErr } = await supabaseAdmin
          .from("meal_records")
          .select("id, photo_path")
          .gte(col, fromIso)
          .lte(col, toIso);
        if (selErr) falhaDoBanco(selErr);
        const paths = (rows ?? []).map((r: any) => r.photo_path).filter(Boolean);
        // Remove em lotes de 100
        for (let i = 0; i < paths.length; i += 100) {
          const chunk = paths.slice(i, i + 100);
          // Normaliza: se algum path veio como URL completa, extrai o caminho relativo ao bucket
          const normalized = chunk.map((p: string) => {
            const marker = "/meal-photos/";
            const idx = p.indexOf(marker);
            return idx >= 0 ? p.slice(idx + marker.length) : p;
          });
          const { data: removed, error: remErr } = await supabaseAdmin.storage
            .from("meal-photos")
            .remove(normalized);
          if (remErr) {
            console.warn("[purge] falha ao remover fotos:", remErr.message);
          } else {
            photosRemoved += removed?.length ?? normalized.length;
          }
        }
      }

      const { count, error } = await (supabaseAdmin.from(t) as any)
        .delete({ count: "exact" })
        .gte(col, fromIso)
        .lte(col, toIso);
      if (error) falhaDoBanco(error);
      deleted.push({ target: t, label: TARGET_LABEL[t], count: count ?? 0 });
    }

    // Auditoria
    let ip: string | null = null;
    let ua: string | null = null;
    try {
      ip =
        getRequestIP({ xForwardedFor: true }) ||
        getRequestHeader("cf-connecting-ip") ||
        null;
      ua = getRequestHeader("user-agent") ?? null;
    } catch {
      /* noop */
    }
    await (supabaseAdmin.from("audit_logs") as any).insert({
      user_id: context.usuario.id,
      username: context.usuario.usuario,
      action: "DATA_PURGED",
      table_name: data.targets.join(","),
      record_id: null,
      old_data: { from: fromIso, to: toIso, deleted, photosRemoved },
      new_data: null,
      ip_address: ip,
      user_agent: ua,
    });

    return { deleted, photosRemoved };
  });
