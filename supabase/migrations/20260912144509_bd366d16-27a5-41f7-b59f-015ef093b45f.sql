-- 1) Excluir funcionário com lançamentos vira arquivamento automático
CREATE OR REPLACE FUNCTION public.preserve_employee_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.meal_records WHERE employee_id = OLD.id) THEN
    UPDATE public.employees SET archived_at = COALESCE(archived_at, now()) WHERE id = OLD.id;
    RETURN NULL; -- cancela o delete, funcionário apenas arquivado
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_preserve_employee_history ON public.employees;
CREATE TRIGGER trg_preserve_employee_history
BEFORE DELETE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.preserve_employee_history();

-- 2) Excluir tipo de marmita já usado em lançamentos vira arquivamento
CREATE OR REPLACE FUNCTION public.preserve_meal_type_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.meal_records WHERE meal_type_id = OLD.id) THEN
    UPDATE public.meal_types SET archived_at = COALESCE(archived_at, now()) WHERE id = OLD.id;
    RETURN NULL;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_preserve_meal_type_history ON public.meal_types;
CREATE TRIGGER trg_preserve_meal_type_history
BEFORE DELETE ON public.meal_types
FOR EACH ROW EXECUTE FUNCTION public.preserve_meal_type_history();

-- 3) Bloquear exclusão de fornecedor com tipos de marmita (preserva referências nos lançamentos)
CREATE OR REPLACE FUNCTION public.preserve_supplier_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.meal_types WHERE supplier_id = OLD.id) THEN
    RAISE EXCEPTION 'Este fornecedor possui tipos de marmita cadastrados. Arquive os tipos em vez de excluir o fornecedor, para preservar o histórico de lançamentos.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_preserve_supplier_history ON public.suppliers;
CREATE TRIGGER trg_preserve_supplier_history
BEFORE DELETE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.preserve_supplier_history();