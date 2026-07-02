
ALTER TABLE public.meal_types ADD COLUMN IF NOT EXISTS company_price NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.meal_records ADD COLUMN IF NOT EXISTS company_unit_price NUMERIC(10,2);

CREATE OR REPLACE FUNCTION public.snapshot_meal_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.meal_type_id IS NOT NULL THEN
    IF NEW.unit_price IS NULL THEN
      SELECT price INTO NEW.unit_price FROM public.meal_types WHERE id = NEW.meal_type_id;
    END IF;
    IF NEW.company_unit_price IS NULL THEN
      SELECT company_price INTO NEW.company_unit_price FROM public.meal_types WHERE id = NEW.meal_type_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
