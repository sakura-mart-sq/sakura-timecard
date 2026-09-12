create table if not exists public.staff_codes (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  code text not null unique check (code ~ '^[0-9]{5}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists staff_codes_set_updated_at on public.staff_codes;
create trigger staff_codes_set_updated_at
  before update on public.staff_codes
  for each row execute function public.set_updated_at();

alter table public.staff_codes enable row level security;

drop policy if exists staff_codes_manager_only on public.staff_codes;
create policy staff_codes_manager_only on public.staff_codes
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

grant select, insert, update, delete on public.staff_codes to authenticated;
