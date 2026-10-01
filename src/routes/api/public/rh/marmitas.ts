// ============================================================================
// ROTA DO RH — lançamentos de marmita para o kf-rh (desconto em folha)
// ============================================================================
// Contrato no CLAUDE.md. Peças puras (formato, cursor) em src/lib/rh.ts,
// testadas em tests/rh.test.ts.
//
// QUEM PODE CHAMAR (01/10):
//   1. a chave (Bearer) — RH_API_KEY, ou RH_API_KEY_ANTERIOR durante a troca
//      de chave (as duas valem até a antiga ser removida do cofre);
//   2. E a ORIGEM: ou o Worker kf-rh pela service binding `MARMITAS` (chamada
//      interna da Cloudflare, sem passar pela internet — chega sem o cabeçalho
//      CF-Connecting-IP, que a borda da Cloudflare sempre põe em quem vem de
//      fora e que o cliente não consegue forjar), ou um IP das REDES DA
//      EMPRESA (config_acesso, migration 004 — a mesma lista do login, editada
//      na tela Usuários): os scripts do kf-rh rodados no PC da empresa.
//      Lista vazia = qualquer IP com a chave passa.
// ⚠️ Sem CORS de propósito: nenhum navegador chama esta rota (o Lovable
// respondia "Access-Control-Allow-Origin: *", que deixava qualquer site
// chamá-la de dentro do navegador de alguém que tivesse a chave).
// ============================================================================
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { dinheiro, iguaisSeguro, lerCursor, montarLancamento, paraSaoPaulo } from "@/lib/rh";
import { ipPermitido } from "@/lib/rede";

const FUSO = "-03:00";
const PAGINA = 1000;

const parametros = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cursor: z.string().max(120).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/rh/marmitas")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;

        const ipCliente = request.headers.get("cf-connecting-ip");
        const origem = ipCliente ? `ip ${ipCliente}` : "service binding (kf-rh)";
        const registrar = (acao: string, detalhe: string) =>
          db
            .from("logs_acesso")
            .insert({ usuario: "kf-rh", ip: ipCliente ?? "binding", acao, detalhe })
            .then(
              () => {},
              () => {},
            );

        const chave = process.env["RH_API_KEY"];
        if (!chave) return json({ erro: "integracao_nao_configurada" }, 500);

        // Origem: binding (sem CF-Connecting-IP) ou IP das redes da empresa.
        if (ipCliente) {
          const { data: cfg, error } = await db.from("config_acesso").select("redes_empresa").limit(1).maybeSingle();
          if (error) return json({ erro: "falha_na_consulta" }, 500);
          if (!ipPermitido(ipCliente, cfg?.redes_empresa ?? [])) {
            await registrar("rh_origem_recusada", `chamada de fora das redes da empresa (${origem})`);
            return json({ erro: "origem_nao_permitida" }, 403);
          }
        }

        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        const anterior = process.env["RH_API_KEY_ANTERIOR"];
        if (!token || !(iguaisSeguro(token, chave) || (!!anterior && iguaisSeguro(token, anterior)))) {
          await registrar("rh_chave_recusada", `chave ausente ou errada (${origem})`);
          return json({ erro: "nao_autorizado" }, 401);
        }

        const url = new URL(request.url);
        const p = parametros.safeParse({
          inicio: url.searchParams.get("inicio") ?? "",
          fim: url.searchParams.get("fim") ?? "",
          cursor: url.searchParams.get("cursor") ?? undefined,
        });
        if (!p.success) {
          return json({ erro: "parametros_invalidos", detalhe: "informe inicio e fim no formato AAAA-MM-DD" }, 400);
        }
        const { inicio, fim, cursor } = p.data;
        const de = new Date(`${inicio}T00:00:00${FUSO}`);
        const ate = new Date(`${fim}T23:59:59.999${FUSO}`);
        if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime()) || de > ate) {
          return json({ erro: "periodo_invalido" }, 400);
        }
        const posicao = cursor ? lerCursor(cursor) : null;
        if (cursor && !posicao) return json({ erro: "cursor_invalido" }, 400);

        // ---- totais do período inteiro, calculados no servidor.
        // ⚠️ INCLUEM os cancelados: o kf-rh soma TUDO o que recebe e compara
        // com estes totais (fontes.mjs, lerMarmitas) — quem não cobra o
        // cancelado é ele, pelo campo `cancelado` de cada lançamento.
        let qtd = 0;
        let somaFunc = 0;
        let somaEmp = 0;
        for (let offset = 0; ; offset += PAGINA) {
          const { data, error } = await db
            .from("meal_records")
            .select("unit_price, company_unit_price")
            .gte("taken_at", de.toISOString())
            .lte("taken_at", ate.toISOString())
            .order("taken_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + PAGINA - 1);
          if (error) return json({ erro: "falha_na_consulta" }, 500);
          const linhas = data ?? [];
          qtd += linhas.length;
          for (const r of linhas) {
            somaFunc += Number(r.unit_price ?? 0);
            somaEmp += Number(r.company_unit_price ?? 0);
          }
          if (linhas.length < PAGINA || offset > 500000) break;
        }

        // ---- página de lançamentos (keyset: taken_at|id)
        let consulta = db
          .from("meal_records")
          .select(
            "id, taken_at, employee_id, unit_price, company_unit_price, cancelado, motivo_cancelamento, meal_types(key, suppliers(name))",
          )
          .gte("taken_at", de.toISOString())
          .lte("taken_at", ate.toISOString())
          .order("taken_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(PAGINA);
        if (posicao) {
          consulta = consulta.or(
            `taken_at.gt.${posicao.momento},and(taken_at.eq.${posicao.momento},id.gt.${posicao.id})`,
          );
        }
        const { data: lanc, error: errLanc } = await consulta;
        if (errLanc) return json({ erro: "falha_na_consulta" }, 500);
        const registros = lanc ?? [];

        const ids = [...new Set(registros.map((r: any) => r.employee_id))];
        const funcionarios = new Map<string, any>();
        for (let i = 0; i < ids.length; i += 200) {
          const { data: f, error } = await db
            .from("employees_view")
            .select("id, name, cpf, company, sector, vinculo")
            .in("id", ids.slice(i, i + 200));
          if (error) return json({ erro: "falha_na_consulta" }, 500);
          for (const e of f ?? []) funcionarios.set(e.id, e);
        }

        const ultimo = registros[registros.length - 1] as any | undefined;
        const proxima =
          registros.length === PAGINA && ultimo
            ? `${url.origin}${url.pathname}?inicio=${inicio}&fim=${fim}&cursor=${encodeURIComponent(
                `${ultimo.taken_at}|${ultimo.id}`,
              )}`
            : null;

        // Só a primeira página vai para o log (uma consulta = uma linha).
        if (!cursor) await registrar("rh_consulta", `${inicio} a ${fim}: ${qtd} lançamento(s) (${origem})`);

        return json({
          periodo: { inicio, fim },
          gerado_em: paraSaoPaulo(new Date().toISOString()),
          totais: { lancamentos: qtd, valor_funcionario: dinheiro(somaFunc), valor_empresa: dinheiro(somaEmp) },
          lancamentos: registros.map((r: any) => montarLancamento(r, funcionarios.get(r.employee_id))),
          proxima_pagina: proxima,
        });
      },
    },
  },
});
