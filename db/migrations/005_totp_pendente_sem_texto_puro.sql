-- ============================================================================
-- 005 — 2FA: o secret pendente não fica mais em texto puro (01/10)
-- ============================================================================
-- O padrão KF (copiado de kf-garantia) só marcava o QR pendente como vencido
-- depois da confirmação: o secret TOTP ficava para sempre em texto puro em
-- totp_setup_temp, anulando a cifra AES-GCM do definitivo em usuarios.
-- O código agora (src/server/sessao.ts) grava o pendente cifrado, deixa um só
-- por usuário e o APAGA ao confirmar. Aqui: some com o que já estava lá.
-- ============================================================================

delete from public.totp_setup_temp where expira_em <= now();
