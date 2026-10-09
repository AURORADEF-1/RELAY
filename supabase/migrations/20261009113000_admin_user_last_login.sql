create or replace function public.admin_list_user_accounts_with_last_login()
returns table (
  id uuid,
  full_name text,
  role text,
  email text,
  interface_mode text,
  access_group text,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and actor.role = 'admin'
  ) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  return query
  select
    profile.id,
    profile.full_name,
    profile.role,
    profile.email,
    profile.interface_mode,
    profile.access_group,
    account.last_sign_in_at
  from public.profiles profile
  left join auth.users account on account.id = profile.id
  order by profile.full_name nulls last, profile.id;
end;
$$;

revoke all on function public.admin_list_user_accounts_with_last_login() from public;
grant execute on function public.admin_list_user_accounts_with_last_login() to authenticated;

comment on function public.admin_list_user_accounts_with_last_login() is
  'Returns the AssetCare+ account directory with Supabase Auth last-login timestamps to administrators only.';
