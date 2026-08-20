create or replace function public.request_front_counter_collection(p_identifier text)
returns table (
  request_id uuid,
  ticket_id uuid,
  job_number text,
  request_summary text,
  machine_reference text,
  bin_location text,
  requested_at timestamptz,
  queue_position bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_identifier text := upper(btrim(coalesce(p_identifier, '')));
  matched_ticket public.tickets;
  matched_request public.front_counter_collection_requests;
  source_name text;
  is_new_request boolean := false;
  display_job_number text;
  display_summary text;
  display_requester text;
  display_bin text;
begin
  if not public.is_front_counter_user(caller_id) then
    raise exception 'Front counter access is required.';
  end if;

  if normalized_identifier = '' then
    raise exception 'Scan a RELAY label or enter a job or collection code.';
  end if;

  select ticket.*
  into matched_ticket
  from public.tickets ticket
  where ticket.status = 'READY'
    and (
      upper(btrim(coalesce(ticket.job_number, ''))) = normalized_identifier
      or exists (
        select 1 from public.label_print_jobs label
        where label.ticket_id = ticket.id
          and upper(label.label_token) = normalized_identifier
      )
      or exists (
        select 1 from public.ticket_collection_codes code
        where code.ticket_id = ticket.id
          and code.collection_code = normalized_identifier
          and code.used_at is null
          and code.expires_at > now()
      )
    )
  order by ticket.updated_at desc
  limit 1;

  if not found then
    raise exception 'No READY job matches that barcode or code.';
  end if;

  source_name := case
    when normalized_identifier like 'RLY-%' then 'label'
    when length(normalized_identifier) = 6 then 'collection_code'
    else 'job_number'
  end;

  select request.*
  into matched_request
  from public.front_counter_collection_requests request
  where request.ticket_id = matched_ticket.id
    and request.state = 'WAITING'
  for update;

  if found then
    update public.front_counter_collection_requests request
    set requested_at = now(),
        requested_by = caller_id,
        request_source = source_name,
        updated_at = now()
    where request.id = matched_request.id
    returning request.* into matched_request;
  else
    insert into public.front_counter_collection_requests (
      ticket_id, requested_by, request_source
    ) values (
      matched_ticket.id, caller_id, source_name
    )
    returning * into matched_request;
    is_new_request := true;
  end if;

  display_job_number := coalesce(nullif(btrim(matched_ticket.job_number), ''), 'TBC');
  display_summary := coalesce(
    nullif(btrim(matched_ticket.request_summary), ''),
    nullif(btrim(matched_ticket.request_details), ''),
    'Parts ready for collection'
  );
  display_requester := coalesce(nullif(btrim(matched_ticket.requester_name), ''), 'A fitter');
  display_bin := coalesce(nullif(btrim(matched_ticket.bin_location), ''), 'check the ticket');

  insert into public.ticket_updates (ticket_id, status, comment)
  values (
    matched_ticket.id,
    'READY',
    'Front counter collection requested at ' ||
      to_char(matched_request.requested_at at time zone 'Europe/London', 'DD Mon YYYY HH24:MI') || '.'
  );

  if is_new_request then
    insert into public.notifications (user_id, ticket_id, type, title, body)
    select
      profile.id,
      matched_ticket.id,
      'front_counter_collection',
      'Fitter waiting: Job ' || display_job_number,
      display_requester || ' is at the Front Counter for ' || display_summary ||
        '. Pick from bin ' || display_bin || '.'
    from public.profiles profile
    where profile.role = 'admin';
  end if;

  return query
  select
    matched_request.id,
    matched_ticket.id,
    display_job_number,
    coalesce(nullif(btrim(matched_ticket.request_summary), ''), nullif(btrim(matched_ticket.request_details), '')),
    coalesce(nullif(btrim(matched_ticket.machine_reference), ''), nullif(btrim(matched_ticket.machine_number), '')),
    matched_ticket.bin_location,
    matched_request.requested_at,
    (
      select count(*)
      from public.front_counter_collection_requests queue
      where queue.state = 'WAITING'
        and (queue.requested_at, queue.id) <= (matched_request.requested_at, matched_request.id)
    );
end;
$$;

revoke all on function public.request_front_counter_collection(text) from public, anon;
grant execute on function public.request_front_counter_collection(text) to authenticated;
