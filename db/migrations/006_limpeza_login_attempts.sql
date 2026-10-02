-- ============================================================================
-- 006 — limpeza (ideia 6, aprovada em 01/10)
-- ============================================================================
-- 1. `login_attempts` era o log de login do Lovable: nada mais grava nem lê
--    (o login KF usa `logs_acesso`; a limpeza da tela Armazenamento já mira
--    `logs_acesso`). Os 174 registros (17/07 a 30/09) NÃO se perdem: viram
--    histórico em `logs_acesso`, marcados "sistema antigo (Lovable)", e
--    aparecem em Usuários → Atividade. Ficam fora das travas por IP/usuário
--    (que só olham os últimos minutos/24 h).
-- 2. `usuarios.redes_permitidas` (003) ficou sem uso com a 004 (redes da
--    empresa + acesso_qualquer_rede) e estava vazia em todos os usuários.
-- Conferido antes: nenhuma função, view, FK ou gatilho cita os dois.
-- ============================================================================

insert into public.logs_acesso (criado_em, usuario, ip, acao, detalhe)
select attempted_at,
       username,
       ip,
       case when success then 'login_ok' else 'login_falha' end,
       left('sistema antigo (Lovable)' || coalesce(' · ' || nullif(user_agent, ''), ''), 300)
  from public.login_attempts;

drop table public.login_attempts;

alter table public.usuarios drop column redes_permitidas;
