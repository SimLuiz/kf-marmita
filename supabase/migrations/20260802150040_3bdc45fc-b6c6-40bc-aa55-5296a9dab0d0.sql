ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS sector text;

DROP VIEW IF EXISTS public.employees_view;
CREATE VIEW public.employees_view
WITH (security_invoker = true) AS
SELECT id, owner_id, name, company, sector, created_at, archived_at,
       private.decrypt_cpf(cpf_encrypted) AS cpf
FROM public.employees;

GRANT SELECT ON public.employees_view TO authenticated;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.app_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  can_create_employees boolean NOT NULL DEFAULT true,
  can_edit_employees boolean NOT NULL DEFAULT false,
  can_manage_suppliers boolean NOT NULL DEFAULT false,
  can_edit_records boolean NOT NULL DEFAULT false,
  can_backdate_records boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_permissions TO authenticated;
GRANT UPDATE ON public.app_permissions TO authenticated;
GRANT ALL ON public.app_permissions TO service_role;

ALTER TABLE public.app_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth view app_permissions" ON public.app_permissions;
CREATE POLICY "auth view app_permissions" ON public.app_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin update app_permissions" ON public.app_permissions;
CREATE POLICY "admin update app_permissions" ON public.app_permissions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_app_permissions_updated_at
  BEFORE UPDATE ON public.app_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_permissions (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;