CREATE OR REPLACE FUNCTION public.touch_and_check_idle(_max_minutes integer)
 RETURNS TABLE(expired boolean, idle_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_last TIMESTAMPTZ;
  v_iat TIMESTAMPTZ;
  v_baseline TIMESTAMPTZ;
  v_gap INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  -- JWT issued-at: qualquer login novo reinicia a base de inatividade
  BEGIN
    v_iat := to_timestamp((auth.jwt() ->> 'iat')::bigint);
  EXCEPTION WHEN OTHERS THEN
    v_iat := NULL;
  END;

  SELECT last_activity_at INTO v_last FROM public.profiles WHERE id = v_uid;

  -- Se o token atual foi emitido depois do último "activity", a sessão é nova
  -- (ou o registro antigo é irrelevante) — reseta e retorna não-expirado.
  IF v_last IS NULL OR (v_iat IS NOT NULL AND v_iat > v_last) THEN
    UPDATE public.profiles SET last_activity_at = now() WHERE id = v_uid;
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  v_baseline := v_last;
  v_gap := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_baseline))::INT);

  IF v_gap > (_max_minutes * 60) THEN
    RETURN QUERY SELECT true, v_gap;
    RETURN;
  END IF;

  UPDATE public.profiles SET last_activity_at = now() WHERE id = v_uid;
  RETURN QUERY SELECT false, v_gap;
END;
$function$;