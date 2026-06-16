-- Server-side idle session enforcement
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS profiles_last_activity_idx
  ON public.profiles (last_activity_at);

-- Returns expired=true if gap since last_activity_at exceeds _max_minutes.
-- Otherwise updates last_activity_at to now() and returns expired=false.
-- SECURITY DEFINER + auth.uid() — caller cannot spoof user_id.
CREATE OR REPLACE FUNCTION public.touch_and_check_idle(_max_minutes INT)
RETURNS TABLE(expired BOOLEAN, idle_seconds INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_last TIMESTAMPTZ;
  v_gap INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  SELECT last_activity_at INTO v_last FROM public.profiles WHERE id = v_uid;
  IF v_last IS NULL THEN
    UPDATE public.profiles SET last_activity_at = now() WHERE id = v_uid;
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  v_gap := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_last))::INT);

  IF v_gap > (_max_minutes * 60) THEN
    -- Do NOT touch — caller will be signed out
    RETURN QUERY SELECT true, v_gap;
    RETURN;
  END IF;

  UPDATE public.profiles SET last_activity_at = now() WHERE id = v_uid;
  RETURN QUERY SELECT false, v_gap;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_and_check_idle(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_and_check_idle(INT) TO authenticated;