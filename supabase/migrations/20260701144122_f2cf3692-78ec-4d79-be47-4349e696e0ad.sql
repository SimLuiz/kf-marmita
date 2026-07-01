ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.meal_types ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS employees_archived_at_idx ON public.employees (archived_at);
CREATE INDEX IF NOT EXISTS meal_types_archived_at_idx ON public.meal_types (archived_at);

DROP VIEW IF EXISTS public.employees_view;
CREATE VIEW public.employees_view AS
SELECT id, owner_id, name, company, created_at, archived_at,
       private.decrypt_cpf(cpf_encrypted) AS cpf
FROM public.employees;

GRANT SELECT ON public.employees_view TO authenticated;