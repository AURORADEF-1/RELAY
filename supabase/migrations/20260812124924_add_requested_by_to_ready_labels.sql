alter table public.label_print_jobs
  add column if not exists requested_by text;

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

comment on column public.label_print_jobs.requested_by is
  'Requester name snapshotted when the ticket enters READY for physical label printing.';
comment on function public.queue_ready_ticket_label() is
  'Queues one label per linked part unit and snapshots the requester and READY time for the physical label.';
