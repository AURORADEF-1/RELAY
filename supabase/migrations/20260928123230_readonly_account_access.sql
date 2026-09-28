-- Account restrictions are held outside exposed schemas and take effect for
-- existing sessions. Enrol accounts separately; never derive this from editable
-- user_metadata or from a cached JWT app_metadata claim.
create schema if not exists relay_access;
revoke all on schema relay_access from public;
grant usage on schema relay_access to anon, authenticated, service_role;

create table relay_access.read_only_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table relay_access.read_only_accounts enable row level security;
revoke all on relay_access.read_only_accounts from public, anon, authenticated, service_role;

create function relay_access.is_read_only()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from relay_access.read_only_accounts
    where user_id = (select auth.uid())
  );
$$;
revoke all on function relay_access.is_read_only() from public;
grant execute on function relay_access.is_read_only() to anon, authenticated, service_role;

create function relay_access.check_request()
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if relay_access.is_read_only()
     and coalesce(current_setting('request.method', true), '') not in ('GET', 'HEAD', 'OPTIONS') then
    raise exception using errcode = '42501', message = 'This RELAY account has read-only access.';
  end if;
end;
$$;
revoke all on function relay_access.check_request() from public;
grant execute on function relay_access.check_request() to anon, authenticated, service_role;

-- Do not silently replace an independently configured pre-request hook.
do $$
begin
  if exists (
    select 1 from pg_db_role_setting s, unnest(s.setconfig) setting
    where setting like 'pgrst.db_pre_request=%'
      and setting not in ('pgrst.db_pre_request=', 'pgrst.db_pre_request=relay_access.check_request')
  ) then
    raise exception 'An existing Data API pre-request hook must be composed with the read-only guard.';
  end if;
end;
$$;
alter role authenticator set pgrst.db_pre_request = 'relay_access.check_request';

-- Backstop for callable SECURITY DEFINER routines and other SQL entry points.
-- A statement trigger blocks even zero-row writes before row triggers execute.
create function relay_access.reject_write()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if relay_access.is_read_only() then
    raise exception using errcode = '42501', message = 'This RELAY account has read-only access.';
  end if;
  return null;
end;
$$;
revoke all on function relay_access.reject_write() from public;
do $$
declare target record;
begin
  for target in
    select c.oid::regclass as relation from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and not c.relispartition
  loop
    execute format('create trigger relay_read_only_write_guard before insert or update or delete or truncate on %s for each statement execute function relay_access.reject_write()', target.relation);
  end loop;
end;
$$;

-- Storage requests do not run the PostgREST pre-request hook.
create policy relay_read_only_insert_guard on storage.objects
as restrictive for insert to authenticated
with check (not (select relay_access.is_read_only()));
create policy relay_read_only_update_guard on storage.objects
as restrictive for update to authenticated
using (not (select relay_access.is_read_only()))
with check (not (select relay_access.is_read_only()));
create policy relay_read_only_delete_guard on storage.objects
as restrictive for delete to authenticated
using (not (select relay_access.is_read_only()));

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
