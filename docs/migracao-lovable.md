# Migração do Lovable → estrutura KF (30/09/2026)

**Motivo:** os créditos do Lovable acabavam e o projeto ficava travado (build e
publicação dependem de crédito). Decisão do usuário: sair de lá sem esperar.

## Origem

- Projeto Lovable `df198fb0-60e9-4bd4-8070-6cdc5d64e774`, publicado em
  `lflmcontrolfabricluizfelipelopes.lovable.app`.
- Repo `SimLuiz/marmita-kf` (histórico preservado neste repo até `c285235`).
- Banco no **Lovable Cloud** (`fumbcjoeylgizrzagnff`), sem acesso direto.

## Como os dados saíram

Publicar uma rota de exportação no Lovable foi tentado e travou (sem crédito de
build + bloqueio do scan de segurança). O caminho que funcionou: entrar com um
usuário **admin** do app direto no banco (chave pública + login), já que as
policies liberam tudo para admin — inclusive CPF decifrado pela
`employees_view` e as fotos do bucket.

Scripts em `scripts/migracao-lovable/` (histórico; o `export/` e as credenciais
já foram apagados):

- `exportar-lovable.mjs` — tabelas + fotos.
- `importar-kf-marmita.mjs` — upsert idempotente, usuários com os MESMOS ids
  (as tabelas apontam para `auth.users`), senha temporária, fotos no mesmo
  caminho. Rodou com os gatilhos `audit_*` desligados para não gerar auditoria
  falsa.
- `comparar-rh.mjs` — compara a rota do RH nos dois sistemas.

## Conferência

| | Lovable | kf-marmita |
|---|---|---|
| funcionários | 210 (208 com CPF) | 210 (208 com CPF, re-criptografados) |
| lançamentos | 3.589 | 3.589 |
| soma funcionário / empresa | 34.493,00 / 72.863,00 | idêntico |
| fotos | 3.589 | 3.589 |
| audit_logs / login_attempts | 23.493 / 169 | idêntico |
| rota RH 26/07–25/08, 26/08–25/09, 26/09– | 1.504 / 1.703 / 179 | idêntico, 0 diferenças por campo |

As senhas não saem do Lovable: os 4 usuários receberam senha temporária.

## O que mudou no código

- `vite.config.ts` próprio (sem `@lovable.dev/vite-tanstack-config`).
- `.env`, CSP e `wrangler.jsonc` apontando para o Supabase `kf-marmita`.
- Removidos o broker de sessão do editor Lovable e a rota de exportação.
- kf-rh: `MARMITAS_URL` → `https://marmita.kfsistema.com.br/api/public/rh/marmitas`.
