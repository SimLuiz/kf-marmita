-- ============================================================================
-- 002 — O NAVEGADOR NÃO FALA MAIS COM O BANCO
-- ============================================================================
-- Aplicada junto com o deploy do código que passa tudo pelo Worker (login KF,
-- server functions com service_role). Corrige o que o scan de segurança do
-- Lovable marcou como CRÍTICO ("Some access rules let everyone through", 6
-- tabelas): as políticas `using (true)` deixavam qualquer usuário logado ler e
-- gravar tudo com a chave pública, direto do navegador, pulando as regras da tela.
--
-- Desenho igual ao do kf-garantia/kf-dashboard: RLS LIGADA e SEM política em
-- todas as tabelas, nenhum privilégio para anon/authenticated. Só a
-- service_role (o Worker) enxerga — e ela ignora RLS.
-- ============================================================================

-- 1) Todas as políticas das tabelas públicas e as do bucket de assinaturas
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
  for r in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects' and policyname ilike '%meal%' loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

-- 2) Nenhum privilégio para os papéis do navegador — inclusive nos objetos
--    que forem criados depois (default privileges).
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
revoke usage on schema private from authenticated;
revoke execute on function private.decrypt_cpf(bytea) from authenticated;

-- RLS ligada em tudo (as tabelas do Lovable já estavam; garante as demais).
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- 3) Restos do login do Supabase Auth (substituído por usuarios/sessoes)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.app_perm(text);
drop function if exists public.touch_and_check_idle(integer);
drop function if exists public.check_login_lockout(text, text);
-- profiles/user_roles: o conteúdo foi para `usuarios` na 001.
drop table if exists public.user_roles;
drop table if exists public.profiles;
drop function if exists public.has_role(uuid, public.app_role);
drop type if exists public.app_role;
-- As contas antigas do Supabase Auth não servem para mais nada (e não abrem
-- nada: authenticated não tem privilégio algum). Removidas para não sobrar
-- porta nenhuma.
delete from auth.users;
