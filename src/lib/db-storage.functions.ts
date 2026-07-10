import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface TableSize {
  name: string;
  total_bytes: number;
  row_estimate: number;
}

export interface DbStorage {
  db_bytes: number;
  soft_limit_bytes: number;
  tables: TableSize[];
  generated_at: string;
}

// Soft limit padrão do plano gratuito Supabase (500 MB). Ajuste se seu plano diferir.
const SOFT_LIMIT_BYTES = 500 * 1024 * 1024;

export const getDbStorage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DbStorage> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Acesso negado: somente admin");

    // Tamanho total do banco
    const { data: dbRow, error: dbErr } = await (supabaseAdmin.rpc as any)(
      "pg_database_size_current",
    );
    let db_bytes = 0;

    if (dbErr || dbRow == null) {
      // Fallback: soma dos tamanhos das tabelas públicas
      db_bytes = 0;
    } else {
      db_bytes = Number(dbRow) || 0;
    }

    // Tamanhos por tabela (public)
    const { data: tblRows, error: tblErr } = await (supabaseAdmin.rpc as any)(
      "public_table_sizes",
    );

    const tables: TableSize[] = [];
    if (!tblErr && Array.isArray(tblRows)) {
      for (const r of tblRows) {
        tables.push({
          name: r.name as string,
          total_bytes: Number(r.total_bytes) || 0,
          row_estimate: Number(r.row_estimate) || 0,
        });
      }
    }

    if (db_bytes === 0 && tables.length) {
      db_bytes = tables.reduce((a, t) => a + t.total_bytes, 0);
    }

    tables.sort((a, b) => b.total_bytes - a.total_bytes);

    return {
      db_bytes,
      soft_limit_bytes: SOFT_LIMIT_BYTES,
      tables,
      generated_at: new Date().toISOString(),
    };
  });
