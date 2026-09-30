import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const TZ_OFFSET = "-03:00";
const PAGE_SIZE = 1000;

const querySchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cursor: z.string().max(120).optional(),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
  });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Converte um timestamp ISO (UTC) para ISO 8601 com fuso -03:00 */
function toSaoPaulo(iso: string) {
  const d = new Date(iso);
  const shifted = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, "") + TZ_OFFSET;
}

const money = (v: unknown) => Math.round((Number(v ?? 0) + Number.EPSILON) * 100) / 100;

export const Route = createFileRoute("/api/public/rh/marmitas")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        const apiKey = process.env["RH_API_KEY"];
        if (!apiKey) return json({ erro: "integracao_nao_configurada" }, 500);

        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!token || !safeEqual(token, apiKey)) {
          return json({ erro: "nao_autorizado" }, 401);
        }

        const url = new URL(request.url);
        const parsed = querySchema.safeParse({
          inicio: url.searchParams.get("inicio") ?? "",
          fim: url.searchParams.get("fim") ?? "",
          cursor: url.searchParams.get("cursor") ?? undefined,
        });
        if (!parsed.success) {
          return json(
            { erro: "parametros_invalidos", detalhe: "informe inicio e fim no formato AAAA-MM-DD" },
            400,
          );
        }
        const { inicio, fim, cursor } = parsed.data;
        const from = new Date(`${inicio}T00:00:00${TZ_OFFSET}`);
        const to = new Date(`${fim}T23:59:59.999${TZ_OFFSET}`);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
          return json({ erro: "periodo_invalido" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;

        // ---- totais do período inteiro (calculados no servidor)
        let totalCount = 0;
        let totalFunc = 0;
        let totalEmp = 0;
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const { data, error } = await db
            .from("meal_records")
            .select("unit_price, company_unit_price")
            .gte("taken_at", from.toISOString())
            .lte("taken_at", to.toISOString())
            .order("taken_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
          if (error) return json({ erro: "falha_na_consulta" }, 500);
          const rows = data ?? [];
          totalCount += rows.length;
          for (const r of rows) {
            totalFunc += Number(r.unit_price ?? 0);
            totalEmp += Number(r.company_unit_price ?? 0);
          }
          if (rows.length < PAGE_SIZE) break;
          if (offset > 500000) break;
        }

        // ---- página de lançamentos (cursor keyset: taken_at|id)
        let query = db
          .from("meal_records")
          .select(
            "id, taken_at, employee_id, unit_price, company_unit_price, meal_types(name, key, suppliers(name))",
          )
          .gte("taken_at", from.toISOString())
          .lte("taken_at", to.toISOString())
          .order("taken_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(PAGE_SIZE);

        if (cursor) {
          const [cTaken, cId, ...resto] = cursor.split("|");
          // 🔴 Os dois pedaços entram DENTRO do filtro `.or(...)` do PostgREST:
          // sem validar o formato, um cursor como "x,id.gt.0|…" reescreveria o
          // filtro. Só passa o que o próprio servidor gera em `proxima_pagina`
          // (timestamp do Postgres + uuid).
          const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(\+00:00|Z)$/;
          const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!cTaken || !cId || resto.length || !TS.test(cTaken) || !UUID.test(cId)) {
            return json({ erro: "cursor_invalido" }, 400);
          }
          query = query.or(`taken_at.gt.${cTaken},and(taken_at.eq.${cTaken},id.gt.${cId})`);
        }

        const { data: recs, error: recErr } = await query;
        if (recErr) return json({ erro: "falha_na_consulta" }, 500);
        const records = recs ?? [];

        const ids = [...new Set(records.map((r: any) => r.employee_id))];
        const empMap = new Map<string, any>();
        for (let i = 0; i < ids.length; i += 200) {
          const { data: emps, error: empErr } = await db
            .from("employees_view")
            .select("id, name, cpf, company, sector, vinculo")
            .in("id", ids.slice(i, i + 200));
          if (empErr) return json({ erro: "falha_na_consulta" }, 500);
          for (const e of emps ?? []) empMap.set(e.id, e);
        }

        const lancamentos = records.map((r: any) => {
          const e = empMap.get(r.employee_id);
          const cpf = (e?.cpf ?? "").replace(/\D/g, "");
          return {
            id: r.id,
            momento: toSaoPaulo(r.taken_at),
            cpf: cpf.length === 11 ? cpf : null,
            nome: e?.name ?? null,
            empresa: e?.company ?? null,
            setor: e?.sector ?? null,
            vinculo: e?.vinculo ?? "clt",
            tipo: r.meal_types?.key ?? null,
            fornecedor: r.meal_types?.suppliers?.name ?? null,
            valor_funcionario: money(r.unit_price),
            valor_empresa: money(r.company_unit_price),
            cancelado: false,
            observacao: null,
          };
        });

        const last = records[records.length - 1] as any | undefined;
        const proxima =
          records.length === PAGE_SIZE && last
            ? `${url.origin}${url.pathname}?inicio=${inicio}&fim=${fim}&cursor=${encodeURIComponent(
                `${last.taken_at}|${last.id}`,
              )}`
            : null;

        return json({
          periodo: { inicio, fim },
          gerado_em: toSaoPaulo(new Date().toISOString()),
          totais: {
            lancamentos: totalCount,
            valor_funcionario: money(totalFunc),
            valor_empresa: money(totalEmp),
          },
          lancamentos,
          proxima_pagina: proxima,
        });
      },
    },
  },
});
