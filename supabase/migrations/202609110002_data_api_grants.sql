-- The project intentionally disables automatic Data API exposure.
-- RLS still limits each operation to the policies defined in the initial schema.
grant select, insert, update, delete on public.staff to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.shifts to authenticated;
grant select, insert, update, delete on public.shift_requests to authenticated;
grant select, insert, update, delete on public.shift_swaps to authenticated;
grant select, insert, update, delete on public.punches to authenticated;
grant select, insert, update, delete on public.payrolls to authenticated;
grant select, insert, update, delete on public.registered_devices to authenticated;

grant execute on function public.accept_shift_swap(uuid) to authenticated;
