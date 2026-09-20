create or replace function public.prevent_overlapping_shift()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.shifts other_shift
    where other_shift.id <> new.id
      and other_shift.work_date = new.work_date
      and other_shift.staff_id = new.staff_id
      and other_shift.end_minute > new.start_minute
      and other_shift.start_minute < new.end_minute
  ) then
    raise exception using
      errcode = '23P01',
      message = 'A staff member cannot have overlapping shifts';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_overlapping_shifts on public.shifts;
create trigger prevent_overlapping_shifts
before insert or update of work_date, staff_id, start_minute, end_minute
on public.shifts
for each row
execute function public.prevent_overlapping_shift();
