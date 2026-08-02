DROP VIEW IF EXISTS public.employees_view;
CREATE VIEW public.employees_view WITH (security_invoker = true) AS
SELECT id, owner_id, name, company, sector, created_at, archived_at,
       private.decrypt_cpf(cpf_encrypted) AS cpf
FROM public.employees;
GRANT SELECT ON public.employees_view TO authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.decrypt_cpf(bytea) TO authenticated;