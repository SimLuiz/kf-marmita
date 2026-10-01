// Política de senha do padrão KF (a mesma do kf-garantia/kf-dashboard):
// recusa com o MOTIVO exato, para a pessoa não ficar tentando variações do
// mesmo erro. Pura — testada em tests/senha.test.ts.

export const SENHA_MIN = 10;
const TERMOS_OBVIOS = ["senha", "password", "kfbaterias", "marmita", "bateria", "admin", "operador", "teste", "trocar", "mudar"];
const SEQUENCIAS = ["01234", "12345", "23456", "34567", "45678", "56789", "98765", "abcde", "bcdef", "qwert", "asdfg", "zxcvb"];

/** null quando a senha passa; senão, o motivo. */
export function problemaSenha(senha: string, ctx?: { usuario?: string; nome?: string }): string | null {
  if (typeof senha !== "string" || senha.length < SENHA_MIN) return `A senha deve ter no mínimo ${SENHA_MIN} caracteres`;
  if (senha.length > 72) return "A senha deve ter no máximo 72 caracteres";
  const s = senha.toLowerCase();
  if (/^(.)\1+$/.test(senha)) return "A senha não pode ser um único caractere repetido";
  if (TERMOS_OBVIOS.some((t) => s.includes(t))) return "A senha contém um termo óbvio (senha, admin, marmita, teste…). Escolha outra";
  if (SEQUENCIAS.some((t) => s.includes(t))) return "A senha não pode conter sequências óbvias (12345, abcde, qwerty…)";
  for (const p of [ctx?.usuario, ...String(ctx?.nome ?? "").split(/\s+/)]) {
    const t = String(p || "").toLowerCase();
    if (t.length >= 4 && s.includes(t)) return "A senha não pode conter seu nome ou usuário";
  }
  return null;
}
