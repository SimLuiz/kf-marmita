CREATE INDEX IF NOT EXISTS meal_records_employee_taken_idx
  ON public.meal_records (employee_id, taken_at DESC);

CREATE INDEX IF NOT EXISTS meal_records_taken_at_idx
  ON public.meal_records (taken_at DESC);

DROP INDEX IF EXISTS public.meal_records_employee_idx;