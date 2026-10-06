-- Add access groups in shadow mode. Existing profiles remain unassigned so this
-- migration cannot change their current navigation or permissions by itself.
alter table public.profiles
  add column if not exists access_group text;

alter table public.profiles
  alter column access_group drop default,
  alter column access_group drop not null;

alter table public.profiles drop constraint if exists profiles_access_group_check;
alter table public.profiles add constraint profiles_access_group_check check (
  access_group in ('admin','front_counter','parts','workshop','office','transport','fitter','assetcare')
);

create or replace function public.set_profile_access_group(p_user uuid, p_group text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and (access_group is null or access_group = 'admin')
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if p_group not in ('admin','front_counter','parts','workshop','office','transport','fitter','assetcare') then
    raise exception 'Unknown access group' using errcode = '22023';
  end if;

  update public.profiles
  set access_group = p_group,
      interface_mode = case when p_group = 'front_counter' then 'front_counter' else 'standard' end
  where id = p_user;

  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_profile_access_group(uuid,text) from public, anon;
grant execute on function public.set_profile_access_group(uuid,text) to authenticated, service_role;

create or replace function public.handle_new_relay_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, interface_mode, access_group)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'RELAY user'),
    'requester', 'standard', null
  ) on conflict (id) do nothing;
  return new;
end;
$$;
