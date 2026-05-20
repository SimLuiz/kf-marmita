
-- 1. Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "auth can view roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin can manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Profiles table (stores username for login display)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin can manage profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Auto-create profile + default 'user' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uname TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  INSERT INTO public.profiles (id, username) VALUES (NEW.id, uname)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Seed admin user (admin@marmita.local / Master@2020)
DO $$
DECLARE
  admin_id UUID;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@marmita.local';
  IF admin_id IS NULL THEN
    admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
      'admin@marmita.local', crypt('Master@2020', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{"username":"admin"}'::jsonb, now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', 'admin@marmita.local'),
      'email', admin_id::text, now(), now(), now());
  END IF;
  -- Ensure admin role exists
  INSERT INTO public.profiles (id, username) VALUES (admin_id, 'admin')
    ON CONFLICT (id) DO UPDATE SET username = 'admin';
  INSERT INTO public.user_roles (user_id, role) VALUES (admin_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  -- Remove default 'user' role from admin if added
  DELETE FROM public.user_roles WHERE user_id = admin_id AND role = 'user';
END $$;

-- 5. Update RLS on all data tables: shared read/insert, admin-only update/delete
-- employees
DROP POLICY IF EXISTS "owner can view employees" ON public.employees;
DROP POLICY IF EXISTS "owner can insert employees" ON public.employees;
DROP POLICY IF EXISTS "owner can update employees" ON public.employees;
DROP POLICY IF EXISTS "owner can delete employees" ON public.employees;
CREATE POLICY "auth view employees" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert employees" ON public.employees FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "admin update employees" ON public.employees FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete employees" ON public.employees FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- meal_records
DROP POLICY IF EXISTS "owner can view meal_records" ON public.meal_records;
DROP POLICY IF EXISTS "owner can insert meal_records" ON public.meal_records;
DROP POLICY IF EXISTS "owner can update meal_records" ON public.meal_records;
DROP POLICY IF EXISTS "owner can delete meal_records" ON public.meal_records;
CREATE POLICY "auth view meal_records" ON public.meal_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert meal_records" ON public.meal_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "admin update meal_records" ON public.meal_records FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete meal_records" ON public.meal_records FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- suppliers
DROP POLICY IF EXISTS "owner can view suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "owner can insert suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "owner can update suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "owner can delete suppliers" ON public.suppliers;
CREATE POLICY "auth view suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "admin update suppliers" ON public.suppliers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- meal_types
DROP POLICY IF EXISTS "owner can view meal_types" ON public.meal_types;
DROP POLICY IF EXISTS "owner can insert meal_types" ON public.meal_types;
DROP POLICY IF EXISTS "owner can update meal_types" ON public.meal_types;
DROP POLICY IF EXISTS "owner can delete meal_types" ON public.meal_types;
CREATE POLICY "auth view meal_types" ON public.meal_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert meal_types" ON public.meal_types FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "admin update meal_types" ON public.meal_types FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete meal_types" ON public.meal_types FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
