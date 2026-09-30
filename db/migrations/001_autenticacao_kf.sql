-- ============================================================================
-- 001 — AUTENTICAÇÃO NO PADRÃO KF (usuário/senha + 2FA TOTP + sessão no Worker)
-- ============================================================================
-- Pedido do usuário (30/09): mesmo padrão do kf-garantia/kf-dashboard, com uma
-- exceção — o usuário `operador` fica SEM 2FA (acesso rápido no balcão).
-- Esquema copiado de kf-garantia/db/migrations/046_autenticacao_multiusuario.sql;
-- a diferença é o login por NOME DE USUÁRIO (as contas daqui não têm e-mail) e
-- a coluna `exige_2fa`.
--
-- ⚠️ Esta migration é ADITIVA: o app antigo (Supabase Auth no navegador) segue
-- funcionando depois dela. Quem fecha o acesso direto ao banco é a 002, aplicada
-- junto com o deploy do código novo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) usuarios / totp_setup_temp / sessoes / logs_acesso
-- ---------------------------------------------------------------------------
create table public.usuarios (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  usuario          text not null unique check (usuario ~ '^[a-z0-9_.-]{3,32}$'),
  senha_hash       text not null,
  ativo            boolean not null default true,
  admin            boolean not null default false,
  -- Admin SEMPRE exige 2FA (o Worker ignora esta coluna para admin). Para os
  -- demais, o admin liga/desliga na tela Usuários.
  exige_2fa        boolean not null default true,
  totp_secret      text,
  totp_confirmado  boolean not null default false,
  totp_ultimo_uso  bigint,          -- guarda de replay do código TOTP
  criado_em        timestamptz not null default now(),
  ultimo_acesso    timestamptz
);

create table public.totp_setup_temp (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  secret      text not null,
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null default now() + interval '10 minutes'
);
create index on public.totp_setup_temp (usuario_id);

-- Token em texto puro só no cookie; aqui fica o HASH (SHA-256). Quem só LÊ o
-- banco não consegue montar um cookie válido.
create table public.sessoes (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references public.usuarios(id) on delete cascade,
  token             text unique not null,
  ip                text,
  dispositivo       text,
  criado_em         timestamptz not null default now(),
  expira_em         timestamptz not null,
  ultima_atividade  timestamptz,
  ativo             boolean not null default true
);
create index on public.sessoes (usuario_id);

create table public.logs_acesso (
  id          bigserial primary key,
  usuario_id  uuid references public.usuarios(id) on delete set null,
  usuario     text,
  ip          text,
  acao        text,   -- login_ok | login_falha | login_bloqueado | login_antirrobo | logout | 2fa_* | admin_*
  detalhe     text,
  criado_em   timestamptz not null default now()
);
create index on public.logs_acesso (criado_em desc);
create index on public.logs_acesso (ip, acao, criado_em desc);
create index on public.logs_acesso (usuario, acao, criado_em desc);

-- RLS ligada e SEM política: só a service_role (o Worker) enxerga.
alter table public.usuarios        enable row level security;
alter table public.totp_setup_temp enable row level security;
alter table public.sessoes         enable row level security;
alter table public.logs_acesso     enable row level security;
revoke all on table public.usuarios, public.totp_setup_temp, public.sessoes, public.logs_acesso
  from public, anon, authenticated;
revoke all on sequence public.logs_acesso_id_seq from public, anon, authenticated;
grant all on table public.usuarios, public.totp_setup_temp, public.sessoes, public.logs_acesso to service_role;
grant all on sequence public.logs_acesso_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- 2) Senha — bcrypt via pgcrypto (mesmas funções do kf-dashboard/kf-garantia)
-- ---------------------------------------------------------------------------
create or replace function public.hash_senha(senha text)
returns text language sql security definer set search_path = '' as $$
  select extensions.crypt(senha, extensions.gen_salt('bf', 10));
$$;
create or replace function public.verificar_senha(senha text, hash text)
returns boolean language sql security definer set search_path = '' as $$
  select hash = extensions.crypt(senha, hash);
$$;
revoke execute on function public.hash_senha(text) from public, anon, authenticated;
revoke execute on function public.verificar_senha(text, text) from public, anon, authenticated;
grant execute on function public.hash_senha(text) to service_role;
grant execute on function public.verificar_senha(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3) Os 4 usuários do Lovable → usuarios, com o MESMO id e a MESMA senha
-- ---------------------------------------------------------------------------
-- 🔑 O Supabase Auth guarda a senha em bcrypt ($2a$10$), o mesmo formato de
-- hash_senha — `verificar_senha` aceita o hash como está, então ninguém
-- precisa trocar de senha na virada. O id é o mesmo porque é ele que está em
-- owner_id dos lançamentos e dos cadastros.
insert into public.usuarios (id, nome, usuario, senha_hash, ativo, admin, exige_2fa, criado_em, ultimo_acesso)
select p.id,
       initcap(p.username),
       lower(p.username),
       u.encrypted_password,
       coalesce(u.banned_until, now() - interval '1 second') <= now(),
       exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin'),
       lower(p.username) <> 'operador',   -- pedido do usuário: só o operador sem 2FA
       p.created_at,
       u.last_sign_in_at
from public.profiles p
join auth.users u on u.id = p.id;

-- ---------------------------------------------------------------------------
-- 4) owner_id passa a apontar para usuarios (não mais auth.users)
-- ---------------------------------------------------------------------------
-- ⚠️ ON DELETE RESTRICT de propósito: o original era CASCADE — excluir um
-- usuário apagava todos os lançamentos que ele registrou (3.589, no caso do
-- operador). Usuário que registrou algo é DESATIVADO, nunca excluído.
alter table public.employees    drop constraint if exists employees_owner_id_fkey;
alter table public.meal_records drop constraint if exists meal_records_owner_id_fkey;
alter table public.employees    add constraint employees_owner_id_fkey
  foreign key (owner_id) references public.usuarios(id) on delete restrict;
alter table public.meal_records add constraint meal_records_owner_id_fkey
  foreign key (owner_id) references public.usuarios(id) on delete restrict;
-- suppliers/meal_types ficam SEM chave estrangeira, como sempre foram: 1
-- fornecedor e 2 tipos foram criados no Lovable por um usuário que não existe
-- mais, e a chave recusaria essas linhas.

-- ---------------------------------------------------------------------------
-- 5) Auditoria: quem agiu vem do cabeçalho que o Worker manda
-- ---------------------------------------------------------------------------
-- Com o acesso só pelo Worker (service_role), auth.uid() é sempre nulo. O
-- Worker manda `x-kf-usuario` (id) e `x-kf-ip` em toda chamada, e o PostgREST
-- expõe os cabeçalhos em `request.headers`. Ninguém de fora forja isso: depois
-- da 002, só a service_role alcança o banco.
create or replace function public.log_table_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_headers  json;
  v_user_id  uuid := auth.uid();
  v_username text;
  v_ip       text;
  v_old jsonb; v_new jsonb; v_record_id text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then v_headers := null;
  end;
  if v_user_id is null and v_headers is not null then
    begin
      v_user_id := nullif(v_headers->>'x-kf-usuario', '')::uuid;
    exception when others then v_user_id := null;
    end;
  end if;
  v_ip := v_headers->>'x-kf-ip';
  if v_user_id is not null then
    select usuario into v_username from public.usuarios where id = v_user_id;
  end if;

  if tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_new := null;
    v_record_id := coalesce(v_old->>'id', '');
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    v_record_id := coalesce(v_new->>'id', '');
  else
    v_old := null; v_new := to_jsonb(new);
    v_record_id := coalesce(v_new->>'id', '');
  end if;
  -- O CPF criptografado não entra na trilha (é bytea ilegível e só incha o log).
  v_old := v_old - 'cpf_encrypted' - 'cpf_hash';
  v_new := v_new - 'cpf_encrypted' - 'cpf_hash';

  insert into public.audit_logs (user_id, username, action, table_name, record_id, old_data, new_data, ip_address)
  values (v_user_id, v_username, tg_op, tg_table_name, v_record_id, v_old, v_new, v_ip);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function public.log_table_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) CPF duplicado — o bloqueio que nunca funcionou
-- ---------------------------------------------------------------------------
-- O índice único antigo era sobre `cpf`, que o gatilho zera sempre: nunca viu
-- um CPF. Agora há `cpf_hash` = HMAC-SHA256 dos 11 dígitos com a MESMA chave do
-- Vault — igual para o mesmo CPF, inútil para quem não tem a chave.
-- ⚠️ SEM índice único: já existem 8 grupos de CPF repetido (um deles, 12
-- cadastros de terceiros no mesmo CPF). O gatilho bloqueia CPF repetido em
-- cadastro NOVO e em TROCA de CPF; os existentes ficam até serem revistos.
drop index if exists public.employees_cpf_unique_idx;
alter table public.employees add column if not exists cpf_hash text;
create index if not exists employees_cpf_hash_idx on public.employees (cpf_hash);

create or replace function private.hash_cpf(_cpf text)
returns text language plpgsql security definer stable set search_path = '' as $$
declare k text; d text;
begin
  d := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
  if d = '' then return null; end if;
  select private.get_cpf_key() into k;
  if k is null then raise exception 'CPF encryption key not configured'; end if;
  return encode(extensions.hmac(d, k, 'sha256'), 'hex');
end $$;
revoke all on function private.hash_cpf(text) from public, anon, authenticated;

-- Sem o gatilho de auditoria: o preenchimento viraria 210 "UPDATE" falsos.
alter table public.employees disable trigger audit_employees;
update public.employees
   set cpf_hash = private.hash_cpf(private.decrypt_cpf(cpf_encrypted))
 where cpf_encrypted is not null;
alter table public.employees enable trigger audit_employees;

create or replace function public.encrypt_employee_cpf()
returns trigger language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  if tg_op = 'INSERT' or new.cpf is distinct from old.cpf then
    if new.cpf is null or new.cpf = '' then
      if tg_op = 'UPDATE' then
        new.cpf_encrypted := null;
        new.cpf_hash := null;
      end if;
    else
      h := private.hash_cpf(new.cpf);
      -- Só barra quando o CPF MUDA (ou é cadastro novo): editar o nome de quem
      -- já está num grupo repetido não pode falhar por causa do grupo.
      if (tg_op = 'INSERT' or h is distinct from old.cpf_hash)
         and exists (select 1 from public.employees e where e.cpf_hash = h and e.id <> new.id) then
        raise exception 'cpf_duplicado' using errcode = '23505';
      end if;
      new.cpf_encrypted := private.encrypt_cpf(new.cpf);
      new.cpf_hash := h;
    end if;
  end if;
  new.cpf := null;  -- nunca em repouso
  return new;
end $$;
revoke execute on function public.encrypt_employee_cpf() from public, anon, authenticated;
