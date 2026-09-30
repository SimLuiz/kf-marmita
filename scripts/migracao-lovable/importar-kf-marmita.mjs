// Importa export/ (gerado por exportar-lovable.mjs) no Supabase kf-marmita.
// Idempotente: tudo é upsert pela chave primária, fotos com x-upsert — pode
// rodar de novo sem duplicar.
//
// ⚠️ ANTES: desligar os gatilhos de auditoria (senão cada linha importada vira
// um registro falso em audit_logs); DEPOIS: religar. Ver docs/migracao-lovable.md.
//
// Uso: node scripts/importar-kf-marmita.mjs
// Lê SUPABASE_SERVICE_ROLE_KEY de .dev.vars.
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXPORT = join(RAIZ, "export");
const URL_BANCO = "https://uryjwyjswumyqhyqecjn.supabase.co";

const devVars = Object.fromEntries(
  (await readFile(join(RAIZ, ".dev.vars"), "utf8"))
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const CHAVE = devVars.SUPABASE_SERVICE_ROLE_KEY;
if (!CHAVE) throw new Error("preencha SUPABASE_SERVICE_ROLE_KEY em .dev.vars");
// Chave nova (sb_secret_...) vai só no apikey; a legada (JWT) também no Bearer.
const HEADERS = { apikey: CHAVE, ...(CHAVE.startsWith("sb_") ? {} : { Authorization: `Bearer ${CHAVE}` }) };

const ler = async (nome) => JSON.parse(await readFile(join(EXPORT, `${nome}.json`), "utf8"));

async function req(metodo, caminho, corpo, extra = {}) {
  const res = await fetch(`${URL_BANCO}${caminho}`, {
    method: metodo,
    headers: { ...HEADERS, ...(corpo !== undefined && !(corpo instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}), ...extra },
    body: corpo === undefined ? undefined : corpo instanceof Uint8Array ? corpo : JSON.stringify(corpo),
  });
  if (!res.ok) throw new Error(`${metodo} ${caminho}: HTTP ${res.status} ${(await res.text()).slice(0, 400)}`);
  return res;
}

async function upsert(tabela, linhas, conflito) {
  for (let i = 0; i < linhas.length; i += 500) {
    const q = conflito ? `?on_conflict=${conflito}` : "";
    await req("POST", `/rest/v1/${tabela}${q}`, linhas.slice(i, i + 500), {
      Prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
  console.log(`${tabela}: ${linhas.length}`);
}

async function contar(tabela) {
  const res = await req("HEAD", `/rest/v1/${tabela}?select=*`, undefined, { Prefer: "count=exact" });
  return Number((res.headers.get("content-range") ?? "").split("/")[1]);
}

// ---- 1. usuários: mesmos ids (as tabelas apontam para auth.users), senha
// temporária aleatória — a senha do Lovable não sai de lá.
const profiles = await ler("profiles");
const existentes = new Set();
for (let page = 1; ; page++) {
  const res = await req("GET", `/auth/v1/admin/users?page=${page}&per_page=1000`);
  const { users } = await res.json();
  users.forEach((u) => existentes.add(u.id));
  if (users.length < 1000) break;
}
const senhas = [];
for (const p of profiles) {
  if (existentes.has(p.id)) continue;
  const senha = randomBytes(12).toString("base64url");
  await req("POST", "/auth/v1/admin/users", {
    id: p.id,
    email: `${p.username.trim().toLowerCase()}@marmita.local`,
    password: senha,
    email_confirm: true,
    user_metadata: { username: p.username },
  });
  senhas.push({ usuario: p.username, senha_temporaria: senha });
}
if (senhas.length) {
  await writeFile(join(EXPORT, "senhas-temporarias.json"), JSON.stringify(senhas, null, 1));
}
console.log(`usuários: ${profiles.length} (${senhas.length} criados agora; senhas em export/senhas-temporarias.json)`);

// ---- 2. perfis e papéis (o gatilho de novo usuário criou papel 'user' para
// todos; os papéis do Lovable substituem esses)
await upsert("profiles", profiles);
await req("DELETE", "/rest/v1/user_roles?id=not.is.null");
await upsert("user_roles", await ler("user_roles"));

// ---- 3. cadastro e lançamentos, na ordem das chaves estrangeiras
const perms = await ler("app_permissions");
await upsert("app_permissions", perms.map(({ id, ...resto }) => resto), "singleton");
await upsert("suppliers", await ler("suppliers"));
await upsert("meal_types", await ler("meal_types"));
// employees_view → employees: o CPF vai em claro e o gatilho do banco novo
// criptografa com a chave DELE.
await upsert("employees", await ler("employees"));
await upsert("meal_records", await ler("meal_records"));
await upsert("audit_logs", await ler("audit_logs"));
await upsert("login_attempts", await ler("login_attempts"));

// ---- 4. fotos, no mesmo caminho do bucket
const TIPOS = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic" };
async function* arquivos(dir) {
  let itens;
  try { itens = await readdir(dir); } catch { return; }
  for (const nome of itens) {
    const p = join(dir, nome);
    if ((await stat(p)).isDirectory()) yield* arquivos(p);
    else yield p;
  }
}
const fotos = [];
for await (const p of arquivos(join(EXPORT, "photos"))) fotos.push(p);
let enviadas = 0;
const falhas = [];
const fila = [...fotos];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (fila.length) {
    const p = fila.shift();
    const caminho = relative(join(EXPORT, "photos"), p).split("\\").join("/");
    try {
      await req("POST", `/storage/v1/object/meal-photos/${caminho.split("/").map(encodeURIComponent).join("/")}`,
        new Uint8Array(await readFile(p)),
        { "Content-Type": TIPOS[extname(p).toLowerCase()] ?? "application/octet-stream", "x-upsert": "true" });
      if (++enviadas % 250 === 0) console.log(`fotos: ${enviadas}/${fotos.length}...`);
    } catch (e) {
      falhas.push({ caminho, erro: String(e.message).slice(0, 200) });
    }
  }
}));
console.log(`fotos: ${enviadas} enviadas, ${falhas.length} falhas`);
if (falhas.length) await writeFile(join(EXPORT, "import-fotos-falhas.json"), JSON.stringify(falhas, null, 1));

// ---- 5. conferência contra o que veio do Lovable
const resumo = JSON.parse(await readFile(join(EXPORT, "resumo.json"), "utf8"));
console.log("\nconferência (Lovable → kf-marmita):");
let ok = true;
for (const t of ["employees", "suppliers", "meal_types", "meal_records", "profiles", "user_roles", "app_permissions", "login_attempts"]) {
  const aqui = await contar(t);
  const la = resumo[t]?.no_banco;
  if (aqui !== la) ok = false;
  console.log(`  ${aqui === la ? "✅" : "❌"} ${t}: ${la} → ${aqui}`);
}
// audit_logs cresce com os gatilhos, se esquecerem de desligar: conferir à parte
console.log(`  ·  audit_logs: ${resumo.audit_logs?.no_banco} → ${await contar("audit_logs")} (deve bater se os gatilhos estavam desligados)`);
console.log(ok ? "\nTudo bateu." : "\n🔴 Alguma contagem não bateu — não virar a produção ainda.");
