DROP POLICY IF EXISTS "owner can view own meal photos" ON storage.objects;
DROP POLICY IF EXISTS "owner can delete own meal photos" ON storage.objects;

CREATE POLICY "authenticated can view meal photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'meal-photos');

CREATE POLICY "owner or admin can delete meal photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'meal-photos'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
  )
);