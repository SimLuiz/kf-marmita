DROP POLICY IF EXISTS "auth can view roles" ON public.user_roles;

CREATE POLICY "users view own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));