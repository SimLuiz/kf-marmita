ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS vinculo text NOT NULL DEFAULT 'clt';

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_vinculo_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_vinculo_check
  CHECK (vinculo IN ('clt','pj','visitante','aniversariante'));

ALTER TABLE public.meal_types ADD COLUMN IF NOT EXISTS key text;

UPDATE public.meal_types
SET key = regexp_replace(
      regexp_replace(
        lower(translate(name,
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
        '[^a-z0-9]+', '_', 'g'),
      '(^_+|_+$)', '', 'g')
WHERE key IS NULL OR key = '';

-- desambigua chaves repetidas
WITH d AS (
  SELECT id, key, row_number() OVER (PARTITION BY key ORDER BY created_at, id) AS rn
  FROM public.meal_types
)
UPDATE public.meal_types m
SET key = m.key || '_' || d.rn
FROM d
WHERE m.id = d.id AND d.rn > 1;

UPDATE public.meal_types SET key = 'tipo_' || left(id::text, 8) WHERE key IS NULL OR key = '';

CREATE UNIQUE INDEX IF NOT EXISTS meal_types_key_unique ON public.meal_types (key);

DROP VIEW IF EXISTS public.employees_view;
CREATE VIEW public.employees_view WITH (security_invoker = true) AS
SELECT id, owner_id, name, company, sector, vinculo, created_at, archived_at,
       private.decrypt_cpf(cpf_encrypted) AS cpf
FROM public.employees;
GRANT SELECT ON public.employees_view TO authenticated;
GRANT SELECT ON public.employees_view TO service_role;