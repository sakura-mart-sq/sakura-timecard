alter table public.staff
  add column if not exists email text;

create unique index if not exists staff_email_lower_unique
  on public.staff (lower(email))
  where email is not null;

create or replace function public.claim_staff_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text := lower(auth.jwt() ->> 'email');
  matched_staff_id uuid;
  result_profile public.profiles;
begin
  if caller_id is null or caller_email is null or caller_email = '' then
    raise exception 'ログイン情報を確認できません。';
  end if;

  select id into matched_staff_id
  from public.staff
  where lower(email) = caller_email and active
  limit 1;

  if matched_staff_id is null then
    raise exception '管理者に登録されたスタッフ用メールアドレスと一致しません。';
  end if;

  select * into result_profile
  from public.profiles
  where id = caller_id;

  if result_profile.id is not null then
    if result_profile.role <> 'staff' then
      raise exception 'このアカウントはスタッフとして利用できません。';
    end if;
    if result_profile.staff_id is not null and result_profile.staff_id <> matched_staff_id then
      raise exception 'このアカウントは別のスタッフに紐付いています。';
    end if;
  end if;

  insert into public.profiles (id, role, staff_id, active)
  values (caller_id, 'staff', matched_staff_id, true)
  on conflict (id) do update
    set role = 'staff', staff_id = matched_staff_id, active = true;

  select * into result_profile
  from public.profiles
  where id = caller_id;
  return result_profile;
end;
$$;

grant execute on function public.claim_staff_profile() to authenticated;
