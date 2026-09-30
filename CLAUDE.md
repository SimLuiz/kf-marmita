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
| **Stack** | TanStack Start (React 19) + nitro `cloudflare-module`; banco só pelo Worker (service_role) |
| **Login** | Padrão KF (30/09): usuário + senha + 2FA TOTP + Turnstile, sessão em cookie `__Host-kfm_sessao` |
| **Pacotes** | `bun` (o `bun.lock` é a referência) |

```
bun install
bun run dev        # http://localhost:8080 — usa o banco REAL (.env)
bun run deploy     # vite build + wrangler deploy da config gerada
```

⚠️ **O deploy usa `.output/server/wrangler.json`, gerado pelo build a partir do
`wrangler.jsonc`.** Por isso `wrangler secret put` também leva
`--config .output/server/wrangler.json`.

Segredos no cofre do Worker: `SUPABASE_SERVICE_ROLE_KEY`, `RH_API_KEY` (= o
`MARMITAS_TOKEN` do kf-rh), `TOTP_ENC_KEY` e `TURNSTILE_SECRET` (widget próprio
"KF Marmita Login", sitekey `0x4AAAAAAFKUR2dSPnQ84ziX` no `.env` — hostnames
marmita.kfsistema.com.br, 127.0.0.1 e localhost). Local: os mesmos nomes em
`.dev.vars`, exportados antes do `bun run dev`.

## Segurança — como está desenhado (não desfazer)

🔴 **O navegador NÃO fala com o banco** (migration 002). Toda leitura/gravação
é uma server function em `src/lib/*.functions.ts`, protegida por
`comSessao`/`soAdmin` (`src/lib/middleware.ts`). RLS ligada e sem política em
todas as tabelas, zero privilégio para anon/authenticated. Era o que o Lovable
tinha de pior: políticas `using (true)` deixavam qualquer logado ler e gravar
tudo com a chave pública, pulando as regras da tela.
- **Código de servidor mora em `src/server/`** (bloqueado no bundle do
  navegador pelo `importProtection`). Helper usado dentro de handler, fora de
  `src/server/`, precisa de `createServerOnlyFn` — senão o `dev` quebra com
  "Import denied in client environment" (o build passa e esconde o erro).
- **Login** (`src/server/sessao.ts`, cópia do auth.js do kf-garantia): bcrypt
  no banco, hash do token em `sessoes`, trava escalonada por IP (10/30 min/24 h)
  em `logs_acesso`, Turnstile antes do banco, replay do TOTP bloqueado.
  **2FA:** admin sempre; demais conforme `usuarios.exige_2fa` — o `operador`
  fica sem (pedido do usuário, acesso rápido no balcão). Inatividade: admin 20
  min, demais 60 min.
  **Senha:** só o admin troca senha — a dos demais pela tela Usuários, a
  própria pelo "Trocar minha senha" (que só aparece para admin; o servidor
  recusa os demais). Usuário comum não escolhe a própria senha (pedido do
  usuário: evitar senha fácil).
- **Auditoria:** o gatilho `log_table_change` lê o autor de `x-kf-usuario`/
  `x-kf-ip`, que `banco()` (`src/server/banco.ts`) manda em toda chamada. Usar
  `banco()` SEM o usuário numa gravação = alteração sem autor na trilha.
- **Preço vem sempre do tipo de marmita, no servidor** — nunca do navegador.
- **Ação destrutiva** (arquivar, excluir, desativar) pede a senha de quem está
  logado, conferida no servidor (`exigirSenhaAdmin`).
- **Usuário que já registrou algo não pode ser excluído** (FK `restrict` —
  antes era `cascade` e apagava os lançamentos dele): desative. 🔴 Trocou a chave no Supabase? Regrave o segredo no
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
  sempre nula em disco. O bloqueio de CPF repetido usa `cpf_hash` (HMAC com a
  mesma chave) e vale para cadastro novo e troca de CPF (migration 001). **Sem
  índice único de propósito:** havia 8 grupos de CPF repetido na migração (um
  deles com 12 cadastros de terceiros no CPF de uma pessoa) — decisão do
  usuário pendente sobre juntar ou manter.
- **CSP em `src/start.ts` tem o host do Supabase fixo.** Trocar de projeto
  exige mudar lá, senão o navegador bloqueia o banco.
- `src/integrations/supabase/*` e `routeTree.gen.ts` vieram gerados pelo
  Lovable; o `routeTree.gen.ts` é regenerado pelo build.
- `db/migrations/` são as migrations nossas (001 login KF, 002 fecha o banco
  para o navegador), aplicadas pelo MCP do Supabase.
- `supabase/migrations/` é o histórico do Lovable. O que foi aplicado no
  kf-marmita é o mesmo, **exceto** o seed do usuário `admin@marmita.local` com
  senha fixa (removido).

## Design

Design system KF copiado de `kf-dashboard/src-shared` para `src/styles/kf-*.css`
(não editar lá — copiar de novo quando o original mudar). As variáveis do
shadcn (`--primary`, `--card`…) APONTAM para os tokens KF em `src/styles.css`,
então os componentes de `ui/` herdam a paleta sem mexer neles. Tema escuro:
`data-theme="dark"` + `localStorage.kfTema`, igual aos outros sistemas. Shell e
login com as mesmas classes do kf-garantia (`.kf-side`, `header.top`,
`.entrada`). ≤1100px a sidebar vira a navegação de baixo (uso em tablet).
