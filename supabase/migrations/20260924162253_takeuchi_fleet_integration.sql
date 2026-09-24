create table public.takeuchi_mappings (
  pin text primary key check(length(pin) between 1 and 100),
  machine_id uuid not null unique references public.machines(id) on delete cascade,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.takeuchi_mappings enable row level security;
revoke all on public.takeuchi_mappings from public,anon,authenticated;
grant select,insert,update,delete on public.takeuchi_mappings to authenticated;
grant all on public.takeuchi_mappings to service_role;
create policy "Tracking users read Takeuchi links" on public.takeuchi_mappings for select to authenticated
using (exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin')
 or exists(select 1 from public.jcb_livelink_access where user_id=(select auth.uid()) and enabled));
create policy "Admins manage Takeuchi links" on public.takeuchi_mappings for all to authenticated
using (exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'))
with check (exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'));

create table public.takeuchi_api_cache (
 cache_key text primary key,
 payload jsonb,
 checked_at timestamptz,
 lease_until timestamptz not null default '1970-01-01T00:00:00Z'
);
alter table public.takeuchi_api_cache enable row level security;
revoke all on public.takeuchi_api_cache from public,anon,authenticated;
grant all on public.takeuchi_api_cache to service_role;
alter table public.fleet_operation_samples drop constraint fleet_operation_samples_provider_check;
alter table public.fleet_operation_samples add constraint fleet_operation_samples_provider_check check(provider in ('jcb','trackunit','takeuchi'));
alter table public.fleet_operation_runs drop constraint fleet_operation_runs_provider_check;
alter table public.fleet_operation_runs add constraint fleet_operation_runs_provider_check check(provider in ('jcb','trackunit','takeuchi'));
