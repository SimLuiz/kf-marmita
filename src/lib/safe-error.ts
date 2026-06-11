/**
 * Converte qualquer erro em mensagem genérica e segura para o usuário final.
 * Detalhes técnicos (stack, SQL, tokens, paths) ficam apenas no console do dev/servidor.
 */

// Padrões que indicam vazamento de detalhes técnicos
const LEAKY_PATTERNS = [
  /\b(at\s+\w+\s+\()/i, // stack frame
  /\b(select|insert|update|delete|from|where|join|pg_|postgres|relation|column|schema)\b/i,
  /\b(jwt|bearer|token|api[_-]?key|secret|password=|supabase)\b/i,
  /\b(file:\/\/|\/(home|root|var|usr|tmp|app|workspace)\/)/i,
  /\b(econn|enotfound|etimedout|ssl|tls)\b/i,
  /^[A-Z][a-zA-Z]+Error:/, // "TypeError: ..." style
];

// Mensagens curtas conhecidas que podem ser repassadas como estão
const ALLOWLIST = [
  "Invalid login credentials",
  "Email not confirmed",
  "User already registered",
  "Acesso negado: somente admin",
  "Você não pode excluir a si mesmo",
  "Não é possível excluir o admin do sistema",
  "Nome reservado",
];

const TRANSLATIONS: Record<string, string> = {
  "Invalid login credentials": "Usuário ou senha inválidos",
  "Email not confirmed": "Conta ainda não confirmada",
  "User already registered": "Usuário já cadastrado",
};

export function toUserMessage(err: unknown, fallback = "Ocorreu um erro. Tente novamente."): string {
  // Sempre logar o erro completo para auditoria/dev
  if (typeof console !== "undefined") console.error("[app-error]", err);

  let raw = "";
  if (err instanceof Error) raw = err.message;
  else if (typeof err === "string") raw = err;
  else if (err && typeof err === "object" && "message" in err) raw = String((err as any).message);

  if (!raw) return fallback;

  // Mensagens curtas e seguras passam (com tradução opcional)
  if (ALLOWLIST.includes(raw)) return TRANSLATIONS[raw] ?? raw;

  // Mensagens longas ou com padrão técnico → genérico
  if (raw.length > 140) return fallback;
  if (LEAKY_PATTERNS.some((re) => re.test(raw))) return fallback;

  return raw;
}
