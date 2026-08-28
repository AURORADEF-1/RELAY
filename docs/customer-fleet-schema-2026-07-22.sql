create table if not exists public.customer_fleets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_fleet_members (
  fleet_id uuid not null references public.customer_fleets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fleet_id, user_id)
);

create table if not exists public.customer_fleet_machines (
  fleet_id uuid not null references public.customer_fleets(id) on delete cascade,
  machine_id uuid not null references public.machines(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fleet_id, machine_id)
);

create index if not exists customer_fleet_members_user_id_idx
on public.customer_fleet_members (user_id, fleet_id);

create index if not exists customer_fleet_machines_machine_id_idx
on public.customer_fleet_machines (machine_id, fleet_id);

alter table public.customer_fleets enable row level security;
alter table public.customer_fleet_members enable row level security;
alter table public.customer_fleet_machines enable row level security;

drop policy if exists "customer fleets member read" on public.customer_fleets;
create policy "customer fleets member read"
on public.customer_fleets
for select
to authenticated
using (
  exists (
    select 1
    from public.customer_fleet_members member
    where member.fleet_id = customer_fleets.id
      and member.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

drop policy if exists "customer fleet members read" on public.customer_fleet_members;
create policy "customer fleet members read"
on public.customer_fleet_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

drop policy if exists "customer fleet machines read" on public.customer_fleet_machines;
create policy "customer fleet machines read"
on public.customer_fleet_machines
for select
to authenticated
using (
  exists (
    select 1
    from public.customer_fleet_members member
    where member.fleet_id = customer_fleet_machines.fleet_id
      and member.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

drop policy if exists "customer fleets admin manage" on public.customer_fleets;
drop policy if exists "customer fleets admin insert" on public.customer_fleets;
create policy "customer fleets admin insert"
on public.customer_fleets
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

drop policy if exists "customer fleets admin update" on public.customer_fleets;
create policy "customer fleets admin update"
on public.customer_fleets
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

drop policy if exists "customer fleets admin delete" on public.customer_fleets;
create policy "customer fleets admin delete"
on public.customer_fleets
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

drop policy if exists "customer fleet members admin manage" on public.customer_fleet_members;
drop policy if exists "customer fleet members admin insert" on public.customer_fleet_members;
create policy "customer fleet members admin insert"
on public.customer_fleet_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

drop policy if exists "customer fleet members admin update" on public.customer_fleet_members;
create policy "customer fleet members admin update"
on public.customer_fleet_members
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

drop policy if exists "customer fleet members admin delete" on public.customer_fleet_members;
create policy "customer fleet members admin delete"
on public.customer_fleet_members
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

drop policy if exists "customer fleet machines admin manage" on public.customer_fleet_machines;
drop policy if exists "customer fleet machines admin insert" on public.customer_fleet_machines;
create policy "customer fleet machines admin insert"
on public.customer_fleet_machines
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

drop policy if exists "customer fleet machines admin update" on public.customer_fleet_machines;
create policy "customer fleet machines admin update"
on public.customer_fleet_machines
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

drop policy if exists "customer fleet machines admin delete" on public.customer_fleet_machines;
create policy "customer fleet machines admin delete"
on public.customer_fleet_machines
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
  )
);

grant select on public.customer_fleets to authenticated;
grant select on public.customer_fleet_members to authenticated;
grant select on public.customer_fleet_machines to authenticated;
grant insert, update, delete on public.customer_fleets to authenticated;
grant insert, update, delete on public.customer_fleet_members to authenticated;
grant insert, update, delete on public.customer_fleet_machines to authenticated;

insert into public.customer_fleets (name, slug)
values ('Shred Station', 'shred-station')
on conflict (slug) do update set
  name = excluded.name,
  updated_at = now();

insert into public.customer_fleet_members (fleet_id, user_id)
select fleet.id, account.id
from public.customer_fleets fleet
join auth.users account
  on lower(account.email) = 'danshredstation.user@mlp.local'
where fleet.slug = 'shred-station'
on conflict (fleet_id, user_id) do nothing;

insert into public.customer_fleet_machines (fleet_id, machine_id)
select fleet.id, machine.id
from public.customer_fleets fleet
join public.machines machine
  on machine.machine_number_normalized in (
    '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14',
    '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26'
  )
where fleet.slug = 'shred-station'
on conflict (fleet_id, machine_id) do nothing;

do $$
declare
  member_count integer;
  machine_count integer;
begin
  select count(*) into member_count
  from public.customer_fleet_members member
  join public.customer_fleets fleet on fleet.id = member.fleet_id
  join auth.users account on account.id = member.user_id
  where fleet.slug = 'shred-station'
    and lower(account.email) = 'danshredstation.user@mlp.local';

  select count(*) into machine_count
  from public.customer_fleet_machines assignment
  join public.customer_fleets fleet on fleet.id = assignment.fleet_id
  where fleet.slug = 'shred-station';

  if member_count <> 1 then
    raise exception 'Expected one Shred Station fleet member, found %', member_count;
  end if;

  if machine_count <> 25 then
    raise exception 'Expected 25 Shred Station machines, found %', machine_count;
  end if;
end
$$;
