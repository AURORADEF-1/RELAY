alter table public.label_print_stations
  add column if not exists is_backup boolean not null default false;

create unique index if not exists label_print_stations_one_backup_idx
  on public.label_print_stations (is_backup)
  where is_backup;

update public.label_print_stations
set is_default = false,
    is_backup = false,
    updated_at = now()
where is_default or is_backup;

update public.label_print_stations station
set enabled = true,
    auto_print = true,
    is_default = true,
    is_backup = false,
    transport = 'cups',
    last_error = null,
    updated_at = now()
from auth.users users
where users.id = station.user_id
  and lower(users.email) = 'frontcounter.user@mlp.local';

update public.label_print_stations station
set enabled = true,
    auto_print = true,
    is_default = false,
    is_backup = true,
    transport = 'dymo_connect',
    updated_at = now()
from auth.users users
where users.id = station.user_id
  and lower(users.email) = 'samanthac.admin@mlp.local';

create or replace function public.reroute_label_jobs_to_backup(p_primary_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  backup_user_id uuid;
  affected_rows integer := 0;
begin
  select station.user_id
  into backup_user_id
  from public.label_print_stations station
  where station.is_backup
    and station.enabled
    and station.auto_print
    and station.last_error is null
  order by station.created_at, station.user_id
  limit 1;

  if backup_user_id is null then
    return 0;
  end if;

  update public.label_print_jobs job
  set target_user_id = backup_user_id,
      status = 'QUEUED',
      next_attempt_at = now(),
      claimed_at = null,
      claimed_by_session = null,
      last_error = null,
      updated_at = now()
  where job.target_user_id = p_primary_user_id
    and job.status in ('QUEUED', 'RETRY');

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.reroute_label_jobs_to_backup(uuid)
  from public, anon, authenticated;

create or replace function public.reroute_label_jobs_on_station_fault()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_default
    and new.enabled
    and new.auto_print
    and new.last_error is not null
    and new.last_error is distinct from old.last_error
  then
    perform public.reroute_label_jobs_to_backup(new.user_id);
  end if;

  return new;
end;
$$;

revoke all on function public.reroute_label_jobs_on_station_fault()
  from public, anon, authenticated;

drop trigger if exists reroute_label_jobs_on_station_fault
  on public.label_print_stations;
create trigger reroute_label_jobs_on_station_fault
after update of last_error on public.label_print_stations
for each row
execute function public.reroute_label_jobs_on_station_fault();

create or replace function public.route_unhealthy_primary_jobs_to_backup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  primary_station public.label_print_stations;
begin
  if caller_id is null or not exists (
    select 1
    from public.label_print_stations backup
    where backup.user_id = caller_id
      and backup.is_backup
      and backup.enabled
      and backup.auto_print
      and backup.last_error is null
  ) then
    raise exception 'An available backup print station is required.';
  end if;

  select station.*
  into primary_station
  from public.label_print_stations station
  where station.is_default
  limit 1;

  if not found then
    return 0;
  end if;

  if primary_station.enabled
    and primary_station.auto_print
    and primary_station.last_error is null
    and primary_station.last_seen_at > now() - interval '90 seconds'
  then
    return 0;
  end if;

  return public.reroute_label_jobs_to_backup(primary_station.user_id);
end;
$$;

revoke all on function public.route_unhealthy_primary_jobs_to_backup()
  from public, anon;
grant execute on function public.route_unhealthy_primary_jobs_to_backup()
  to authenticated;

create or replace function public.queue_ready_ticket_label()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  print_station_user_id uuid;
  current_part record;
  unit_number integer;
  queued_part boolean := false;
  new_batch_id uuid := gen_random_uuid();
begin
  if new.status <> 'READY'
    or nullif(btrim(new.bin_location), '') is null
    or (
      tg_op = 'UPDATE'
      and old.status is not distinct from new.status
      and nullif(btrim(old.bin_location), '') is not null
    )
  then
    return new;
  end if;

  select station.user_id
  into print_station_user_id
  from public.label_print_stations station
  where station.enabled
    and station.auto_print
    and station.last_error is null
    and (
      (
        station.is_default
        and station.last_seen_at > now() - interval '90 seconds'
      )
      or station.is_backup
    )
  order by
    case when station.is_default then 0 else 1 end,
    station.created_at,
    station.user_id
  limit 1;

  if print_station_user_id is null then
    return new;
  end if;

  for current_part in
    select
      part.id,
      coalesce(nullif(btrim(part.part_number), ''), 'UNNUMBERED') as part_number,
      coalesce(nullif(btrim(part.part_description), ''), 'Linked part') as part_description,
      greatest(coalesce(part.quantity, 1), 1) as quantity
    from public.ticket_parts part
    where part.ticket_id = new.id
      and part.part_status <> 'CANCELLED'
    order by part.created_at, part.id
  loop
    queued_part := true;

    for unit_number in 1..current_part.quantity loop
      insert into public.label_print_jobs (
        ticket_id,
        target_user_id,
        label_batch_id,
        ticket_part_id,
        job_number,
        requested_by,
        machine_reference,
        bin_location,
        request_summary,
        part_number,
        part_description,
        unit_index,
        unit_total,
        ready_at
      ) values (
        new.id,
        print_station_user_id,
        new_batch_id,
        current_part.id,
        coalesce(nullif(btrim(new.job_number), ''), 'TBC'),
        coalesce(nullif(btrim(new.requester_name), ''), 'Not recorded'),
        coalesce(nullif(btrim(new.machine_reference), ''), nullif(btrim(new.machine_number), '')),
        btrim(new.bin_location),
        coalesce(nullif(btrim(new.request_summary), ''), nullif(btrim(new.request_details), '')),
        current_part.part_number,
        current_part.part_description,
        unit_number,
        current_part.quantity,
        coalesce(new.ready_at, now())
      );
    end loop;
  end loop;

  if not queued_part then
    insert into public.label_print_jobs (
      ticket_id,
      target_user_id,
      label_batch_id,
      job_number,
      requested_by,
      machine_reference,
      bin_location,
      request_summary,
      unit_index,
      unit_total,
      ready_at
    ) values (
      new.id,
      print_station_user_id,
      new_batch_id,
      coalesce(nullif(btrim(new.job_number), ''), 'TBC'),
      coalesce(nullif(btrim(new.requester_name), ''), 'Not recorded'),
      coalesce(nullif(btrim(new.machine_reference), ''), nullif(btrim(new.machine_number), '')),
      btrim(new.bin_location),
      coalesce(nullif(btrim(new.request_summary), ''), nullif(btrim(new.request_details), '')),
      1,
      1,
      coalesce(new.ready_at, now())
    );
  end if;

  return new;
end;
$$;

revoke all on function public.queue_ready_ticket_label()
  from public, anon, authenticated;

comment on column public.label_print_stations.is_backup is
  'Marks Samantha as the automatic fallback when the default Front Counter CUPS station is unhealthy.';
comment on function public.route_unhealthy_primary_jobs_to_backup() is
  'Allows only the configured backup station to adopt queued labels when the default station has an error or stale heartbeat.';
