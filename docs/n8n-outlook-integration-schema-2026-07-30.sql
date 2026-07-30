-- Private audit and idempotency ledger for the n8n Outlook integration.
-- The table is not accessible to browser roles; only RELAY's server-side
-- service-role client can read or write it.
create table if not exists public.outlook_integration_events (
  id uuid primary key default gen_random_uuid(),
  message_id_hash text not null unique,
  conversation_id text,
  sender_email text not null,
  subject text not null,
  received_at timestamptz not null,
  classification text not null,
  job_number text,
  po_number text,
  machine_reference text,
  processing_status text not null default 'PROCESSING',
  matched_ticket_id uuid references public.tickets (id) on delete set null,
  match_reason text,
  candidate_count integer not null default 0,
  error_code text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outlook_integration_events_classification_check
    check (classification in (
      'EXACT_JOB_MATCH_CANDIDATE',
      'EXACT_PO_MATCH_CANDIDATE',
      'MACHINE_MATCH_CANDIDATE',
      'MANUAL_REVIEW'
    )),
  constraint outlook_integration_events_status_check
    check (processing_status in ('PROCESSING', 'SUCCESS', 'REVIEW_REQUIRED', 'FAILED')),
  constraint outlook_integration_events_candidate_count_check
    check (candidate_count >= 0)
);

create index if not exists outlook_integration_events_received_idx
on public.outlook_integration_events (received_at desc);

create index if not exists outlook_integration_events_status_idx
on public.outlook_integration_events (processing_status, created_at desc);

create index if not exists outlook_integration_events_ticket_idx
on public.outlook_integration_events (matched_ticket_id, created_at desc)
where matched_ticket_id is not null;

alter table public.outlook_integration_events enable row level security;

revoke all on table public.outlook_integration_events from anon, authenticated;
grant select, insert, update on table public.outlook_integration_events to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.n8n_outlook_credentials (
  singleton boolean primary key default true check (singleton),
  token_hash text not null,
  updated_at timestamptz not null default now()
);

alter table private.n8n_outlook_credentials enable row level security;
revoke all on table private.n8n_outlook_credentials from public, anon, authenticated;

create or replace function public.process_n8n_outlook_message(
  p_token text,
  p_message jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  expected_hash text;
  message_hash text;
  event_id uuid;
  existing_event public.outlook_integration_events%rowtype;
  job_ref text := nullif(btrim(p_message ->> 'job_number'), '');
  po_ref text := nullif(btrim(p_message ->> 'po_number'), '');
  job_ids uuid[] := '{}'::uuid[];
  po_ids uuid[] := '{}'::uuid[];
  intersection_ids uuid[] := '{}'::uuid[];
  combined_ids uuid[] := '{}'::uuid[];
  selected_ticket_id uuid;
  selected_ticket_status text;
  resolved_reason text;
  resolved_count integer := 0;
begin
  select credentials.token_hash
  into expected_hash
  from private.n8n_outlook_credentials as credentials
  where credentials.singleton = true;

  if
    expected_hash is null
    or p_token is null
    or encode(extensions.digest(p_token, 'sha256'), 'hex') <> expected_hash
  then
    raise insufficient_privilege using message = 'n8n Outlook authentication failed';
  end if;

  if
    nullif(btrim(p_message ->> 'internet_message_id'), '') is null
    or nullif(btrim(p_message ->> 'sender_email'), '') is null
    or nullif(btrim(p_message ->> 'subject'), '') is null
  then
    raise data_exception using message = 'Invalid Outlook message payload';
  end if;

  message_hash := encode(
    extensions.digest(btrim(p_message ->> 'internet_message_id'), 'sha256'),
    'hex'
  );

  insert into public.outlook_integration_events (
    message_id_hash,
    conversation_id,
    sender_email,
    subject,
    received_at,
    classification,
    job_number,
    po_number,
    machine_reference,
    processing_status
  )
  values (
    message_hash,
    nullif(btrim(p_message ->> 'conversation_id'), ''),
    lower(btrim(p_message ->> 'sender_email')),
    left(btrim(p_message ->> 'subject'), 1000),
    (p_message ->> 'received_at')::timestamptz,
    p_message ->> 'classification',
    job_ref,
    po_ref,
    nullif(btrim(p_message ->> 'machine_reference'), ''),
    'PROCESSING'
  )
  on conflict (message_id_hash) do nothing
  returning id into event_id;

  if event_id is null then
    select events.*
    into existing_event
    from public.outlook_integration_events as events
    where events.message_id_hash = message_hash;

    return jsonb_build_object(
      'duplicate', true,
      'outcome', existing_event.processing_status,
      'eventId', existing_event.id,
      'ticketId', existing_event.matched_ticket_id,
      'reason', existing_event.match_reason,
      'candidateCount', existing_event.candidate_count
    );
  end if;

  if job_ref is not null then
    select coalesce(array_agg(matches.id), '{}'::uuid[])
    into job_ids
    from (
      select tickets.id
      from public.tickets
      where lower(btrim(tickets.job_number)) = lower(job_ref)
      limit 3
    ) as matches;
  end if;

  if po_ref is not null then
    select coalesce(array_agg(matches.id), '{}'::uuid[])
    into po_ids
    from (
      select tickets.id
      from public.tickets
      where lower(btrim(tickets.purchase_order_number)) = lower(po_ref)
      union
      select orders.ticket_id
      from public.ticket_purchase_orders as orders
      where lower(btrim(orders.purchase_order_number)) = lower(po_ref)
      limit 3
    ) as matches;
  end if;

  if job_ref is null and po_ref is null then
    resolved_reason := 'NO_REFERENCE';
  elsif job_ref is not null and po_ref is not null then
    select coalesce(array_agg(job_id), '{}'::uuid[])
    into intersection_ids
    from unnest(job_ids) as job_id
    where job_id = any(po_ids);

    if cardinality(intersection_ids) = 1 then
      selected_ticket_id := intersection_ids[1];
      resolved_reason := 'EXACT_JOB_AND_PO';
      resolved_count := 1;
    else
      select coalesce(array_agg(distinct candidate_id), '{}'::uuid[])
      into combined_ids
      from unnest(job_ids || po_ids) as candidate_id;
      resolved_count := cardinality(combined_ids);
      resolved_reason := case
        when cardinality(job_ids) = 1 and cardinality(po_ids) = 1
          then 'CONFLICTING_REFERENCES'
        when resolved_count > 1 then 'MULTIPLE_MATCHES'
        else 'NO_MATCH'
      end;
    end if;
  elsif job_ref is not null then
    resolved_count := cardinality(job_ids);
    if resolved_count = 1 then
      selected_ticket_id := job_ids[1];
      resolved_reason := 'EXACT_JOB';
    else
      resolved_reason := case when resolved_count > 1 then 'MULTIPLE_MATCHES' else 'NO_MATCH' end;
    end if;
  else
    resolved_count := cardinality(po_ids);
    if resolved_count = 1 then
      selected_ticket_id := po_ids[1];
      resolved_reason := 'EXACT_PO';
    else
      resolved_reason := case when resolved_count > 1 then 'MULTIPLE_MATCHES' else 'NO_MATCH' end;
    end if;
  end if;

  if selected_ticket_id is null then
    update public.outlook_integration_events
    set
      processing_status = 'REVIEW_REQUIRED',
      match_reason = resolved_reason,
      candidate_count = resolved_count,
      updated_at = now()
    where id = event_id;

    return jsonb_build_object(
      'duplicate', false,
      'outcome', 'REVIEW_REQUIRED',
      'eventId', event_id,
      'ticketId', null,
      'reason', resolved_reason,
      'candidateCount', resolved_count
    );
  end if;

  select tickets.status
  into selected_ticket_status
  from public.tickets
  where tickets.id = selected_ticket_id;

  insert into public.ticket_updates (ticket_id, status, comment)
  values (
    selected_ticket_id,
    selected_ticket_status,
    left(p_message ->> 'ticket_comment', 5000)
  );

  update public.outlook_integration_events
  set
    processing_status = 'SUCCESS',
    matched_ticket_id = selected_ticket_id,
    match_reason = resolved_reason,
    candidate_count = 1,
    processed_at = now(),
    updated_at = now()
  where id = event_id;

  return jsonb_build_object(
    'duplicate', false,
    'outcome', 'SUCCESS',
    'eventId', event_id,
    'ticketId', selected_ticket_id,
    'reason', resolved_reason,
    'candidateCount', 1
  );
end;
$function$;

revoke all on function public.process_n8n_outlook_message(text, jsonb)
from public, authenticated;
grant execute on function public.process_n8n_outlook_message(text, jsonb) to anon;
