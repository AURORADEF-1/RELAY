alter table public.label_print_jobs
  add column if not exists label_batch_id uuid,
  add column if not exists label_token text,
  add column if not exists ticket_part_id uuid references public.ticket_parts(id) on delete set null,
  add column if not exists part_number text,
  add column if not exists part_description text,
  add column if not exists unit_index integer not null default 1 check (unit_index > 0),
  add column if not exists unit_total integer not null default 1 check (unit_total > 0),
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists issued_at timestamptz,
  add column if not exists issued_by uuid references auth.users(id) on delete set null;

update public.label_print_jobs
set label_batch_id = coalesce(label_batch_id, gen_random_uuid()),
    label_token = coalesce(
      nullif(btrim(label_token), ''),
      'RLY-' || upper(substr(replace(id::text, '-', ''), 1, 16))
    )
where label_batch_id is null
   or nullif(btrim(label_token), '') is null;

alter table public.label_print_jobs
  alter column label_batch_id set default gen_random_uuid(),
  alter column label_batch_id set not null,
  alter column label_token set default (
    'RLY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  ),
  alter column label_token set not null;

create unique index if not exists label_print_jobs_token_idx
  on public.label_print_jobs (label_token);

create index if not exists label_print_jobs_ticket_batch_idx
  on public.label_print_jobs (ticket_id, label_batch_id, created_at desc);

drop policy if exists "Admins can view label validation" on public.label_print_jobs;
create policy "Admins can view label validation"
  on public.label_print_jobs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.role = 'admin'
    )
  );

drop policy if exists "Admins can update label validation" on public.label_print_jobs;
create policy "Admins can update label validation"
  on public.label_print_jobs
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

create or replace function public.verify_part_label(p_label_token text)
returns table (
  label_job_id uuid,
  ticket_id uuid,
  job_number text,
  part_number text,
  part_description text,
  unit_index integer,
  unit_total integer,
  bin_location text,
  print_status text,
  verified_at timestamptz,
  already_verified boolean,
  is_latest_batch boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  matched_job public.label_print_jobs;
  was_verified boolean;
begin
  if caller_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = caller_id
      and profile.role = 'admin'
  ) then
    raise exception 'Admin access is required.';
  end if;

  select job.*
  into matched_job
  from public.label_print_jobs job
  where upper(job.label_token) = upper(btrim(p_label_token))
  limit 1;

  if not found then
    raise exception 'This RELAY part label was not found.';
  end if;

  was_verified := matched_job.verified_at is not null;

  if not was_verified then
    update public.label_print_jobs job
    set verified_at = now(),
        verified_by = caller_id,
        updated_at = now()
    where job.id = matched_job.id
    returning job.* into matched_job;
  end if;

  return query
  select
    matched_job.id,
    matched_job.ticket_id,
    matched_job.job_number,
    matched_job.part_number,
    matched_job.part_description,
    matched_job.unit_index,
    matched_job.unit_total,
    matched_job.bin_location,
    matched_job.status,
    matched_job.verified_at,
    was_verified,
    matched_job.label_batch_id = (
      select latest.label_batch_id
      from public.label_print_jobs latest
      where latest.ticket_id = matched_job.ticket_id
      order by latest.created_at desc, latest.id desc
      limit 1
    );
end;
$$;

create or replace function public.mark_ticket_labels_issued(p_ticket_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  latest_batch_id uuid;
  affected_rows integer;
begin
  if caller_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = caller_id
      and profile.role = 'admin'
  ) then
    raise exception 'Admin access is required.';
  end if;

  select job.label_batch_id
  into latest_batch_id
  from public.label_print_jobs job
  where job.ticket_id = p_ticket_id
  order by job.created_at desc, job.id desc
  limit 1;

  if latest_batch_id is null then
    return 0;
  end if;

  update public.label_print_jobs job
  set issued_at = coalesce(job.issued_at, now()),
      issued_by = coalesce(job.issued_by, caller_id),
      updated_at = now()
  where job.ticket_id = p_ticket_id
    and job.label_batch_id = latest_batch_id
    and job.verified_at is not null;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.verify_part_label(text) from public, anon;
revoke all on function public.mark_ticket_labels_issued(uuid) from public, anon;
grant execute on function public.verify_part_label(text) to authenticated;
grant execute on function public.mark_ticket_labels_issued(uuid) to authenticated;

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
    and station.is_default
  order by station.created_at
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

revoke all on function public.queue_ready_ticket_label() from public, anon, authenticated;

drop trigger if exists queue_ready_ticket_label on public.tickets;
create trigger queue_ready_ticket_label
after insert or update of status, bin_location on public.tickets
for each row
execute function public.queue_ready_ticket_label();

comment on column public.label_print_jobs.label_batch_id is
  'Groups the individual unit labels generated by one READY transition.';
comment on column public.label_print_jobs.label_token is
  'Stable unique Code 128 value scanned to validate one physical part label.';
comment on function public.verify_part_label(text) is
  'Pilot-mode soft validation for a scanned physical RELAY part label; it does not block status changes.';
comment on function public.mark_ticket_labels_issued(uuid) is
  'Marks verified labels in the latest READY batch as issued after collection verification.';
comment on function public.queue_ready_ticket_label() is
  'Queues one label per non-cancelled linked part unit, or one fallback ticket label when no parts are linked.';
