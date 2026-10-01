// Funções puras de formato — sem React, sem banco. Testadas em tests/*.test.ts.
// ⚠️ Regex com barra invertida (\D, \d, \s) SEMPRE pela ferramenta de edição:
// editar por sed/node no Git Bash come a barra (`/\D/` virou `/D/` em 30/09 e
// travou o botão Salvar da edição de funcionário — ver tests/estrutura.test.ts).

/** Só os dígitos. */
export const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** 00000000191 → 000.000.001-91 (aceita parcial, para máscara de digitação). */
export function formatarCPF(v: string) {
  const d = soDigitos(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

/**
 * Valor em reais digitado: "9,50", "R$ 9,50", "1.234,56", "9.5". Vazio = 0.
 * Inválido devolve NaN para a tela recusar — antes "R$ 9,00" virava 0 sem
 * aviso e o lançamento ia para o RH a zero.
 */
export function lerValor(v: string): number {
  let t = (v || "").replace(/R\$/i, "").replace(/\s/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Number(t);
}

/** Data LOCAL em AAAA-MM-DD. toISOString() dá a data em UTC: depois das 21h já é "amanhã". */
export const diaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Competência da folha, igual ao kf-rh: do dia 26 do mês anterior ao dia 25
 * do mês, inclusive. A competência leva o nome do mês do FIM ("08/2026" =
 * 26/07 a 25/08). `fim` é EXCLUSIVO (26 do mês, 00:00) — o formato que as
 * consultas usam (`lt`).
 */
export function competencia(ano: number, mes: number) {
  const inicio = new Date(ano, mes - 2, 26, 0, 0, 0, 0);
  const fim = new Date(ano, mes - 1, 26, 0, 0, 0, 0);
  const ultimoDia = new Date(ano, mes - 1, 25);
  const dm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return {
    ano,
    mes,
    inicio,
    fim,
    codigo: `${String(mes).padStart(2, "0")}/${ano}`,
    rotulo: `Competência ${MESES[mes - 1]}/${ano} (${dm(inicio)} a ${dm(ultimoDia)})`,
  };
}

/** A competência em que uma data cai (dia 26 em diante já é a do mês seguinte). */
export function competenciaDe(d: Date) {
  const base = d.getDate() >= 26 ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : d;
  return competencia(base.getFullYear(), base.getMonth() + 1);
}

/** Desloca a competência em `n` meses. */
export function competenciaSomar(c: { ano: number; mes: number }, n: number) {
  const d = new Date(c.ano, c.mes - 1 + n, 1);
  return competencia(d.getFullYear(), d.getMonth() + 1);
}
