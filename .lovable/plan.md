# 5/5 Segurança — Lockout no servidor + HttpOnly completo

## Parte 1 — Lockout no servidor (baixo risco, alto valor)

### Banco
- Nova tabela `public.login_attempts(id, username, ip, user_agent, success, attempted_at)`.
- GRANT só para `service_role` (consumida apenas por server fns admin).
- Índices por `(username, attempted_at)` e `(ip, attempted_at)`.
- Função `public.check_login_lockout(_username text, _ip text)` (SECURITY DEFINER) → retorna `{ locked: bool, retry_after_seconds: int, reason: 'username'|'ip'|null }`.
  - Janela: 15 min, limite 5 falhas por `username` **ou** por `ip`.
  - Conta apenas `success=false`.

### Server functions (em `src/lib/auth-lockout.functions.ts`)
- `checkLoginAllowed({ username })` (pública, sem auth) → consulta lockout antes do `signIn`. Captura IP via `getRequestIP`.
- Atualiza `logFailedLogin` em `audit.functions.ts` para também inserir em `login_attempts`.
- Novo `logSuccessfulLogin` (chamado após login OK) → insere com `success=true` (zera a contagem implicitamente porque só falhas são contadas, mas registra histórico).

### Frontend
- `LoginScreen` chama `checkLoginAllowed` antes do `signIn`. Se `locked`, mostra contador a partir de `retry_after_seconds` (fonte da verdade = servidor).
- Mantém o `login-lockout.ts` em localStorage apenas como cache de UX (não autoritativo).

---

## Parte 2 — Sessão em cookies HttpOnly (proxy de auth próprio)

### Arquitetura nova

```
Browser (sem JWT em JS)
   │  fetch / serverFn
   ▼
Server Function (lê cookie HttpOnly)
   │  Bearer token
   ▼
Supabase (Auth + Data API)
```

### Cookies emitidos pelo servidor
- `mc_at` — access_token. `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`.
- `mc_rt` — refresh_token. `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000` (30d).
- `mc_csrf` — token CSRF **legível por JS** (`HttpOnly=false`), para padrão double-submit. Front envia em header `x-csrf-token`; servidor compara com o cookie.

### Server functions / rotas novas
Arquivo `src/lib/session.functions.ts`:
- `loginWithPassword({ username, password })` — chama `checkLoginAllowed` → `supabaseAdmin.auth.signInWithPassword` → seta os 3 cookies → registra audit `LOGIN`.
- `logout()` — limpa cookies + audit `LOGOUT`. Não exige CSRF (idempotente, mas exige cookie presente).
- `refreshSession()` — usa `mc_rt` para gerar novo `mc_at` via `supabaseAdmin.auth.refreshSession`. Chamado automaticamente quando 401.
- `getCurrentUser()` — lê `mc_at` do cookie, valida via `supabaseAdmin.auth.getUser(token)`, retorna `{ user, profile, isAdmin }`. **Substitui** o `loadRoleAndProfile` do `auth.tsx`.

Helper `src/integrations/supabase/session.server.ts`:
- `getSessionFromCookies()` → lê `mc_at`/`mc_rt`, retorna client Supabase autenticado como o usuário (`createClient` com `Authorization: Bearer <at>` global header). Usado por todas as server fns no lugar de `requireSupabaseAuth`.
- `requireSession` middleware substitui `requireSupabaseAuth`. Faz refresh automático se `mc_at` expirado e `mc_rt` válido.

### Mudanças no `auth.tsx`
- Remove `supabase.auth.*` do client. Estado vem 100% de `getCurrentUser()` server fn.
- `signIn` → chama `loginWithPassword` server fn. Não toca em localStorage.
- `signOut` → chama `logout()` server fn + `queryClient.clear()` + navigate `/auth`.
- `verifyAdminPassword` → server fn nova que valida via `supabaseAdmin.auth.signInWithPassword` sem persistir cookies.
- Estado da sessão sincronizado via TanStack Query (`['session']`) com polling/`refetchOnWindowFocus`.

### Mudanças no `_authenticated/route.tsx`
- ⚠️ Arquivo é **integration-managed** (usa `supabase.auth.getUser()` client). Vou **substituí-lo** por gate baseado em `getCurrentUser()` server fn (chamada no `beforeLoad`, agora pode rodar em SSR porque cookie chega no header).
- Risco: futuras regenerações da integração podem sobrescrever. Adiciono comentário `// CUSTOMIZED — do not regenerate` no topo.

### Migração das queries client-side
Inventário: hoje componentes chamam `supabase.from(...)` diretamente em `funcionarios.tsx`, `funcionarios.$id.tsx`, `registrar.tsx`, `relatorio.tsx`, `fornecedores.tsx`, `usuarios.tsx`, `auditoria.tsx`, etc.

Duas opções:
- **(a) Tudo via server fn** (mais seguro, mais trabalho — ~15 fns novas).
- **(b) Wrapper Supabase client cookie-aware**: criar `src/integrations/supabase/client.ts` que injeta `Authorization` via um fetch interceptor que primeiro chama `/api/session/token` (server fn que devolve o `access_token` para uso na request — **vaza para JS, anula HttpOnly**). ❌ não atende ao requisito.

→ Vou pela **(a)**, mas em **fases**: nesta entrega faço auth + uma rota piloto (`funcionarios`) e deixo TODOs marcados nas outras. As demais continuam usando o client antigo temporariamente (que ainda funciona porque manterei o supabase-js para realtime e SDK queries que rodem com bearer obtido via `getCurrentUser` injetado).

Hmm — essa fase parcial não fecha o XSS-proof. **Recomendo fazer tudo de uma vez** para realmente atingir 5/5. Estimativa: ~15 server fns + ajuste dos 7 arquivos de rota. Vou prosseguir assim salvo objeção.

### CSRF
- Toda server fn de mutação valida `x-csrf-token` header contra cookie `mc_csrf`. TanStack `attachCsrfToken` middleware client-side adiciona o header automaticamente.

### Inatividade
- `use-inactivity-logout.ts` continua igual mas chama o novo `signOut` (server fn).

---

## Arquivos afetados

**Novos:**
- `supabase/migrations/...` (login_attempts + check_login_lockout)
- `src/lib/auth-lockout.functions.ts`
- `src/lib/session.functions.ts`
- `src/integrations/supabase/session.server.ts`
- `src/lib/csrf.ts` + middleware client/server

**Reescritos:**
- `src/lib/auth.tsx` (remove uso direto do supabase-js)
- `src/routes/_authenticated/route.tsx` (gate via cookie)
- `src/components/LoginScreen.tsx` (usa novas fns)
- `src/lib/audit.functions.ts` (migrado para `requireSession`)
- `src/lib/admin-users.functions.ts` (idem)
- `src/lib/security-metrics.functions.ts` (idem)
- 7 rotas de dados (`funcionarios*`, `registrar`, `relatorio`, `fornecedores`, `usuarios`, `auditoria`, `seguranca`) — substituir `supabase.from(...)` por server fns ou client autenticado server-side.
- `src/start.ts` (registrar CSRF middleware; remover `attachSupabaseAuth`).

**Mantido:** `supabase/client.ts` apenas para storage (upload de foto via signed URL) — sem auth persistente.

---

## Riscos e observações

1. **Edição de arquivo integration-managed** (`_authenticated/route.tsx`): pode ser sobrescrito em mudanças futuras da integração. Documentado com comentário.
2. **Realtime** (`supabase.channel`): exige token válido client-side. Se você usar realtime no futuro, será necessário endpoint que devolva token efêmero. Hoje o app não usa, então sem impacto.
3. **Storage de meal-photos**: continuará via signed URLs gerados em server fn — sem token no browser.
4. **Inatividade**: timer continua client-side; ao expirar, server fn `logout` limpa cookies.
5. **Custo de roundtrip**: cada query agora passa pelo Worker (latência +50–150ms). Aceitável para um app interno.

## Confirmação

Confirma que devo:
- (a) implementar **tudo** numa entrega só (auth + lockout + migração completa das 7 rotas), ou
- (b) entregar em **2 fases** (fase 1: lockout no servidor + infraestrutura HttpOnly + auth.tsx; fase 2: migrar rotas de dados — durante a fase 1 o app pode quebrar temporariamente nas rotas não migradas)?

Recomendo (a) apesar de ser uma entrega grande, porque (b) deixa janela com sessão inconsistente.