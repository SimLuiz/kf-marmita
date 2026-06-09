
-- Audit logs table
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  username TEXT,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX idx_audit_logs_table_name ON public.audit_logs (table_name);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- No client INSERT/UPDATE/DELETE (writes only via triggers / service_role)

-- Generic trigger function: captures user from auth.uid()
CREATE OR REPLACE FUNCTION public.log_table_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_username TEXT;
  v_record_id TEXT;
  v_old JSONB;
  v_new JSONB;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT username INTO v_username FROM public.profiles WHERE id = v_user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := COALESCE((v_old->>'id'), '');
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE((v_new->>'id'), '');
  ELSE
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE((v_new->>'id'), '');
  END IF;

  INSERT INTO public.audit_logs (user_id, username, action, table_name, record_id, old_data, new_data)
  VALUES (v_user_id, v_username, TG_OP, TG_TABLE_NAME, v_record_id, v_old, v_new);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Attach triggers to all business tables
CREATE TRIGGER audit_employees
AFTER INSERT OR UPDATE OR DELETE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.log_table_change();

CREATE TRIGGER audit_meal_records
AFTER INSERT OR UPDATE OR DELETE ON public.meal_records
FOR EACH ROW EXECUTE FUNCTION public.log_table_change();

CREATE TRIGGER audit_meal_types
AFTER INSERT OR UPDATE OR DELETE ON public.meal_types
FOR EACH ROW EXECUTE FUNCTION public.log_table_change();

CREATE TRIGGER audit_suppliers
AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.log_table_change();

CREATE TRIGGER audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.log_table_change();

CREATE TRIGGER audit_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.log_table_change();
