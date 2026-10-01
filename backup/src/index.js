// ============================================================================
// KF Marmita — backup das assinaturas para o R2
// ============================================================================
// A cada execução (cron, wrangler.jsonc):
//   1. lê do R2 até onde já copiou (_estado.json: o created_at do último);
//   2. pergunta ao banco o que entrou depois (rpc assinaturas_para_backup,
//      migration 003 — só a service_role executa);
//   3. baixa cada arquivo do Storage e grava no R2 com o MESMO caminho, em
//      `assinaturas/<caminho>`;
//   4. avança o estado só até o último que deu certo — se um falhar, a próxima
//      execução recomeça dele (gravar de novo no R2 é inofensivo).
// Sem rota pública: o `fetch` responde 404.
// ============================================================================

const LOTE = 250;

function cabecalhos(env) {
  const k = env.SUPABASE_SERVICE_ROLE_KEY;
  // Chave nova (sb_secret_...) vai só no apikey; a legada (JWT) também no Bearer.
  return k.startsWith("sb_") ? { apikey: k } : { apikey: k, Authorization: `Bearer ${k}` };
}

async function lerEstado(env) {
  const obj = await env.BACKUP.get("_estado.json");
  if (!obj) return { ultimo: "1970-01-01T00:00:00Z", copiados: 0 };
  return obj.json();
}

async function copiar(env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("falta o segredo SUPABASE_SERVICE_ROLE_KEY");
  const estado = await lerEstado(env);

  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/assinaturas_para_backup`, {
    method: "POST",
    headers: { ...cabecalhos(env), "Content-Type": "application/json" },
    body: JSON.stringify({ _depois: estado.ultimo, _limite: LOTE }),
  });
  if (!r.ok) throw new Error(`lista de assinaturas: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const novos = await r.json();
  if (!novos.length) return { copiados: 0, pendentes: false };

  let feitos = 0;
  let falha = null;
  for (const a of novos) {
    const caminho = a.nome.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/authenticated/meal-photos/${caminho}`, {
      headers: cabecalhos(env),
    });
    if (!res.ok) {
      // Arquivo apagado entre a listagem e o download (limpeza de dados): pula.
      if (res.status === 400 || res.status === 404) {
        estado.ultimo = a.criado_em;
        continue;
      }
      falha = `${a.nome}: HTTP ${res.status}`;
      break;
    }
    await env.BACKUP.put(`assinaturas/${a.nome}`, await res.arrayBuffer(), {
      httpMetadata: { contentType: a.tipo || res.headers.get("content-type") || "image/png" },
      customMetadata: { criado_em: a.criado_em },
    });
    estado.ultimo = a.criado_em;
    estado.copiados = (estado.copiados || 0) + 1;
    feitos++;
  }

  estado.atualizado_em = new Date().toISOString();
  await env.BACKUP.put("_estado.json", JSON.stringify(estado), { httpMetadata: { contentType: "application/json" } });
  if (falha) throw new Error(`parou em ${falha} (${feitos} copiados antes)`);
  return { copiados: feitos, pendentes: novos.length === LOTE };
}

export default {
  async scheduled(_evento, env, ctx) {
    ctx.waitUntil(
      copiar(env).then(
        (r) => console.log(`backup: ${r.copiados} assinatura(s) copiada(s)${r.pendentes ? " — há mais na fila" : ""}`),
        (e) => console.error(`backup FALHOU: ${e.message}`),
      ),
    );
  },
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};
