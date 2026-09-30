// Cliente do banco com a service_role — SÓ no servidor (a pasta /server/ é
// bloqueada no bundle do navegador pelo importProtection do vite.config.ts).
//
// Desde a migration 002 o navegador não alcança mais o banco: toda leitura e
// escrita passa por aqui. `x-kf-usuario`/`x-kf-ip` vão em toda chamada porque o
// gatilho de auditoria (log_table_change, migration 001) lê quem agiu desses
// cabeçalhos — sem eles, a trilha registraria as mudanças sem autor.
import { createClient } from "@supabase/supabase-js";

export function banco(usuarioId?: string | null, ip?: string | null) {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Configuração do banco ausente (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  const headers: Record<string, string> = {};
  if (usuarioId) headers["x-kf-usuario"] = usuarioId;
  if (ip) headers["x-kf-ip"] = ip;
  // `any` de propósito: os tipos gerados pelo Lovable não conhecem as tabelas
  // novas (usuarios, sessoes, logs_acesso) e o resto do código já trata as
  // consultas como `any`.
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers },
  }) as any;
}
