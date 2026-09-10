
CREATE OR REPLACE FUNCTION public.app_perm(_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN true; END IF;
  EXECUTE format('SELECT %I FROM public.app_permissions ORDER BY created_at LIMIT 1', _key) INTO v;
  RETURN COALESCE(v, false);
END;
$$;

REVOKE ALL ON FUNCTION public.app_perm(text) FROM public;
GRANT EXECUTE ON FUNCTION public.app_perm(text) TO authenticated;

-- employees
DROP POLICY IF EXISTS "admin update employees" ON public.employees;
CREATE POLICY "update employees by permission" ON public.employees
  FOR UPDATE TO authenticated
  USING (public.app_perm('can_edit_employees'))
  WITH CHECK (public.app_perm('can_edit_employees'));

DROP POLICY IF EXISTS "auth insert employees" ON public.employees;
CREATE POLICY "insert employees by permission" ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.app_perm('can_create_employees'));

-- suppliers
DROP POLICY IF EXISTS "admin update suppliers" ON public.suppliers;
CREATE POLICY "update suppliers by permission" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (public.app_perm('can_manage_suppliers'))
  WITH CHECK (public.app_perm('can_manage_suppliers'));

DROP POLICY IF EXISTS "auth insert suppliers" ON public.suppliers;
CREATE POLICY "insert suppliers by permission" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.app_perm('can_manage_suppliers'));

-- meal_types
DROP POLICY IF EXISTS "admin update meal_types" ON public.meal_types;
CREATE POLICY "update meal_types by permission" ON public.meal_types
  FOR UPDATE TO authenticated
  USING (public.app_perm('can_manage_suppliers'))
  WITH CHECK (public.app_perm('can_manage_suppliers'));

DROP POLICY IF EXISTS "auth insert meal_types" ON public.meal_types;
CREATE POLICY "insert meal_types by permission" ON public.meal_types
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.app_perm('can_manage_suppliers'));

-- meal_records
DROP POLICY IF EXISTS "admin update meal_records" ON public.meal_records;
CREATE POLICY "update meal_records by permission" ON public.meal_records
  FOR UPDATE TO authenticated
  USING (public.app_perm('can_edit_records'))
  WITH CHECK (public.app_perm('can_edit_records'));
