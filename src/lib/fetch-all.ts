/**
 * O PostgREST retorna no máximo 1000 linhas por requisição.
 * Este helper pagina automaticamente até trazer todos os registros.
 */
const PAGE = 1000;

export async function fetchAllRows<T = any>(
  buildQuery: (from: number, to: number) => any
): Promise<{ data: T[]; error: any }> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE - 1);
    if (error) return { data: all, error };
    const chunk = (data ?? []) as T[];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
    if (from > 200000) break; // guarda de segurança
  }
  return { data: all, error: null };
}
