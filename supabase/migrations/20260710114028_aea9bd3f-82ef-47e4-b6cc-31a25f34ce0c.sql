
CREATE OR REPLACE FUNCTION public.pg_database_size_current()
RETURNS BIGINT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_database_size(current_database())::bigint;
$$;

REVOKE EXECUTE ON FUNCTION public.pg_database_size_current() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_table_sizes()
RETURNS TABLE(name text, total_bytes bigint, row_estimate bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.relname::text AS name,
    pg_total_relation_size(c.oid)::bigint AS total_bytes,
    COALESCE(c.reltuples, 0)::bigint AS row_estimate
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.public_table_sizes() FROM anon, authenticated;
