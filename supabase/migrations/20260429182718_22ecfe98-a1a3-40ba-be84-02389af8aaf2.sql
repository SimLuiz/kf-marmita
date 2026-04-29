alter table public.employees
  add column if not exists cpf text,
  add column if not exists company text;
