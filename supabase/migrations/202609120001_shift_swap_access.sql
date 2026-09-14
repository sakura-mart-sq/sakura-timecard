create policy swaps_read_open_for_staff on public.shift_swaps
  for select to authenticated
  using (
    status = 'open'
    and from_staff_id <> public.current_staff_id()
  );

create policy shifts_read_open_swap on public.shifts
  for select to authenticated
  using (
    exists (
      select 1 from public.shift_swaps
      where shift_id = shifts.id
        and status = 'open'
        and from_staff_id <> public.current_staff_id()
    )
  );

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
  if target_swap.from_staff_id = caller_staff_id then
    raise exception 'The requesting staff member cannot accept their own shift swap';
  end if;

  select * into target_shift from public.shifts where id = target_swap.shift_id for update;
  if target_shift.id is null or target_shift.staff_id <> target_swap.from_staff_id or target_shift.status <> 'published' then
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
