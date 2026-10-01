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
bun test           # testes (tests/) — rodam sozinhos antes de todo deploy
bun run deploy     # tsc + testes + vite build + wrangler deploy da config gerada
```

⚠️ **O deploy usa `.output/server/wrangler.json`, gerado pelo build a partir do
`wrangler.jsonc`.** Para `wrangler secret put`, use `--name kf-marmita`.
⚠️ **Teste falhou = deploy não sai** (`bun run verificar` vem antes). Não pule.

Segredos no cofre do Worker: `SUPABASE_SERVICE_ROLE_KEY`, `RH_API_KEY` (= o
`MARMITAS_TOKEN` do kf-rh; trocada em 01/10), `TOTP_ENC_KEY` e `TURNSTILE_SECRET`
(widget próprio "KF Marmita Login", sitekey `0x4AAAAAAFKUR2dSPnQ84ziX` no `.env` —
hostnames marmita.kfsistema.com.br, 127.0.0.1 e localhost). Local: os mesmos
nomes em `.dev.vars`, exportados antes do `bun run dev`.

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
  🔴 **QR pendente (`totp_setup_temp`) é gravado cifrado, um por usuário, e
  APAGADO ao confirmar** (migration 005). O padrão KF original só o marcava
  como vencido — o secret ficava para sempre em texto puro, anulando a cifra
  do definitivo. Corrigido do mesmo jeito no kf-garantia, kf-rh e kf-dashboard
  em 01/10 (as 7 cópias abertas que havia lá foram apagadas).
  **Senha:** só o admin troca senha — a dos demais pela tela Usuários, a
  própria pelo "Trocar minha senha" (que só aparece para admin; o servidor
  recusa os demais). Usuário comum não escolhe a própria senha (pedido do
  usuário: evitar senha fácil).
- **Redes da empresa** (migration 004, pedido de 01/10): uma lista única em
  `config_acesso.redes_empresa` + o interruptor `usuarios.acesso_qualquer_rede`
  ("Pode entrar de qualquer rede" — o admin, por exemplo). Quem não o tem só
  entra, e só continua logado, de uma rede da lista: conferido no login e em
  toda chamada (`verificarSessao`). Regra pura em `src/lib/rede.ts`
  (`acessoPermitido`), testada. **Lista vazia = ninguém restrito**, de
  propósito. O admin não consegue se trancar para fora (o servidor recusa).
  A lista é lida com cache de 1 min por instância do Worker. A coluna
  `usuarios.redes_permitidas` (003) ficou sem uso — pode ser removida.
- **Permissões por usuário** (`usuarios.permissoes`, jsonb): cada chave vale
  para aquele usuário; sem a chave, cai no padrão de `app_permissions`. Admin
  pode tudo. Usuário novo nasce com uma cópia do padrão.
- **Auditoria:** o gatilho `log_table_change` lê o autor de `x-kf-usuario`/
  `x-kf-ip`, que `banco()` (`src/server/banco.ts`) manda em toda chamada. Usar
  `banco()` SEM o usuário numa gravação = alteração sem autor na trilha.
- **Preço vem sempre do tipo de marmita, no servidor** — nunca do navegador.
- **Ação destrutiva** (arquivar, cancelar, reativar, desativar, redes…) pede a
  senha de quem está logado, conferida no servidor (`exigirSenhaAdmin`).
  `tests/estrutura.test.ts` reprova o build se uma função nova escapar disso
  ou ficar sem `comSessao`/`soAdmin`.
- **Lançamento não se exclui, se CANCELA** (migration 003): `cancelado`,
  `cancelado_em`, `cancelado_por`, `motivo_cancelamento`. Some dos totais da
  tela, continua no histórico (riscado) e vai ao RH marcado — ver o contrato.
- **Usuário que já registrou algo não pode ser excluído** (FK `restrict` —
  antes era `cascade` e apagava os lançamentos dele): desative. 🔴 Trocou a chave no Supabase? Regrave o segredo no
Worker na hora — senão toda consulta de servidor falha com `falha_na_consulta`
(aconteceu em 30/09).

## Contrato com o kf-rh — não quebrar

`GET /api/public/rh/marmitas?inicio=AAAA-MM-DD&fim=AAAA-MM-DD` com
`Authorization: Bearer <RH_API_KEY>` (`src/routes/api/public/rh/marmitas.ts`;
peças puras em `src/lib/rh.ts`, testadas).
O kf-rh depende de: `id` estável por lançamento, `momento` ISO com fuso, `cpf` só
dígitos ou null, `tipo` = `meal_types.key` (chave estável, não o rótulo),
totais calculados no servidor, `fim` inclusivo, e (01/10) `cancelado` +
`observacao` (o motivo). ⚠️ **Os totais INCLUEM os cancelados**: o kf-rh soma
tudo o que recebe e confere com os totais; quem deixa de cobrar o cancelado é
ele. Mudou algo aqui? Compare com o espelho do kf-rh (`marmita_lancamento`).
- **Quem chama:** o Worker `kf-rh` pela service binding `MARMITAS` (chega sem
  `CF-Connecting-IP`), ou um IP das **redes da empresa** (os scripts do kf-rh
  no PC do TI). De fora: 403 `origem_nao_permitida`. Sem CORS, de propósito.
- **Trocar a chave:** grave a nova em `RH_API_KEY` e a velha em
  `RH_API_KEY_ANTERIOR` (as duas valem), atualize o `MARMITAS_TOKEN` do kf-rh
  (cofre do Worker + `kf-rh/.dev.vars`) e só então apague a anterior.
- Tudo fica em `logs_acesso` (`rh_consulta`, `rh_chave_recusada`,
  `rh_origem_recusada`) — aparece em Usuários → Atividade.

## Relatórios

- **Competência = 26 do mês anterior a 25 do mês** (igual à folha do kf-rh) —
  padrão do seletor de período (`src/components/SeletorPeriodo.tsx`,
  `competencia()` em `src/lib/formatos.ts`, testada).
- **Conferência fornecedor** (`src/routes/conferencia.tsx`): quantidade por dia
  × tipo para bater com a nota de cada fornecedor; cancelados fora.
- ⚠️ Às vezes o operador lança marmitas de **vários dias no mesmo dia** (aviso
  do usuário): o momento gravado é o do registro, não o do consumo.

## Backup das assinaturas

O backup diário do Supabase não inclui os arquivos do Storage. O Worker
separado `backup/` (`kf-marmita-backup`) copia cada assinatura nova para o R2
(`kf-marmita-assinaturas`) a cada 15 min, só acrescentando, pela função
`assinaturas_para_backup` (migration 003). Deploy:
`cd backup && npx wrangler deploy --config wrangler.jsonc` (o `--config` é
obrigatório). ⚠️ Depende do R2 ativado na conta (painel da Cloudflare).

## Armadilhas

- **CPF é criptografado no banco** (gatilho `encrypt_employee_cpf` + chave no
  Vault `cpf_encryption_key`). Leia pela `employees_view`. A coluna `cpf` fica
  sempre nula em disco. O bloqueio de CPF repetido usa `cpf_hash` (HMAC com a
  mesma chave) e vale para cadastro novo e troca de CPF (migration 001). **Sem
  índice único de propósito:** ainda há CPF compartilhado (grupo Paulo Faria) —
  decisão do usuário pendente.
- **Regex: edite só com a ferramenta Edit.** sed/`node -e` no Git Bash já
  comeram a barra invertida (`/\D/g` virou `/D/g` e travou o Salvar em
  produção). O teste `REGEX_SEM_BARRA` pega o caso.
- **CSP em `src/start.ts` tem o host do Supabase fixo.** Trocar de projeto
  exige mudar lá, senão o navegador bloqueia o banco.
- `src/integrations/supabase/*` e `routeTree.gen.ts` vieram gerados pelo
  Lovable; o `routeTree.gen.ts` é regenerado pelo build.
- `db/migrations/` são as migrations nossas (001 login KF, 002 fecha o banco
  para o navegador, 003 cancelamento/permissões/backup, 004 redes da empresa,
  005 2FA pendente), aplicadas pelo MCP do Supabase.
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
