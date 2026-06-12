ALTER TABLE public.meal_records ADD COLUMN IF NOT EXISTS unit_price numeric(10,2);

-- Backfill existing rows with current meal_types price as best-effort historical value
UPDATE public.meal_records mr
SET unit_price = mt.price
FROM public.meal_types mt
WHERE mr.unit_price IS NULL AND mr.meal_type_id = mt.id;

-- Trigger to snapshot price at insert time if not provided
CREATE OR REPLACE FUNCTION public.snapshot_meal_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.unit_price IS NULL AND NEW.meal_type_id IS NOT NULL THEN
    SELECT price INTO NEW.unit_price FROM public.meal_types WHERE id = NEW.meal_type_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_meal_price ON public.meal_records;
CREATE TRIGGER trg_snapshot_meal_price
BEFORE INSERT ON public.meal_records
FOR EACH ROW EXECUTE FUNCTION public.snapshot_meal_price();