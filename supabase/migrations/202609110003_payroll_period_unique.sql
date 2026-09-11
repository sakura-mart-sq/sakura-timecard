create unique index if not exists payrolls_staff_period_unique
  on public.payrolls (staff_id, period_start, period_end);
