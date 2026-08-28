create table if not exists public.label_print_stations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  station_name text not null,
  printer_name text,
  enabled boolean not null default true,
  auto_print boolean not null default true,
  is_default boolean not null default false,
  last_seen_at timestamptz,
  last_printer_check_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists label_print_stations_one_default_idx
  on public.label_print_stations (is_default)
  where is_default;

create table if not exists public.label_print_jobs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'PRINTING', 'PRINTED', 'RETRY', 'FAILED', 'CANCELLED')),
  job_number text not null,
  machine_reference text,
  bin_location text not null,
  request_summary text,
  ready_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 20 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by_session uuid,
  printed_at timestamptz,
  printer_name text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists label_print_jobs_station_queue_idx
  on public.label_print_jobs (target_user_id, status, next_attempt_at, created_at);

alter table public.label_print_stations enable row level security;
alter table public.label_print_jobs enable row level security;

drop policy if exists "Print station users can view their station" on public.label_print_stations;
create policy "Print station users can view their station"
  on public.label_print_stations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Print station users can update their station" on public.label_print_stations;
create policy "Print station users can update their station"
  on public.label_print_stations
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Print station users can view their jobs" on public.label_print_jobs;
create policy "Print station users can view their jobs"
  on public.label_print_jobs
  for select
  to authenticated
  using ((select auth.uid()) = target_user_id);

drop policy if exists "Print station users can update their jobs" on public.label_print_jobs;
create policy "Print station users can update their jobs"
  on public.label_print_jobs
  for update
  to authenticated
  using ((select auth.uid()) = target_user_id)
  with check ((select auth.uid()) = target_user_id);

grant select, update on public.label_print_stations to authenticated;
grant select, update on public.label_print_jobs to authenticated;

create or replace function public.claim_next_label_print_job(p_session_id uuid)
returns setof public.label_print_jobs
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  claimed_job_id uuid;
begin
  if auth.uid() is null or p_session_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.label_print_stations station
    where station.user_id = auth.uid()
      and station.enabled
      and station.auto_print
  ) then
    return;
  end if;

  select job.id
  into claimed_job_id
  from public.label_print_jobs job
  where job.target_user_id = auth.uid()
    and job.attempts < job.max_attempts
    and (
      (job.status in ('QUEUED', 'RETRY') and job.next_attempt_at <= now())
      or (job.status = 'PRINTING' and job.claimed_at < now() - interval '2 minutes')
    )
  order by job.created_at, job.id
  for update skip locked
  limit 1;

  if claimed_job_id is null then
    return;
  end if;

  return query
  update public.label_print_jobs
  set status = 'PRINTING',
      attempts = attempts + 1,
      claimed_at = now(),
      claimed_by_session = p_session_id,
      last_error = null,
      updated_at = now()
  where id = claimed_job_id
  returning *;
end;
$$;

create or replace function public.complete_label_print_job(
  p_job_id uuid,
  p_session_id uuid,
  p_printer_name text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  affected_rows integer;
begin
  update public.label_print_jobs
  set status = 'PRINTED',
      printed_at = now(),
      printer_name = nullif(btrim(p_printer_name), ''),
      last_error = null,
      updated_at = now()
  where id = p_job_id
    and target_user_id = auth.uid()
    and status = 'PRINTING'
    and claimed_by_session = p_session_id;

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

create or replace function public.fail_label_print_job(
  p_job_id uuid,
  p_session_id uuid,
  p_error text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  affected_rows integer;
begin
  update public.label_print_jobs
  set status = case when attempts >= max_attempts then 'FAILED' else 'RETRY' end,
      next_attempt_at = now() + make_interval(secs => least(greatest(attempts, 1) * 15, 300)),
      claimed_at = null,
      claimed_by_session = null,
      last_error = left(coalesce(nullif(btrim(p_error), ''), 'Unknown DYMO print error'), 500),
      updated_at = now()
  where id = p_job_id
    and target_user_id = auth.uid()
    and status = 'PRINTING'
    and claimed_by_session = p_session_id;

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

grant execute on function public.claim_next_label_print_job(uuid) to authenticated;
grant execute on function public.complete_label_print_job(uuid, uuid, text) to authenticated;
grant execute on function public.fail_label_print_job(uuid, uuid, text) to authenticated;

create or replace function public.queue_ready_ticket_label()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  print_station_user_id uuid;
begin
  if new.status <> 'READY'
    or nullif(btrim(new.bin_location), '') is null
    or (tg_op = 'UPDATE' and old.status is not distinct from new.status)
  then
    return new;
  end if;

  select station.user_id
  into print_station_user_id
  from public.label_print_stations station
  where station.enabled
    and station.auto_print
    and station.is_default
  order by station.created_at
  limit 1;

  if print_station_user_id is null then
    return new;
  end if;

  insert into public.label_print_jobs (
    ticket_id,
    target_user_id,
    job_number,
    machine_reference,
    bin_location,
    request_summary,
    ready_at
  ) values (
    new.id,
    print_station_user_id,
    coalesce(nullif(btrim(new.job_number), ''), 'TBC'),
    coalesce(nullif(btrim(new.machine_reference), ''), nullif(btrim(new.machine_number), '')),
    btrim(new.bin_location),
    coalesce(nullif(btrim(new.request_summary), ''), nullif(btrim(new.request_details), '')),
    coalesce(new.ready_at, now())
  );

  return new;
end;
$$;

revoke all on function public.queue_ready_ticket_label() from public, anon, authenticated;

drop trigger if exists queue_ready_ticket_label on public.tickets;
create trigger queue_ready_ticket_label
after insert or update of status on public.tickets
for each row
execute function public.queue_ready_ticket_label();

insert into public.label_print_stations (
  user_id,
  station_name,
  enabled,
  auto_print,
  is_default
)
select
  users.id,
  'Samantha C DYMO Station',
  true,
  true,
  true
from auth.users users
where lower(users.email) = 'samanthac.admin@mlp.local'
on conflict (user_id) do update
set station_name = excluded.station_name,
    enabled = true,
    auto_print = true,
    is_default = true,
    updated_at = now();

alter publication supabase_realtime add table public.label_print_jobs;

comment on table public.label_print_stations is
  'Authenticated Relay users whose browser can consume queued DYMO jobs through a locally installed DYMO Connect service.';
comment on table public.label_print_jobs is
  'Durable, user-targeted DYMO print queue populated whenever a ticket first enters READY with a bin location.';
comment on function public.queue_ready_ticket_label() is
  'Trigger-only function that snapshots a READY ticket into the default enabled label station queue.';
