-- Review-only until deployment approval. No changes to existing fleet or ticket tables.
create table public.trackunit_health_deliveries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  issue_key text not null,
  notified_at timestamptz not null default now(),
  primary key(user_id,issue_key)
);
alter table public.trackunit_health_deliveries enable row level security;
revoke all on public.trackunit_health_deliveries from public, anon, authenticated;
grant all on public.trackunit_health_deliveries to service_role;
create table public.trackunit_health_runs (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  checked integer not null,
  total integer not null,
  failures integer not null,
  next_pin text,
  notification_count integer not null
);
alter table public.trackunit_health_runs enable row level security;
revoke all on public.trackunit_health_runs from public, anon, authenticated;
grant select on public.trackunit_health_runs to authenticated;
grant all on public.trackunit_health_runs to service_role;
create policy "Admins read Manitou scan status" on public.trackunit_health_runs for select to authenticated
using (exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'));
-- Invoker rights, executable only by the trusted scheduled job. Recipients cannot be supplied.
create function public.deliver_trackunit_health_digest(issues jsonb, scanned integer, fleet_total integer, failed integer, next_start text default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare sent integer;
begin
  if jsonb_typeof(issues) <> 'array' or jsonb_array_length(issues)>10000 then raise exception 'Invalid health digest'; end if;
  with incoming as (
    select distinct on (x->>'key') x->>'key' issue_key, left(x->>'summary',350) summary
    from jsonb_array_elements(issues) x where length(x->>'key') between 1 and 250
  ), eligible as (
    insert into public.trackunit_health_deliveries(user_id,issue_key,notified_at)
    select p.id,i.issue_key,now() from public.profiles p cross join incoming i where p.role='admin'
    on conflict(user_id,issue_key) do update set notified_at=excluded.notified_at
    where public.trackunit_health_deliveries.notified_at < now()-interval '24 hours'
    returning user_id,issue_key
  ), grouped as (
    select e.user_id,count(*) n,left(string_agg(i.summary,E'\n' order by e.issue_key),1800) detail
    from eligible e join incoming i using(issue_key) group by e.user_id
  ), delivered as (
    insert into public.notifications(user_id,ticket_id,type,title,body)
    select user_id,null,'trackunit_health',format('Manitou Fleet Health: %s warnings to review',n),
      detail||E'\nOpen Reports → Fleet Health for suggested checks. Reported faults are not confirmed active.'
    from grouped returning id
  ) select count(*) into sent from delivered;
  insert into public.trackunit_health_runs(checked,total,failures,notification_count,next_pin) values(scanned,fleet_total,failed,sent,next_start);
  return sent;
end $$;
revoke all on function public.deliver_trackunit_health_digest(jsonb,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.deliver_trackunit_health_digest(jsonb,integer,integer,integer,text) to service_role;

-- Internal fitters use the existing explicit tracking grant for both providers.
create table public.trackunit_mappings (
  pin text primary key check(length(pin) between 1 and 100),
  machine_id uuid not null unique references public.machines(id) on delete cascade,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.trackunit_mappings enable row level security;
revoke all on public.trackunit_mappings from public,anon,authenticated;
grant select,insert,update,delete on public.trackunit_mappings to authenticated;
grant all on public.trackunit_mappings to service_role;
create policy "Tracking users read Manitou links" on public.trackunit_mappings for select to authenticated
using (exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin')
 or exists(select 1 from public.jcb_livelink_access where user_id=(select auth.uid()) and enabled));
create policy "Admins manage Manitou links" on public.trackunit_mappings for all to authenticated
using (exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'))
with check (exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'));
