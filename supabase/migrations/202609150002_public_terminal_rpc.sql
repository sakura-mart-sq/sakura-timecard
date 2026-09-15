-- The store tablet uses the staff code as its terminal credential.
-- No Supabase Auth account is required for the tablet.

create or replace function public.terminal_snapshot(p_work_date date default current_date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.name)
      from (
        select id, name, hourly_wage, active, email
        from public.staff
        where active
      ) rows
    ), '[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.start_minute)
      from (
        select id, work_date, staff_id, start_minute, end_minute, note, status
        from public.shifts
        where work_date = p_work_date and status = 'published'
      ) rows
    ), '[]'::jsonb),
    'punches', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.clock_in)
      from (
        select id, staff_id, shift_id, scheduled_staff_id, clock_in, clock_out, payroll_from_actual_start
        from public.punches
        where clock_in >= (p_work_date::text || ' 00:00:00 America/Vancouver')::timestamptz
          and clock_in < ((p_work_date + 1)::text || ' 00:00:00 America/Vancouver')::timestamptz
      ) rows
    ), '[]'::jsonb)
  );
$$;

create or replace function public.terminal_find_staff(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', s.id, 'name', s.name)
  from public.staff s
  join public.staff_codes c on c.staff_id = s.id
  where s.active and c.code = p_code;
$$;

create or replace function public.terminal_clock_in(p_code text, p_shift_id uuid)
returns public.punches
language plpgsql
security definer
set search_path = public
as $$
declare
  target_staff_id uuid;
  target_shift public.shifts;
  result_punch public.punches;
begin
  select s.id into target_staff_id
  from public.staff s
  join public.staff_codes c on c.staff_id = s.id
  where s.active and c.code = p_code;
  if target_staff_id is null then raise exception 'Staff code not found'; end if;

  select * into target_shift
  from public.shifts
  where id = p_shift_id and staff_id = target_staff_id and status = 'published';
  if target_shift.id is null then raise exception 'Shift not found'; end if;
  if exists (select 1 from public.punches where staff_id = target_staff_id and clock_out is null) then
    raise exception 'This staff member is already signed in';
  end if;

  insert into public.punches (staff_id, shift_id, scheduled_staff_id, clock_in)
  values (target_staff_id, target_shift.id, target_staff_id, now())
  returning * into result_punch;
  return result_punch;
end;
$$;

create or replace function public.terminal_clock_out(p_code text)
returns public.punches
language plpgsql
security definer
set search_path = public
as $$
declare
  target_staff_id uuid;
  result_punch public.punches;
begin
  select s.id into target_staff_id
  from public.staff s
  join public.staff_codes c on c.staff_id = s.id
  where s.active and c.code = p_code;
  if target_staff_id is null then raise exception 'Staff code not found'; end if;

  update public.punches
  set clock_out = now()
  where id = (
    select id from public.punches
    where staff_id = target_staff_id and clock_out is null
    order by clock_in desc
    limit 1
  )
  returning * into result_punch;
  if result_punch.id is null then raise exception 'No active punch found'; end if;
  return result_punch;
end;
$$;

revoke all on function public.terminal_snapshot(date) from public;
revoke all on function public.terminal_find_staff(text) from public;
revoke all on function public.terminal_clock_in(text, uuid) from public;
revoke all on function public.terminal_clock_out(text) from public;
grant execute on function public.terminal_snapshot(date) to anon, authenticated;
grant execute on function public.terminal_find_staff(text) to anon, authenticated;
grant execute on function public.terminal_clock_in(text, uuid) to anon, authenticated;
grant execute on function public.terminal_clock_out(text) to anon, authenticated;
