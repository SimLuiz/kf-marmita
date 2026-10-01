-- ============================================================================
-- 004 — REDES DA EMPRESA (lista única) + "pode entrar de qualquer rede"
-- ============================================================================
-- Pedido do usuário (01/10), refinando a 003: em vez de digitar redes usuário
-- por usuário, a empresa tem UMA lista de redes, e cada usuário tem um
-- interruptor "pode entrar de qualquer rede" (o admin, por exemplo). Quem não
-- tem o interruptor ligado só entra — e só continua logado — a partir de uma
-- rede da lista.
-- ⚠️ Lista VAZIA = ninguém é restrito (não dá para trancar todo mundo para
-- fora por engano). Regra em src/lib/rede.ts (acessoPermitido), testada.
-- ============================================================================

create table public.config_acesso (
  singleton      boolean primary key default true check (singleton),
  redes_empresa  text[] not null default '{}',
  atualizado_em  timestamptz not null default now()
);
alter table public.config_acesso enable row level security;
revoke all on table public.config_acesso from public, anon, authenticated;
grant all on table public.config_acesso to service_role;

-- As redes da empresa, medidas nos logins de jul–set/2026 (operador, admin,
-- eder, luiz e o PC do TI): três saídas de internet + a faixa IPv6 de uma
-- delas. Ficaram FORA, por aparecerem 1 ou 2 vezes só (casa/celular?):
-- 2804:14c:6543:45c2::/64 e 45.181.73.x. Ajustável na tela Usuários.
insert into public.config_acesso (redes_empresa)
values (array['200.10.135.16', '177.73.89.230', '177.235.48.159', '2804:1874:a033:bd00::/64']);

alter table public.usuarios add column acesso_qualquer_rede boolean not null default false;
-- Admin entra de qualquer lugar; os demais, só da empresa.
update public.usuarios set acesso_qualquer_rede = admin;

-- A lista por usuário da 003 FICA, sem uso (nunca foi ao ar; só teve dado de
-- teste). O `drop column` pede confirmação no MCP do Supabase, e a
-- confirmação expirava — removível depois, à mão.
comment on column public.usuarios.redes_permitidas is 'SEM USO desde a migration 004 (substituída por config_acesso.redes_empresa + acesso_qualquer_rede). Pode ser removida.';
