-- Keep profile identity and presentation self-service while reserving access
-- control fields for trusted database/admin operations.
--
-- RLS limits which row a user can edit, but it does not limit which columns on
-- that row they can change. Without column privileges a requester could submit
-- role = 'admin' or interface_mode = 'front_counter' directly to PostgREST.

revoke all privileges on table public.profiles from anon;

revoke insert, update, delete, truncate, references, trigger
  on table public.profiles
  from authenticated;

grant select on table public.profiles to authenticated;
grant insert (id, full_name, avatar_path) on table public.profiles to authenticated;
grant update (full_name, avatar_path) on table public.profiles to authenticated;

comment on table public.profiles is
  'RELAY identities. Signed-in users may maintain only their own display name and avatar; role and interface mode are admin-controlled.';

-- Every authenticated RELAY identity receives a least-privilege requester
-- profile. Administrators can promote it explicitly after account creation.
create or replace function public.handle_new_relay_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, interface_mode)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'RELAY user'
    ),
    'requester',
    'standard'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_relay_user() from public, anon, authenticated;

drop trigger if exists relay_user_profile_on_signup on auth.users;
create trigger relay_user_profile_on_signup
  after insert on auth.users
  for each row execute function public.handle_new_relay_user();

-- Repair older accounts that pre-date automatic profile creation.
insert into public.profiles (id, full_name, role, interface_mode)
select
  users.id,
  coalesce(
    nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'RELAY user'
  ),
  'requester',
  'standard'
from auth.users users
left join public.profiles profile on profile.id = users.id
where profile.id is null
on conflict (id) do nothing;

-- If an operator completes or otherwise moves a ticket away from READY outside
-- the front-counter scan flow, retire any orphaned WAITING queue entry.
create or replace function public.cancel_stale_front_counter_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'READY' and new.status <> 'READY' then
    update public.front_counter_collection_requests
    set state = 'CANCELLED',
        updated_at = now()
    where ticket_id = new.id
      and state = 'WAITING';
  end if;

  return new;
end;
$$;

revoke all on function public.cancel_stale_front_counter_collection() from public, anon, authenticated;

drop trigger if exists cancel_stale_front_counter_collection_on_ticket on public.tickets;
create trigger cancel_stale_front_counter_collection_on_ticket
  after update of status on public.tickets
  for each row execute function public.cancel_stale_front_counter_collection();

update public.front_counter_collection_requests request
set state = 'CANCELLED',
    updated_at = now()
from public.tickets ticket
where ticket.id = request.ticket_id
  and request.state = 'WAITING'
  and ticket.status <> 'READY';
