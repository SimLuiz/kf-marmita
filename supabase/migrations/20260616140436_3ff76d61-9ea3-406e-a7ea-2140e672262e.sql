
-- 1) Restrict meal-photos SELECT to owner or admin
DROP POLICY IF EXISTS "authenticated can view meal photos" ON storage.objects;
CREATE POLICY "owner or admin can view meal photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'meal-photos'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- 2) login_attempts: explicit admin-only SELECT policy (writes happen via service role, bypassing RLS)
CREATE POLICY "admins can view login attempts"
  ON public.login_attempts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) Revoke public EXECUTE on SECURITY DEFINER trigger function (only the trigger needs it; runs as owner)
REVOKE EXECUTE ON FUNCTION public.encrypt_employee_cpf() FROM PUBLIC, anon, authenticated;
