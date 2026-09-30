import { createFileRoute } from "@tanstack/react-router";

// ⚠️ ROTA TEMPORÁRIA — exportação para a migração ao kf-marmita
// (Cloudflare + Supabase próprio). Remover assim que a importação for
// conferida. O token não está no código: só o SHA-256 dele.
const TOKEN_SHA256 = "0bc36327a2143a5cd503f8a8e4317f03fc36fd866ebcc9dea5e6f6e1490a86a7";
const PAGE_SIZE = 1000;

// Tabela → select. employees sai pela view para o CPF vir decifrado: a
// chave do cofre é deste banco e não viaja.
const TABLES: Record<string, { from: string; select: string; order: string }> = {
  employees: { from: "employees_view", select: "*", order: "id" },
  suppliers: { from: "suppliers", select: "*", order: "id" },
  meal_types: { from: "meal_types", select: "*", order: "id" },
  meal_records: { from: "meal_records", select: "*", order: "id" },
  profiles: { from: "profiles", select: "*", order: "id" },
  user_roles: { from: "user_roles", select: "*", order: "id" },
  app_permissions: { from: "app_permissions", select: "*", order: "id" },
  audit_logs: { from: "audit_logs", select: "*", order: "id" },
  login_attempts: { from: "login_attempts", select: "*", order: "id" },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bucketPath(p: string) {
  const marker = "/meal-photos/";
  const idx = p.indexOf(marker);
  return (idx >= 0 ? p.slice(idx + marker.length) : p).split("?")[0];
}

export const Route = createFileRoute("/api/export/dump")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!token || !safeEqual(await sha256Hex(token), TOKEN_SHA256)) {
          return json({ erro: "nao_autorizado" }, 401);
        }

        const url = new URL(request.url);
        const kind = url.searchParams.get("kind") ?? "";
        const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;

        // Contagens de todas as tabelas, para conferir a importação.
        if (kind === "counts") {
          const counts: Record<string, number | string> = {};
          for (const [name, t] of Object.entries(TABLES)) {
            const { count, error } = await db.from(t.from).select("*", { count: "exact", head: true });
            counts[name] = error ? `erro: ${error.message}` : (count ?? 0);
          }
          return json({ counts });
        }

        // Usuários do Auth (sem senha: o hash não sai pela API).
        if (kind === "users") {
          const page = Math.floor(offset / PAGE_SIZE) + 1;
          const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
          if (error) return json({ erro: error.message }, 500);
          const rows = (data?.users ?? []).map((u: any) => ({
            id: u.id,
            email: u.email,
            user_metadata: u.user_metadata,
            app_metadata: u.app_metadata,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at,
            banned_until: u.banned_until ?? null,
          }));
          return json({ rows, done: rows.length < PAGE_SIZE });
        }

        // URLs assinadas (1h) das fotos de uma página de meal_records.
        if (kind === "photos") {
          const { data, error } = await db
            .from("meal_records")
            .select("id, photo_path")
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
          if (error) return json({ erro: error.message }, 500);
          const recs = (data ?? []).filter((r: any) => r.photo_path);
          const paths = [...new Set(recs.map((r: any) => bucketPath(r.photo_path)))] as string[];
          const rows: { path: string; url: string | null; erro?: string }[] = [];
          for (let i = 0; i < paths.length; i += 100) {
            const chunk = paths.slice(i, i + 100);
            const { data: signed, error: sErr } = await db.storage
              .from("meal-photos")
              .createSignedUrls(chunk, 60 * 60);
            if (sErr) return json({ erro: sErr.message }, 500);
            for (const s of signed ?? []) {
              rows.push({ path: s.path, url: s.signedUrl ?? null, erro: s.error ?? undefined });
            }
          }
          return json({ rows, done: (data ?? []).length < PAGE_SIZE });
        }

        const t = TABLES[kind];
        if (!t) return json({ erro: "kind_invalido", validos: ["counts", "users", "photos", ...Object.keys(TABLES)] }, 400);
        const { data, error } = await db
          .from(t.from)
          .select(t.select)
          .order(t.order, { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) return json({ erro: error.message }, 500);
        const rows = data ?? [];
        return json({ rows, done: rows.length < PAGE_SIZE });
      },
    },
  },
});
