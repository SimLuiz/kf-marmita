-- Employees table
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.employees enable row level security;

create policy "owner can view employees" on public.employees
  for select to authenticated using (auth.uid() = owner_id);
create policy "owner can insert employees" on public.employees
  for insert to authenticated with check (auth.uid() = owner_id);
create policy "owner can update employees" on public.employees
  for update to authenticated using (auth.uid() = owner_id);
create policy "owner can delete employees" on public.employees
  for delete to authenticated using (auth.uid() = owner_id);

create index employees_owner_idx on public.employees(owner_id);

-- Meal records table
create table public.meal_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  taken_at timestamptz not null default now(),
  photo_path text not null,
  created_at timestamptz not null default now()
);
alter table public.meal_records enable row level security;

create policy "owner can view meal_records" on public.meal_records
  for select to authenticated using (auth.uid() = owner_id);
create policy "owner can insert meal_records" on public.meal_records
  for insert to authenticated with check (auth.uid() = owner_id);
create policy "owner can delete meal_records" on public.meal_records
  for delete to authenticated using (auth.uid() = owner_id);

create index meal_records_owner_taken_idx on public.meal_records(owner_id, taken_at desc);
create index meal_records_employee_idx on public.meal_records(employee_id);

-- Storage bucket for meal photos (private)
insert into storage.buckets (id, name, public) values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

-- Storage policies: owner-scoped via first folder = auth.uid()
create policy "owner can view own meal photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "owner can upload own meal photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "owner can delete own meal photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1]);
