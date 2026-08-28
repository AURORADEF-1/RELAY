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
after insert or update of status, bin_location on public.tickets
for each row
execute function public.queue_ready_ticket_label();

comment on function public.queue_ready_ticket_label() is
  'Trigger-only function that queues a READY ticket after its collection bin is available.';
