// Peças puras do contrato com o kf-rh (rota /api/public/rh/marmitas).
// Testadas em tests/rh.test.ts. O contrato está descrito no CLAUDE.md.

/** ISO (UTC) → ISO 8601 com fuso -03:00, sem milissegundos. */
export function paraSaoPaulo(iso: string) {
  const d = new Date(iso);
  const deslocado = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return deslocado.toISOString().replace(/\.\d{3}Z$/, "") + "-03:00";
}

export const dinheiro = (v: unknown) => Math.round((Number(v ?? 0) + Number.EPSILON) * 100) / 100;

const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(\+00:00|Z)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cursor da paginação: "<taken_at do Postgres>|<uuid>". 🔴 Os dois pedaços
 * entram DENTRO do filtro `.or(...)` do PostgREST — sem validar o formato,
 * um cursor como "x,id.gt.0|…" reescreveria o filtro. Só aceita o que o
 * próprio servidor gera em `proxima_pagina`.
 */
export function lerCursor(cursor: string): { momento: string; id: string } | null {
  const partes = cursor.split("|");
  if (partes.length !== 2) return null;
  const [momento, id] = partes;
  return TS.test(momento) && UUID.test(id) ? { momento, id } : null;
}

/** Comparação de tempo constante (a chave do RH). */
export function iguaisSeguro(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Um lançamento no formato do contrato. `e` = funcionário (employees_view). */
export function montarLancamento(
  r: {
    id: string;
    taken_at: string;
    unit_price: unknown;
    company_unit_price: unknown;
    cancelado?: boolean | null;
    motivo_cancelamento?: string | null;
    meal_types?: { key?: string | null; suppliers?: { name?: string | null } | null } | null;
  },
  e: { name?: string | null; cpf?: string | null; company?: string | null; sector?: string | null; vinculo?: string | null } | undefined,
) {
  const cpf = (e?.cpf ?? "").replace(/\D/g, "");
  return {
    id: r.id,
    momento: paraSaoPaulo(r.taken_at),
    cpf: cpf.length === 11 ? cpf : null,
    nome: e?.name ?? null,
    empresa: e?.company ?? null,
    setor: e?.sector ?? null,
    vinculo: e?.vinculo ?? "clt",
    tipo: r.meal_types?.key ?? null,
    fornecedor: r.meal_types?.suppliers?.name ?? null,
    valor_funcionario: dinheiro(r.unit_price),
    valor_empresa: dinheiro(r.company_unit_price),
    // Cancelado no balcão: o kf-rh recebe e NÃO cobra. O motivo vai em
    // `observacao` (o campo já existia no contrato, sempre nulo até 01/10).
    cancelado: !!r.cancelado,
    observacao: r.cancelado ? (r.motivo_cancelamento ?? null) : null,
  };
}
