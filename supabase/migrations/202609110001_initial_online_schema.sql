create extension if not exists pgcrypto;

create type public.app_role as enum ('staff', 'manager', 'terminal');
create type public.shift_status as enum ('draft', 'published');
create type public.shift_request_status as enum ('submitted', 'approved', 'rejected', 'withdrawn');
create type public.swap_status as enum ('open', 'accepted', 'expired', 'cancelled');
create type public.payroll_status as enum ('calculated', 'finalized', 'published');

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hourly_wage numeric(10, 2) not null check (hourly_wage >= 0),
  staff_code_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'staff',
  staff_id uuid unique references public.staff(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  staff_id uuid not null references public.staff(id),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440),
  note text not null default '',
  status public.shift_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_minute > start_minute)
);

create table public.shift_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  work_date date not null,
  requested_start integer not null check (requested_start between 0 and 1439),
  requested_end integer not null check (requested_end between 1 and 1440),
  note text not null default '',
  status public.shift_request_status not null default 'submitted',
  manager_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requested_end > requested_start)
);

create table public.shift_swaps (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id),
  from_staff_id uuid not null references public.staff(id),
  accepted_by uuid references public.staff(id),
  status public.swap_status not null default 'open',
  note text not null default '',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_open_swap_per_shift
  on public.shift_swaps (shift_id)
  where status = 'open';

create table public.punches (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  shift_id uuid references public.shifts(id),
  scheduled_staff_id uuid references public.staff(id),
  clock_in timestamptz not null,
  clock_out timestamptz,
  payroll_from_actual_start boolean not null default false,
  adjusted_by uuid references auth.users(id),
  adjusted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in)
);

create table public.payrolls (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  period_start date not null,
  period_end date not null,
  total_minutes integer not null default 0 check (total_minutes >= 0),
  total_pay numeric(12, 2) not null default 0 check (total_pay >= 0),
  status public.payroll_status not null default 'calculated',
  finalized_by uuid references auth.users(id),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table public.registered_devices (
  id uuid primary key default gen_random_uuid(),
  device_name text not null,
  device_token_hash text not null unique,
  device_type text not null default 'punch_terminal',
  active boolean not null default true,
  registered_by uuid references auth.users(id),
  last_seen_at timestamptz,
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

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'staff', 'profiles', 'shifts', 'shift_requests', 'shift_swaps',
    'punches', 'payrolls', 'registered_devices'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end;
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager' and active
  );
$$;

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select staff_id from public.profiles
  where id = auth.uid() and role = 'staff' and active;
$$;

alter table public.staff enable row level security;
alter table public.profiles enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_requests enable row level security;
alter table public.shift_swaps enable row level security;
alter table public.punches enable row level security;
alter table public.payrolls enable row level security;
alter table public.registered_devices enable row level security;

create policy staff_read_self_or_manager on public.staff
  for select to authenticated
  using (public.is_manager() or id = public.current_staff_id());
create policy staff_manager_write on public.staff
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy profiles_read_self_or_manager on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_manager());
create policy profiles_manager_write on public.profiles
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy shifts_read_role_scope on public.shifts
  for select to authenticated
  using (public.is_manager() or (status = 'published' and staff_id = public.current_staff_id()));
create policy shifts_manager_write on public.shifts
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy requests_read_role_scope on public.shift_requests
  for select to authenticated
  using (public.is_manager() or staff_id = public.current_staff_id());
create policy requests_staff_insert on public.shift_requests
  for insert to authenticated
  with check (staff_id = public.current_staff_id());
create policy requests_staff_update on public.shift_requests
  for update to authenticated
  using (staff_id = public.current_staff_id() and status = 'submitted')
  with check (staff_id = public.current_staff_id());
create policy requests_manager_write on public.shift_requests
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy swaps_read_role_scope on public.shift_swaps
  for select to authenticated
  using (public.is_manager() or from_staff_id = public.current_staff_id() or accepted_by = public.current_staff_id());
create policy swaps_staff_insert on public.shift_swaps
  for insert to authenticated
  with check (from_staff_id = public.current_staff_id());
create policy swaps_staff_cancel on public.shift_swaps
  for update to authenticated
  using (from_staff_id = public.current_staff_id() and status = 'open')
  with check (from_staff_id = public.current_staff_id() and status = 'cancelled');
create policy swaps_manager_write on public.shift_swaps
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy punches_manager_read on public.punches
  for select to authenticated
  using (public.is_manager());
create policy punches_manager_write on public.punches
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy payrolls_read_role_scope on public.payrolls
  for select to authenticated
  using (public.is_manager() or (status = 'published' and staff_id = public.current_staff_id()));
create policy payrolls_manager_write on public.payrolls
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy devices_manager_only on public.registered_devices
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create or replace function public.accept_shift_swap(p_swap_id uuid)
returns public.shift_swaps
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_staff_id uuid;
  target_swap public.shift_swaps;
  target_shift public.shifts;
  conflict_exists boolean;
begin
  caller_staff_id := public.current_staff_id();
  if caller_staff_id is null then
    raise exception 'Only an active staff user can accept a shift swap';
  end if;

  select * into target_swap
  from public.shift_swaps
  where id = p_swap_id
  for update;

  if target_swap.id is null or target_swap.status <> 'open' then
    raise exception 'This shift swap is no longer available';
  end if;

  select * into target_shift from public.shifts where id = target_swap.shift_id for update;
  if target_shift.id is null or target_shift.staff_id <> target_swap.from_staff_id then
    raise exception 'The shift assignment has changed';
  end if;

  select exists (
    select 1 from public.shifts other_shift
    where other_shift.staff_id = caller_staff_id
      and other_shift.work_date = target_shift.work_date
      and other_shift.id <> target_shift.id
      and other_shift.end_minute > target_shift.start_minute
      and other_shift.start_minute < target_shift.end_minute
  ) into conflict_exists;

  if conflict_exists then
    raise exception 'The accepting staff member has an overlapping shift';
  end if;

  update public.shift_swaps
  set status = 'accepted', accepted_by = caller_staff_id, accepted_at = now()
  where id = target_swap.id and status = 'open';

  if not found then
    raise exception 'This shift swap was accepted by another staff member';
  end if;

  update public.shifts set staff_id = caller_staff_id where id = target_shift.id;
  select * into target_swap from public.shift_swaps where id = p_swap_id;
  return target_swap;
end;
$$;

revoke all on function public.accept_shift_swap(uuid) from public;
grant execute on function public.accept_shift_swap(uuid) to authenticated;
