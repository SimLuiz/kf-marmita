REVOKE EXECUTE ON FUNCTION public.check_login_lockout(text, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.check_login_lockout(text, text) TO service_role;