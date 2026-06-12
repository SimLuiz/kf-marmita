CREATE TABLE public.login_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.login_attempts TO service_role;

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Sem policies: ninguém além do service_role acessa.

CREATE INDEX idx_login_attempts_username_time ON public.login_attempts (username, attempted_at DESC);
CREATE INDEX idx_login_attempts_ip_time ON public.login_attempts (ip, attempted_at DESC);

CREATE OR REPLACE FUNCTION public.check_login_lockout(_username TEXT, _ip TEXT)
RETURNS TABLE(locked BOOLEAN, retry_after_seconds INT, reason TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window INTERVAL := INTERVAL '15 minutes';
  v_max INT := 5;
  v_user_fail_count INT := 0;
  v_ip_fail_count INT := 0;
  v_oldest_user TIMESTAMPTZ;
  v_oldest_ip TIMESTAMPTZ;
  v_retry INT := 0;
  v_reason TEXT := NULL;
BEGIN
  IF _username IS NOT NULL AND length(_username) > 0 THEN
    SELECT count(*), min(attempted_at) INTO v_user_fail_count, v_oldest_user
    FROM public.login_attempts
    WHERE lower(username) = lower(_username)
      AND success = false
      AND attempted_at > now() - v_window;
  END IF;

  IF _ip IS NOT NULL AND length(_ip) > 0 THEN
    SELECT count(*), min(attempted_at) INTO v_ip_fail_count, v_oldest_ip
    FROM public.login_attempts
    WHERE ip = _ip
      AND success = false
      AND attempted_at > now() - v_window;
  END IF;

  IF v_user_fail_count >= v_max THEN
    v_retry := GREATEST(0, EXTRACT(EPOCH FROM (v_oldest_user + v_window - now()))::INT);
    v_reason := 'username';
    RETURN QUERY SELECT true, v_retry, v_reason;
    RETURN;
  END IF;

  IF v_ip_fail_count >= v_max THEN
    v_retry := GREATEST(0, EXTRACT(EPOCH FROM (v_oldest_ip + v_window - now()))::INT);
    v_reason := 'ip';
    RETURN QUERY SELECT true, v_retry, v_reason;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, 0, NULL::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_login_lockout(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_lockout(TEXT, TEXT) TO service_role;