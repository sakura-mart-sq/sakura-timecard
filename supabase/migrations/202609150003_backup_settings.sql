create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  store_name text not null default 'Sakura Mart',
  admin_passcode text not null default '1968',
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_manager_access on public.app_settings;
create policy app_settings_manager_access on public.app_settings
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

grant select, insert, update, delete on public.app_settings to authenticated;
