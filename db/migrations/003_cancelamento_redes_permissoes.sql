-- ============================================================================
-- 003 — CANCELAMENTO, REDES PERMITIDAS, PERMISSÕES POR USUÁRIO, BACKUP
-- ============================================================================
-- Pedidos do usuário (01/10). ADITIVA: o código que estava no ar continua
-- funcionando depois dela (colunas novas com padrão, nada removido).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) CANCELAR EM VEZ DE EXCLUIR
-- ---------------------------------------------------------------------------
-- O lançamento cancelado continua no banco (histórico, auditoria) e vai para
-- o kf-rh com `cancelado: true` e o motivo em `observacao` — o kf-rh já trata
-- os dois campos (não cobra o cancelado). Antes a única saída era excluir.
-- ⚠️ Os TOTAIS da rota do RH continuam contando os cancelados: o kf-rh soma
-- tudo o que recebe e compara com o total declarado (fontes.mjs, lerMarmitas)
-- — tirar os cancelados do total faria a conferência de lá acusar divergência.
alter table public.meal_records
  add column cancelado boolean not null default false,
  add column cancelado_em timestamptz,
  add column cancelado_por uuid references public.usuarios(id) on delete restrict,
  add column motivo_cancelamento text,
  add constraint meal_records_cancelamento_coerente check (
    (cancelado and cancelado_em is not null and motivo_cancelamento is not null)
    or (not cancelado and cancelado_em is null and motivo_cancelamento is null)
  );

-- ---------------------------------------------------------------------------
-- 2) REDES PERMITIDAS POR USUÁRIO
-- ---------------------------------------------------------------------------
-- Lista de IPs/faixas (CIDR, IPv4 e IPv6) de onde o usuário pode entrar e
-- continuar logado. Vazia/nula = qualquer rede. Pensada para o `operador`, que
-- entra sem 2FA: quem descobrir a senha não entra de fora da empresa.
alter table public.usuarios add column redes_permitidas text[];

-- ---------------------------------------------------------------------------
-- 3) PERMISSÕES POR USUÁRIO
-- ---------------------------------------------------------------------------
-- Antes uma regra só (app_permissions) valia para todos os não-admin. Agora
-- cada um tem a sua; app_permissions vira o PADRÃO copiado para quem for
-- criado depois. Admin ignora a coluna (pode tudo).
alter table public.usuarios add column permissoes jsonb;
update public.usuarios u
   set permissoes = (select to_jsonb(p) - 'id' - 'singleton' - 'created_at' - 'updated_at' from public.app_permissions p limit 1)
 where not u.admin;

-- ---------------------------------------------------------------------------
-- 4) ÍNDICES (advisor de desempenho)
-- ---------------------------------------------------------------------------
create index if not exists logs_acesso_usuario_id_idx on public.logs_acesso (usuario_id);
-- Nunca usado (a tela de Auditoria não filtra por tabela no banco).
drop index if exists public.idx_audit_logs_table_name;
-- ⚠️ idx_meal_types_supplier FICA, embora o advisor diga "não usado": é o
-- índice da chave estrangeira supplier_id — sem ele, excluir um fornecedor
-- varre meal_types inteira, e o próprio advisor passaria a acusar "FK sem
-- índice". Hoje não é usado só porque a tabela tem 4 linhas.

-- ---------------------------------------------------------------------------
-- 5) BACKUP DAS ASSINATURAS
-- ---------------------------------------------------------------------------
-- O backup diário do Supabase (plano Pro) NÃO inclui os arquivos do Storage.
-- O Worker kf-marmita-backup copia as assinaturas para o R2; esta função diz a
-- ele o que há de novo desde a última cópia. Só a service_role executa.
create or replace function public.assinaturas_para_backup(_depois timestamptz, _limite integer)
returns table (nome text, criado_em timestamptz, tamanho bigint, tipo text)
language sql stable security definer set search_path = ''
as $$
  select o.name, o.created_at, (o.metadata->>'size')::bigint, o.metadata->>'mimetype'
    from storage.objects o
   where o.bucket_id = 'meal-photos'
     and o.created_at > _depois
   order by o.created_at, o.name
   limit least(greatest(_limite, 1), 1000);
$$;
revoke execute on function public.assinaturas_para_backup(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.assinaturas_para_backup(timestamptz, integer) to service_role;
