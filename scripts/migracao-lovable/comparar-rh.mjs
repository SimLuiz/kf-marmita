// Compara a rota do RH no Lovable e no kf-marmita para o mesmo período.
// Uso: node scripts/migracao-lovable/comparar-rh.mjs 2026-08-26 2026-09-25
import { readFile } from "node:fs/promises";
const [inicio, fim] = process.argv.slice(2);
const rh = await readFile(new URL("../../../kf-rh/.dev.vars", import.meta.url), "utf8");
const TOKEN = rh.match(/^MARMITAS_TOKEN=(.*)$/m)[1].trim().replace(/^"|"$/g, "");
const ORIGENS = {
  lovable: "https://lflmcontrolfabricluizfelipelopes.lovable.app",
  novo: "https://marmita.kfsistema.com.br",
};
async function tudo(base) {
  let url = `${base}/api/public/rh/marmitas?inicio=${inicio}&fim=${fim}`, totais, itens = [];
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`${base}: HTTP ${res.status} ${await res.text()}`);
    const j = await res.json();
    totais ??= j.totais;
    itens.push(...j.lancamentos);
    url = j.proxima_pagina ? j.proxima_pagina.replace(/^https?:\/\/[^/]+/, base) : null;
  }
  return { totais, itens: new Map(itens.map((l) => [l.id, l])) };
}
const a = await tudo(ORIGENS.lovable), b = await tudo(ORIGENS.novo);
console.log("totais lovable:", JSON.stringify(a.totais));
console.log("totais novo:   ", JSON.stringify(b.totais));
let difs = 0;
for (const [id, la] of a.itens) {
  const aqui = b.itens.get(id);
  if (!aqui) { if (difs++ < 5) console.log("falta no novo:", id); continue; }
  for (const k of Object.keys(la)) {
    if (JSON.stringify(la[k]) !== JSON.stringify(aqui[k])) { if (difs++ < 5) console.log(`dif ${id}.${k}`); }
  }
}
for (const id of b.itens.keys()) if (!a.itens.has(id)) { if (difs++ < 5) console.log("sobra no novo:", id); }
console.log(`${a.itens.size} x ${b.itens.size} lançamentos, ${difs} diferenças`);
