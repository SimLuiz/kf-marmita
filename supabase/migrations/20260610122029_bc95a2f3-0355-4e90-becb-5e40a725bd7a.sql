-- 1. Extensão e schema privado
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- 2. Chave de criptografia no Supabase Vault (gerada uma vez)
do $$
declare
  v_exists boolean;
begin
  select exists(select 1 from vault.secrets where name = 'cpf_encryption_key') into v_exists;
  if not v_exists then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'cpf_encryption_key',
      'AES key for employees.cpf encryption (managed by app)'
    );
  end if;
end $$;

-- 3. Funções de criptografia (acesso ao Vault apenas via SECURITY DEFINER)
create or replace function private.get_cpf_key()
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'cpf_encryption_key'
  limit 1
$$;
revoke all on function private.get_cpf_key() from public, anon, authenticated;

create or replace function private.encrypt_cpf(_cpf text)
returns bytea
language plpgsql
security definer
set search_path = ''
as $$
declare k text;
begin
  if _cpf is null or _cpf = '' then return null; end if;
  select private.get_cpf_key() into k;
  if k is null then raise exception 'CPF encryption key not configured'; end if;
  return extensions.pgp_sym_encrypt(_cpf, k);
end $$;
revoke all on function private.encrypt_cpf(text) from public, anon, authenticated;

create or replace function private.decrypt_cpf(_data bytea)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare k text;
begin
  if _data is null then return null; end if;
  select private.get_cpf_key() into k;
  if k is null then return null; end if;
  return extensions.pgp_sym_decrypt(_data, k);
exception when others then
  return null;
end $$;
revoke all on function private.decrypt_cpf(bytea) from public, anon, authenticated;
-- Authenticated pode decriptar (workspace compartilhado, RLS na tabela controla acesso à linha)
grant execute on function private.decrypt_cpf(bytea) to authenticated;
grant execute on function private.decrypt_cpf(bytea) to service_role;

-- 4. Coluna criptografada + backfill
alter table public.employees add column if not exists cpf_encrypted bytea;

update public.employees
set cpf_encrypted = private.encrypt_cpf(cpf)
where cpf is not null and cpf <> '' and cpf_encrypted is null;

-- 5. Trigger: encripta e zera o plaintext em INSERT/UPDATE
create or replace function public.encrypt_employee_cpf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.cpf is not null and new.cpf <> '' then
      new.cpf_encrypted := private.encrypt_cpf(new.cpf);
    end if;
  elsif tg_op = 'UPDATE' then
    -- só re-encripta se o campo cpf foi passado nessa operação
    if new.cpf is distinct from old.cpf then
      if new.cpf is null or new.cpf = '' then
        new.cpf_encrypted := null;
      else
        new.cpf_encrypted := private.encrypt_cpf(new.cpf);
      end if;
    end if;
  end if;
  new.cpf := null;  -- nunca em repouso
  return new;
end $$;

drop trigger if exists trg_encrypt_employee_cpf on public.employees;
create trigger trg_encrypt_employee_cpf
before insert or update on public.employees
for each row execute function public.encrypt_employee_cpf();

-- 6. Zera o plaintext residual
update public.employees set cpf = null where cpf is not null;

-- 7. View de leitura com CPF decriptado (security_invoker respeita RLS da tabela)
drop view if exists public.employees_view;
create view public.employees_view
with (security_invoker = true) as
select
  e.id,
  e.owner_id,
  e.name,
  e.company,
  e.created_at,
  private.decrypt_cpf(e.cpf_encrypted) as cpf
from public.employees e;

grant select on public.employees_view to authenticated;
grant select on public.employees_view to service_role;