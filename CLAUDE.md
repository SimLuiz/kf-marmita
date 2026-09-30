# KF Marmita — controle de marmitas

Registro das marmitas retiradas pelos funcionários (com foto), cadastro de
funcionários/fornecedores/tipos, relatórios e a integração que alimenta o
**kf-rh** (desconto em folha). Nasceu no Lovable e foi trazido para a estrutura
KF em 30/09/2026 — ver `docs/migracao-lovable.md`.

## No ar

| | |
|---|---|
| **Endereço** | https://marmita.kfsistema.com.br (Worker `kf-marmita`, custom domain) |
| **Banco** | Supabase `kf-marmita`, ref `uryjwyjswumyqhyqecjn`, sa-east-1, **com dado real** |
| **Stack** | TanStack Start (React 19) + nitro `cloudflare-module`, Supabase Auth/RLS |
| **Pacotes** | `bun` (o `bun.lock` é a referência) |

```
bun install
bun run dev        # http://localhost:8080 — usa o banco REAL (.env)
bun run deploy     # vite build + wrangler deploy da config gerada
```

⚠️ **O deploy usa `.output/server/wrangler.json`, gerado pelo build a partir do
`wrangler.jsonc`.** Por isso `wrangler secret put` também leva
`--config .output/server/wrangler.json`.

Segredos no cofre do Worker: `SUPABASE_SERVICE_ROLE_KEY` e `RH_API_KEY` (= o
`MARMITAS_TOKEN` do kf-rh). 🔴 Trocou a chave no Supabase? Regrave o segredo no
Worker na hora — senão toda consulta de servidor falha com `falha_na_consulta`
(aconteceu em 30/09).

## Contrato com o kf-rh — não quebrar

`GET /api/public/rh/marmitas?inicio=AAAA-MM-DD&fim=AAAA-MM-DD` com
`Authorization: Bearer <RH_API_KEY>` (`src/routes/api/public/rh/marmitas.ts`).
O kf-rh depende de: `id` estável por lançamento, `momento` ISO com fuso, `cpf` só
dígitos ou null, `tipo` = `meal_types.key` (chave estável, não o rótulo),
totais calculados no servidor, `fim` inclusivo. Mudou algo aqui? Rode
`node scripts/migracao-lovable/comparar-rh.mjs <inicio> <fim>` enquanto o
Lovable existir, ou compare com o espelho do kf-rh.

## Armadilhas

- **CPF é criptografado no banco** (gatilho `encrypt_employee_cpf` + chave no
  Vault `cpf_encryption_key`). Leia pela `employees_view`. A coluna `cpf` fica
  sempre nula em disco — e por isso o índice `employees_cpf_unique_idx` **não
  impede CPF duplicado** (bug herdado, a corrigir).
- **CSP em `src/start.ts` tem o host do Supabase fixo.** Trocar de projeto
  exige mudar lá, senão o navegador bloqueia o banco.
- `src/integrations/supabase/*` e `routeTree.gen.ts` vieram gerados pelo
  Lovable; o `routeTree.gen.ts` é regenerado pelo build.
- `supabase/migrations/` é o histórico do Lovable. O que foi aplicado no
  kf-marmita é o mesmo, **exceto** o seed do usuário `admin@marmita.local` com
  senha fixa (removido).

## Pendente (fase 3)

1. Login no padrão KF (usuário + senha + 2FA TOTP + Turnstile), como kf-garantia.
2. Fechar as policies `USING (true)` (o scan do Lovable marcou 6 tabelas).
3. Bloqueio real de CPF duplicado (hash do CPF com índice único).
