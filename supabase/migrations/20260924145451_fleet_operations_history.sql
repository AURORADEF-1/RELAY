-- Additive reporting storage; no changes to contracts, tickets, machines or notifications.
create table public.fleet_operation_samples (
  sample_key text primary key,
  machine_id uuid not null references public.machines(id) on delete cascade,
  provider text not null check (provider in ('jcb','trackunit')),
  pin text not null,
  captured_at timestamptz not null default now(),
  payload jsonb not null check (jsonb_typeof(payload)='object')
);
create index fleet_operation_samples_machine_time on public.fleet_operation_samples(machine_id,captured_at);
create index fleet_operation_samples_latest on public.fleet_operation_samples(provider,pin,captured_at desc);
create table public.fleet_operation_runs (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('jcb','trackunit')),
  checked_at timestamptz not null default now(),
  checked integer not null,
  total integer not null,
  failures integer not null,
  next_pin text
);
create index fleet_operation_runs_latest on public.fleet_operation_runs(provider,checked_at desc);
alter table public.fleet_operation_samples enable row level security;
alter table public.fleet_operation_runs enable row level security;
revoke all on public.fleet_operation_samples,public.fleet_operation_runs from anon,authenticated;
grant select on public.fleet_operation_samples,public.fleet_operation_runs to authenticated;
grant all on public.fleet_operation_samples,public.fleet_operation_runs to service_role;
grant usage,select on sequence public.fleet_operation_runs_id_seq to service_role;
create policy fleet_operation_samples_admin_read on public.fleet_operation_samples for select to authenticated
using (exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'));
create policy fleet_operation_runs_admin_read on public.fleet_operation_runs for select to authenticated
using (exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'));
create function public.fleet_operations_latest() returns setof public.fleet_operation_samples
language sql stable security invoker set search_path='' as $$
 select distinct on (provider,pin) * from public.fleet_operation_samples order by provider,pin,captured_at desc,sample_key;
$$;
revoke all on function public.fleet_operations_latest() from public,anon;
grant execute on function public.fleet_operations_latest() to authenticated,service_role;
