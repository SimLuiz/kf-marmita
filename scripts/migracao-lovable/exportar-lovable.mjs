// Exporta tudo do banco do Lovable Cloud entrando como um usuário ADMIN do app.
// Não depende de publicar nada no Lovable: usa a URL e a chave pública do
// banco (.env.lovable-antigo) e as regras do próprio banco, que liberam tudo para admin
// — inclusive o CPF decifrado (employees_view) e as fotos (bucket meal-photos).
//
// Credenciais em kf-marmita/.dev.vars (fora do git), nunca na linha de comando:
//   LOVABLE_ADMIN_USUARIO=admin
//   LOVABLE_ADMIN_SENHA=...
// Uso: node scripts/exportar-lovable.mjs      → saída em kf-marmita/export/
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(RAIZ, "export");

function lerEnv(texto) {
  const env = {};
  for (const linha of texto.split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

// O .env do app já aponta para o Supabase novo; o do Lovable ficou guardado aqui.
const lovableEnv = lerEnv(await readFile(join(RAIZ, ".env.lovable-antigo"), "utf8"));
const devVars = lerEnv(await readFile(join(RAIZ, ".dev.vars"), "utf8"));
const URL_BANCO = lovableEnv.SUPABASE_URL;
const CHAVE_PUBLICA = lovableEnv.SUPABASE_PUBLISHABLE_KEY;
const USUARIO = devVars.LOVABLE_ADMIN_USUARIO;
const SENHA = devVars.LOVABLE_ADMIN_SENHA;
if (!URL_BANCO || !CHAVE_PUBLICA) throw new Error("lovable/.env sem SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY");
if (!USUARIO || !SENHA) throw new Error("preencha LOVABLE_ADMIN_USUARIO e LOVABLE_ADMIN_SENHA em .dev.vars");

// ---- sessão (renovada antes de expirar; a exportação das fotos pode demorar)
let sessao = null;
async function entrar() {
  const corpo = sessao?.refresh_token
    ? { grant: "refresh_token", body: { refresh_token: sessao.refresh_token } }
    : { grant: "password", body: { email: `${USUARIO.trim().toLowerCase()}@marmita.local`, password: SENHA } };
  const res = await fetch(`${URL_BANCO}/auth/v1/token?grant_type=${corpo.grant}`, {
    method: "POST",
    headers: { apikey: CHAVE_PUBLICA, "Content-Type": "application/json" },
    body: JSON.stringify(corpo.body),
  });
  if (!res.ok) throw new Error(`login falhou: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const s = await res.json();
  sessao = { ...s, expira: Date.now() + (s.expires_in - 120) * 1000 };
}
async function token() {
  if (!sessao || Date.now() > sessao.expira) await entrar();
  return sessao.access_token;
}
async function api(caminho) {
  for (let tentativa = 1; ; tentativa++) {
    const res = await fetch(`${URL_BANCO}${caminho}`, {
      headers: { apikey: CHAVE_PUBLICA, Authorization: `Bearer ${await token()}` },
    });
    if (res.ok) return res;
    if (res.status === 401 && tentativa === 1) { sessao = null; continue; }
    if (res.status >= 500 && tentativa < 3) continue;
    throw new Error(`${caminho}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}

// ---- tabelas (PostgREST devolve no máximo 1000 por página)
const TABELAS = {
  employees: "employees_view", // CPF decifrado; a chave do cofre não viaja
  suppliers: "suppliers",
  meal_types: "meal_types",
  meal_records: "meal_records",
  profiles: "profiles",
  user_roles: "user_roles",
  app_permissions: "app_permissions",
  audit_logs: "audit_logs",
  login_attempts: "login_attempts",
};

async function tabelaInteira(origem) {
  const todas = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await api(`/rest/v1/${origem}?select=*&order=id.asc&offset=${offset}&limit=1000`);
    const linhas = await res.json();
    todas.push(...linhas);
    if (linhas.length < 1000) return todas;
  }
}
async function contar(origem) {
  const res = await fetch(`${URL_BANCO}/rest/v1/${origem}?select=id`, {
    method: "HEAD",
    headers: { apikey: CHAVE_PUBLICA, Authorization: `Bearer ${await token()}`, Prefer: "count=exact" },
  });
  return Number((res.headers.get("content-range") ?? "").split("/")[1]);
}

await mkdir(OUT, { recursive: true });
await entrar();
console.log(`logado como ${USUARIO}`);

const dados = {};
const resumo = {};
for (const [nome, origem] of Object.entries(TABELAS)) {
  const linhas = await tabelaInteira(origem);
  const total = await contar(origem);
  dados[nome] = linhas;
  resumo[nome] = { exportadas: linhas.length, no_banco: total };
  await writeFile(join(OUT, `${nome}.json`), JSON.stringify(linhas));
  console.log(`${nome}: ${linhas.length}${total !== linhas.length ? `  ⚠️ banco diz ${total}` : ""}`);
}

// Sem CPF decifrado, o CPF se perderia na importação: avisa alto.
const semCpf = dados.employees.filter((e) => !e.cpf).length;
console.log(`funcionários sem CPF legível: ${semCpf} de ${dados.employees.length}`);
if (semCpf === dados.employees.length && dados.employees.length > 0) {
  console.log("🔴 NENHUM CPF veio decifrado — pare e confira antes de importar");
}

// ---- fotos, preservando o caminho dentro do bucket
function caminhoNoBucket(p) {
  const marca = "/meal-photos/";
  const i = p.indexOf(marca);
  return (i >= 0 ? p.slice(i + marca.length) : p).split("?")[0];
}
const caminhos = [...new Set(dados.meal_records.map((r) => r.photo_path).filter(Boolean).map(caminhoNoBucket))];
let baixadas = 0, jaTinha = 0;
const falhas = [];
async function baixar(c) {
  const destino = join(OUT, "photos", c);
  try { await access(destino); jaTinha++; return; } catch {}
  try {
    const res = await api(`/storage/v1/object/authenticated/meal-photos/${c.split("/").map(encodeURIComponent).join("/")}`);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, Buffer.from(await res.arrayBuffer()));
    if (++baixadas % 250 === 0) console.log(`fotos: ${baixadas}/${caminhos.length}...`);
  } catch (e) {
    falhas.push({ caminho: c, erro: String(e.message ?? e).slice(0, 200) });
  }
}
const fila = [...caminhos];
await Promise.all(Array.from({ length: 8 }, async () => { while (fila.length) await baixar(fila.shift()); }));

resumo.fotos = { referenciadas: caminhos.length, baixadas, ja_existiam: jaTinha, falhas: falhas.length };
await writeFile(join(OUT, "photos-falhas.json"), JSON.stringify(falhas, null, 1));
await writeFile(join(OUT, "resumo.json"), JSON.stringify({ gerado_em: new Date().toISOString(), ...resumo }, null, 1));
console.log(`fotos: ${caminhos.length} referenciadas, ${baixadas} baixadas, ${jaTinha} já existiam, ${falhas.length} falhas`);
