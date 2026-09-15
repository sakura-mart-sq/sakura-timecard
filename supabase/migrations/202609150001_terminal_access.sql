create or replace function public.is_terminal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'terminal' and active
  );
$$;

drop policy if exists staff_terminal_read on public.staff;
create policy staff_terminal_read on public.staff
  for select to authenticated
  using (public.is_terminal());

drop policy if exists staff_codes_terminal_read on public.staff_codes;
create policy staff_codes_terminal_read on public.staff_codes
  for select to authenticated
  using (public.is_terminal());

drop policy if exists shifts_terminal_read on public.shifts;
create policy shifts_terminal_read on public.shifts
  for select to authenticated
  using (public.is_terminal());

drop policy if exists punches_terminal_read on public.punches;
create policy punches_terminal_read on public.punches
  for select to authenticated
  using (public.is_terminal());

drop policy if exists punches_terminal_write on public.punches;
create policy punches_terminal_write on public.punches
  for insert to authenticated
  with check (public.is_terminal());

drop policy if exists punches_terminal_update on public.punches;
create policy punches_terminal_update on public.punches
  for update to authenticated
  using (public.is_terminal()) with check (public.is_terminal());

grant execute on function public.is_terminal() to authenticated;
