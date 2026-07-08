// Helper de formatação para o LoginScreen.
// O lockout real é 100% server-side (RPC check_login_lockout + tabela login_attempts).
export function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}min ${r}s` : `${r}s`;
}
