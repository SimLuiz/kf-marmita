-- Add UPDATE policy on meal_records (owner-scoped)
CREATE POLICY "owner can update meal_records"
ON public.meal_records
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- Add UPDATE policy on storage.objects for meal-photos bucket (owner-scoped via folder name)
CREATE POLICY "owner can update meal-photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'meal-photos'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'meal-photos'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
