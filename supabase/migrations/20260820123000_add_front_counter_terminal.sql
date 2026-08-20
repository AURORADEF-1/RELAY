alter table public.profiles
  add column if not exists interface_mode text not null default 'standard'
  check (interface_mode in ('standard', 'front_counter'));

alter table public.label_print_stations
  add column if not exists transport text not null default 'dymo_connect'
  check (transport in ('dymo_connect', 'cups')),
  add column if not exists local_endpoint text;

create table if not exists public.front_counter_collection_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  request_source text not null check (request_source in ('job_number', 'label', 'collection_code')),
  state text not null default 'WAITING' check (state in ('WAITING', 'COLLECTED', 'CANCELLED')),
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists front_counter_collection_waiting_ticket_idx
  on public.front_counter_collection_requests (ticket_id)
  where state = 'WAITING';

create index if not exists front_counter_collection_queue_idx
  on public.front_counter_collection_requests (state, requested_at, id);

alter table public.front_counter_collection_requests enable row level security;
revoke all on table public.front_counter_collection_requests from public, anon, authenticated;

drop policy if exists "Admins can inspect front counter collection requests"
  on public.front_counter_collection_requests;
create policy "Admins can inspect front counter collection requests"
  on public.front_counter_collection_requests
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

grant select on public.front_counter_collection_requests to authenticated;

insert into public.profiles (id, full_name, role, interface_mode)
select users.id, 'Front Counter', 'requester', 'front_counter'
from auth.users users
where lower(users.email) = 'frontcounter.user@mlp.local'
on conflict (id) do update
set full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    interface_mode = excluded.interface_mode;

insert into public.label_print_stations (
  user_id,
  station_name,
  printer_name,
  enabled,
  auto_print,
  is_default,
  transport,
  local_endpoint
)
select
  users.id,
  'Front Counter CUPS Station',
  null,
  false,
  true,
  false,
  'cups',
  'http://127.0.0.1:8765'
from auth.users users
where lower(users.email) = 'frontcounter.user@mlp.local'
on conflict (user_id) do update
set station_name = excluded.station_name,
    transport = excluded.transport,
    local_endpoint = excluded.local_endpoint,
    updated_at = now();

create or replace function public.is_front_counter_user(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
      and profile.interface_mode = 'front_counter'
  );
$$;

revoke all on function public.is_front_counter_user(uuid) from public, anon;
grant execute on function public.is_front_counter_user(uuid) to authenticated;

create or replace function public.list_front_counter_wallboard_tickets()
returns table (
  id uuid,
  job_number text,
  machine_reference text,
  requester_name text,
  request_summary text,
  request_details text,
  assigned_to text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  ordered_at timestamptz,
  supplier_name text,
  order_amount numeric,
  is_urgent boolean,
  urgent_flagged_at timestamptz,
  urgent_reminder_dismissed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_front_counter_user(auth.uid()) then
    raise exception 'Front counter access is required.';
  end if;

  return query
  select
    ticket.id,
    ticket.job_number,
    coalesce(nullif(btrim(ticket.machine_reference), ''), nullif(btrim(ticket.machine_number), '')),
    ticket.requester_name,
    ticket.request_summary,
    ticket.request_details,
    ticket.assigned_to,
    ticket.status,
    ticket.created_at,
    ticket.updated_at,
    ticket.ordered_at,
    null::text,
    null::numeric,
    ticket.is_urgent,
    ticket.urgent_flagged_at,
    ticket.urgent_reminder_dismissed_at
  from public.tickets ticket
  where ticket.status in ('PENDING', 'ESTIMATE', 'QUOTE', 'QUERY', 'IN_PROGRESS', 'ORDERED', 'READY')
  order by ticket.updated_at desc
  limit 1000;
end;
$$;

revoke all on function public.list_front_counter_wallboard_tickets() from public, anon;
grant execute on function public.list_front_counter_wallboard_tickets() to authenticated;

create or replace function public.list_front_counter_collection_requests()
returns table (
  request_id uuid,
  ticket_id uuid,
  job_number text,
  machine_reference text,
  requester_name text,
  request_summary text,
  bin_location text,
  requested_at timestamptz,
  queue_position bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_front_counter_user(auth.uid())
    or exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid() and profile.role = 'admin'
    )
  ) then
    raise exception 'Front counter or admin access is required.';
  end if;

  return query
  select
    request.id,
    ticket.id,
    coalesce(nullif(btrim(ticket.job_number), ''), 'TBC'),
    coalesce(nullif(btrim(ticket.machine_reference), ''), nullif(btrim(ticket.machine_number), '')),
    ticket.requester_name,
    coalesce(nullif(btrim(ticket.request_summary), ''), nullif(btrim(ticket.request_details), '')),
    ticket.bin_location,
    request.requested_at,
    row_number() over (order by request.requested_at, request.id)
  from public.front_counter_collection_requests request
  join public.tickets ticket on ticket.id = request.ticket_id
  where request.state = 'WAITING'
    and ticket.status = 'READY'
  order by request.requested_at, request.id;
end;
$$;

revoke all on function public.list_front_counter_collection_requests() from public, anon;
grant execute on function public.list_front_counter_collection_requests() to authenticated;

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
  end if;

  insert into public.ticket_updates (ticket_id, status, comment)
  values (
    matched_ticket.id,
    'READY',
    'Front counter collection requested at ' ||
      to_char(matched_request.requested_at at time zone 'Europe/London', 'DD Mon YYYY HH24:MI') || '.'
  );

  return query
  select
    matched_request.id,
    matched_ticket.id,
    coalesce(nullif(btrim(matched_ticket.job_number), ''), 'TBC'),
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

create or replace function public.complete_front_counter_collection(p_identifier text)
returns table (
  ticket_id uuid,
  job_number text,
  completed_at timestamptz,
  verified_label boolean,
  issued_labels integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_identifier text := upper(btrim(coalesce(p_identifier, '')));
  caller_name text;
  matched_ticket public.tickets;
  matched_request public.front_counter_collection_requests;
  matched_label public.label_print_jobs;
  completion_time timestamptz := now();
  did_verify_label boolean := false;
  issued_count integer := 0;
  latest_batch uuid;
begin
  select coalesce(nullif(btrim(profile.full_name), ''), 'Front Counter')
  into caller_name
  from public.profiles profile
  where profile.id = caller_id
    and (profile.role = 'admin' or profile.interface_mode = 'front_counter');

  if not found then
    raise exception 'Front counter or admin access is required.';
  end if;

  select request.*
  into matched_request
  from public.front_counter_collection_requests request
  join public.tickets ticket on ticket.id = request.ticket_id
  where request.state = 'WAITING'
    and ticket.status = 'READY'
    and (
      upper(btrim(coalesce(ticket.job_number, ''))) = normalized_identifier
      or exists (
        select 1 from public.label_print_jobs label
        where label.ticket_id = ticket.id and upper(label.label_token) = normalized_identifier
      )
      or exists (
        select 1 from public.ticket_collection_codes code
        where code.ticket_id = ticket.id and code.collection_code = normalized_identifier
      )
    )
  order by request.requested_at
  limit 1
  for update of request;

  if not found then
    raise exception 'No waiting READY collection matches that job ticket.';
  end if;

  select ticket.*
  into matched_ticket
  from public.tickets ticket
  where ticket.id = matched_request.ticket_id
    and ticket.status = 'READY'
  for update;

  if not found then
    raise exception 'The waiting collection is no longer READY.';
  end if;

  if normalized_identifier like 'RLY-%' then
    select label.*
    into matched_label
    from public.label_print_jobs label
    where label.ticket_id = matched_ticket.id
      and upper(label.label_token) = normalized_identifier
    limit 1;

    if found then
      update public.label_print_jobs label
      set verified_at = coalesce(label.verified_at, completion_time),
          verified_by = coalesce(label.verified_by, caller_id),
          updated_at = completion_time
      where label.id = matched_label.id;
      did_verify_label := true;
    end if;
  end if;

  select label.label_batch_id
  into latest_batch
  from public.label_print_jobs label
  where label.ticket_id = matched_ticket.id
  order by label.created_at desc, label.id desc
  limit 1;

  if latest_batch is not null then
    update public.label_print_jobs label
    set issued_at = coalesce(label.issued_at, completion_time),
        issued_by = coalesce(label.issued_by, caller_id),
        updated_at = completion_time
    where label.ticket_id = matched_ticket.id
      and label.label_batch_id = latest_batch
      and label.verified_at is not null;
    get diagnostics issued_count = row_count;
  end if;

  update public.front_counter_collection_requests request
  set state = 'COLLECTED',
      completed_by = caller_id,
      completed_at = completion_time,
      updated_at = completion_time
  where request.id = matched_request.id;

  update public.tickets ticket
  set status = 'COMPLETED', updated_at = completion_time
  where ticket.id = matched_ticket.id and ticket.status = 'READY';

  insert into public.ticket_updates (ticket_id, status, comment)
  values (
    matched_ticket.id,
    'COMPLETED',
    format(
      'Parts collected and job auto-completed at the Front Counter by %s at %s. %s verified label(s) issued.',
      caller_name,
      to_char(completion_time at time zone 'Europe/London', 'DD Mon YYYY HH24:MI'),
      issued_count
    )
  );

  if matched_ticket.user_id is not null then
    insert into public.notifications (user_id, ticket_id, type, title, body)
    values (
      matched_ticket.user_id,
      matched_ticket.id,
      'status_update',
      'Job ' || coalesce(nullif(btrim(matched_ticket.job_number), ''), 'TBC') || ' completed',
      'Your parts were verified as collected at the Front Counter.'
    );
  end if;

  return query select matched_ticket.id,
    coalesce(nullif(btrim(matched_ticket.job_number), ''), 'TBC'),
    completion_time,
    did_verify_label,
    issued_count;
end;
$$;

revoke all on function public.complete_front_counter_collection(text) from public, anon;
grant execute on function public.complete_front_counter_collection(text) to authenticated;

create or replace function public.activate_front_counter_cups_station()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  station_user_id uuid;
begin
  if not exists (
    select 1 from public.profiles profile
    where profile.id = caller_id and profile.role = 'admin'
  ) then
    raise exception 'Admin access is required.';
  end if;

  select users.id into station_user_id
  from auth.users users
  join public.profiles profile on profile.id = users.id
  where profile.interface_mode = 'front_counter'
  order by users.created_at
  limit 1;

  if station_user_id is null then
    raise exception 'The Front Counter account is not configured.';
  end if;

  update public.label_print_stations
  set is_default = false, updated_at = now()
  where is_default;

  update public.label_print_stations
  set enabled = true,
      auto_print = true,
      is_default = true,
      transport = 'cups',
      last_error = null,
      updated_at = now()
  where user_id = station_user_id;

  return found;
end;
$$;

revoke all on function public.activate_front_counter_cups_station() from public, anon;
grant execute on function public.activate_front_counter_cups_station() to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'front_counter_collection_requests'
  ) then
    alter publication supabase_realtime add table public.front_counter_collection_requests;
  end if;
end
$$;

comment on table public.front_counter_collection_requests is
  'Touch-terminal queue of fitters waiting to collect READY parts. Collection verification closes the ticket atomically.';
comment on function public.activate_front_counter_cups_station() is
  'Explicit commissioning switch. Samantha remains the default print station until an admin invokes this after the Pi CUPS bridge is verified.';
