-- Suppliers
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner can view suppliers" ON public.suppliers FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "owner can insert suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner can update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner can delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Meal types
CREATE TABLE public.meal_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meal_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner can view meal_types" ON public.meal_types FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "owner can insert meal_types" ON public.meal_types FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner can update meal_types" ON public.meal_types FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner can delete meal_types" ON public.meal_types FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE INDEX idx_meal_types_supplier ON public.meal_types(supplier_id);

-- Add meal_type_id to records
ALTER TABLE public.meal_records ADD COLUMN meal_type_id UUID REFERENCES public.meal_types(id) ON DELETE SET NULL;
CREATE INDEX idx_meal_records_meal_type ON public.meal_records(meal_type_id);