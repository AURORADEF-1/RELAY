alter table public.profiles
  add column if not exists account_status text not null default 'active';

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('active', 'disabled'));

drop function if exists public.admin_list_user_accounts_with_last_login();

create function public.admin_list_user_accounts_with_last_login()
returns table (
  id uuid,
  username text,
  full_name text,
  role text,
  email text,
  interface_mode text,
  access_group text,
  account_status text,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.profiles actor
    where actor.id = auth.uid() and actor.role = 'admin'
  ) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  return query
  select profile.id, nullif(split_part(account.email, '@', 1), ''),
    profile.full_name, profile.role, profile.email, profile.interface_mode,
    profile.access_group, profile.account_status, account.last_sign_in_at
  from public.profiles profile
  left join auth.users account on account.id = profile.id
  order by profile.full_name nulls last, profile.id;
end;
$$;

revoke all on function public.admin_list_user_accounts_with_last_login() from public;
grant execute on function public.admin_list_user_accounts_with_last_login() to authenticated;

create or replace function public.admin_set_user_account_status(p_user uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles actor
    where actor.id = auth.uid() and actor.role = 'admin'
  ) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_status not in ('active', 'disabled') then
    raise exception 'Invalid account status.' using errcode = '22023';
  end if;
  if p_user = auth.uid() and p_status = 'disabled' then
    raise exception 'Administrators cannot disable their own account.' using errcode = '22023';
  end if;
  update public.profiles set account_status = p_status where id = p_user;
end;
$$;

revoke all on function public.admin_set_user_account_status(uuid, text) from public, anon;
grant execute on function public.admin_set_user_account_status(uuid, text) to authenticated;
