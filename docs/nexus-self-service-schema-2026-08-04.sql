-- RELAY side of the NEXUS Stores Self-Service bridge.
-- Additive only: existing RICO provenance remains valid.

alter table public.ticket_parts
  add column if not exists source_bin_location text,
  add column if not exists source_subgroup text,
  add column if not exists source_requested_quantity integer,
  add column if not exists source_issued_quantity integer,
  add column if not exists source_shortfall_quantity integer,
  add column if not exists source_stock_after integer,
  add column if not exists source_allocation_id uuid,
  add column if not exists source_allocation_status text;

alter table public.ticket_parts
  drop constraint if exists ticket_parts_source_system_check,
  add constraint ticket_parts_source_system_check
    check (source_system is null or source_system in ('RICO', 'NEXUS')),
  drop constraint if exists ticket_parts_source_allocation_status_check,
  add constraint ticket_parts_source_allocation_status_check
    check (
      source_allocation_status is null
      or source_allocation_status in ('PENDING', 'ALLOCATED', 'PARTIAL', 'FAILED')
    ),
  drop constraint if exists ticket_parts_source_quantities_check,
  add constraint ticket_parts_source_quantities_check
    check (
      source_requested_quantity is null
      or (
        source_requested_quantity > 0
        and coalesce(source_issued_quantity, 0) >= 0
        and coalesce(source_shortfall_quantity, 0) >= 0
        and coalesce(source_issued_quantity, 0) + coalesce(source_shortfall_quantity, 0)
          = source_requested_quantity
      )
    );

create index if not exists ticket_parts_nexus_allocation_idx
on public.ticket_parts (source_allocation_id)
where source_system = 'NEXUS';

create table if not exists public.nexus_self_service_requests (
  request_id uuid primary key,
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  fleet_number text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'ALLOCATED', 'PARTIAL', 'FAILED')),
  nexus_allocation_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(fleet_number)) > 0)
);

create index if not exists nexus_self_service_requests_created_idx
on public.nexus_self_service_requests (created_at desc);

alter table public.nexus_self_service_requests enable row level security;

drop policy if exists "nexus self service admin read" on public.nexus_self_service_requests;
drop policy if exists "nexus self service requester read" on public.nexus_self_service_requests;
create policy "nexus self service requester read"
on public.nexus_self_service_requests
for select to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  )
);

revoke all on table public.nexus_self_service_requests from public, anon, authenticated;
grant select on table public.nexus_self_service_requests to authenticated;

create or replace function public.create_nexus_self_service_ticket(
  p_request_id uuid,
  p_machine_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  machine record;
  saved_ticket_id uuid;
  saved_status text;
  line_item jsonb;
  request_summary text;
begin
  if actor_id is null or not exists (
    select 1 from public.profiles p where p.id = actor_id
  ) then
    raise exception 'A RELAY requester profile is required';
  end if;
  if p_request_id is null or p_machine_id is null then
    raise exception 'Request and machine IDs are required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one NEXUS part is required';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'A stores request cannot contain more than 100 parts';
  end if;

  select request.ticket_id, request.status
    into saved_ticket_id, saved_status
  from public.nexus_self_service_requests as request
  where request.request_id = p_request_id
    and request.created_by = actor_id;
  if saved_ticket_id is not null then
    return jsonb_build_object(
      'ticketId', saved_ticket_id,
      'status', saved_status,
      'idempotent', true
    );
  end if;

  select * into machine from public.machines where id = p_machine_id;
  if machine.id is null then
    raise exception 'The selected RELAY machine could not be found';
  end if;
  if nullif(btrim(machine.make), '') is null or nullif(btrim(machine.model), '') is null then
    raise exception 'The RELAY machine requires both make and model';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) item
    where nullif(item ->> 'partId', '') is null
       or nullif(btrim(item ->> 'partNumber'), '') is null
       or nullif(btrim(item ->> 'description'), '') is null
       or coalesce((item ->> 'quantity') ~ '^[1-9][0-9]*$', false) is false
  ) then
    raise exception 'Every NEXUS line requires a part, description and positive quantity';
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1), 'Requester')
    into actor_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = actor_id;

  select string_agg(
    (item ->> 'quantity') || ' × ' || btrim(item ->> 'partNumber'),
    ', '
  ) into request_summary
  from jsonb_array_elements(p_lines) item;

  insert into public.tickets (
    user_id,
    visible_to_user_id,
    requester_name,
    department,
    machine_reference,
    machine_number,
    machine_number_normalized,
    machine_fleet_type,
    machine_item_description,
    machine_make,
    machine_model,
    machine_serial_number,
    machine_status,
    machine_quantity,
    machine_buying_price,
    machine_selling_price,
    machine_source_sheet,
    machine_source_row,
    machine_verified,
    machine_verified_at,
    machine_verified_by,
    request_details,
    request_summary,
    status,
    notes
  ) values (
    actor_id,
    actor_id,
    actor_name,
    'Stores Self-Service',
    machine.machine_number,
    machine.machine_number,
    machine.machine_number_normalized,
    machine.fleet_type,
    machine.item_description,
    machine.make,
    machine.model,
    machine.serial_number,
    machine.status,
    machine.quantity,
    machine.buying_price,
    machine.selling_price,
    machine.source_sheet,
    machine.source_row,
    true,
    now(),
    actor_id::text,
    'NEXUS stores issue for ' || machine.make || ' ' || machine.model || ': ' || request_summary,
    request_summary,
    'PENDING',
    'Created through the NEXUS Stores Self-Service workflow.'
  ) returning id into saved_ticket_id;

  insert into public.nexus_self_service_requests (
    request_id, ticket_id, created_by, fleet_number
  ) values (
    p_request_id, saved_ticket_id, actor_id, machine.machine_number
  );

  for line_item in select value from jsonb_array_elements(p_lines)
  loop
    insert into public.ticket_parts (
      ticket_id,
      created_by,
      updated_by,
      machine_reference,
      machine_number_normalized,
      machine_make,
      machine_model,
      part_description,
      part_number,
      quantity,
      part_status,
      supplier_name,
      notes,
      source_system,
      source_product_id,
      source_price_snapshot,
      source_currency,
      source_stock_snapshot,
      source_checked_at,
      source_search_method,
      source_machine_id,
      source_machine_serial_number,
      source_confirmed_by,
      source_confirmed_at,
      source_bin_location,
      source_subgroup,
      source_requested_quantity,
      source_issued_quantity,
      source_shortfall_quantity,
      source_allocation_status
    ) values (
      saved_ticket_id,
      actor_id,
      actor_id,
      machine.machine_number,
      machine.machine_number_normalized,
      machine.make,
      machine.model,
      btrim(line_item ->> 'description'),
      btrim(line_item ->> 'partNumber'),
      (line_item ->> 'quantity')::integer,
      'REQUESTED',
      nullif(btrim(line_item ->> 'manufacturer'), ''),
      'Awaiting NEXUS stock allocation.',
      'NEXUS',
      line_item ->> 'partId',
      nullif(line_item ->> 'sellPrice', '')::numeric,
      'GBP',
      coalesce(nullif(line_item ->> 'stockAvailable', '')::integer, 0),
      coalesce(nullif(line_item ->> 'checkedAt', '')::timestamptz, now()),
      'MACHINE',
      machine.id,
      machine.serial_number,
      actor_id,
      now(),
      nullif(btrim(line_item ->> 'binLocation'), ''),
      nullif(btrim(line_item ->> 'subgroup'), ''),
      (line_item ->> 'quantity')::integer,
      0,
      (line_item ->> 'quantity')::integer,
      'PENDING'
    );
  end loop;

  insert into public.ticket_updates (ticket_id, status, comment)
  values (
    saved_ticket_id,
    'PENDING',
    'Stores Self-Service ticket created. NEXUS stock allocation pending.'
  );

  return jsonb_build_object(
    'ticketId', saved_ticket_id,
    'status', 'PENDING',
    'idempotent', false
  );
end;
$$;

create or replace function public.finalize_nexus_self_service_ticket(
  p_request_id uuid,
  p_allocation_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  saved_ticket_id uuid;
  line_item jsonb;
  total_issued integer := 0;
  total_shortfall integer := 0;
  shortage_notes text;
  final_status text;
begin
  if actor_id is null or not exists (
    select 1 from public.profiles p where p.id = actor_id
  ) then
    raise exception 'A RELAY requester profile is required';
  end if;

  select ticket_id into saved_ticket_id
  from public.nexus_self_service_requests
  where request_id = p_request_id and created_by = actor_id
  for update;
  if saved_ticket_id is null then
    raise exception 'The NEXUS self-service request could not be found';
  end if;

  for line_item in select value from jsonb_array_elements(p_lines)
  loop
    update public.ticket_parts
    set source_issued_quantity = (line_item ->> 'issuedQuantity')::integer,
        source_shortfall_quantity = (line_item ->> 'shortfallQuantity')::integer,
        source_stock_after = (line_item ->> 'stockAfter')::integer,
        source_allocation_id = p_allocation_id,
        source_allocation_status = case
          when (line_item ->> 'shortfallQuantity')::integer > 0 then 'PARTIAL'
          else 'ALLOCATED'
        end,
        notes = case
          when (line_item ->> 'shortfallQuantity')::integer > 0 then
            'Issued ' || (line_item ->> 'issuedQuantity') || ' from NEXUS. Please order '
            || (line_item ->> 'shortfallQuantity') || ' × ' || (line_item ->> 'partNumber')
            || ' from the ' || coalesce(nullif(btrim(line_item ->> 'manufacturer'), ''), 'relevant')
            || ' manufacturer group.'
          else
            'Issued ' || (line_item ->> 'issuedQuantity') || ' from NEXUS. Bin '
            || coalesce(nullif(btrim(line_item ->> 'binLocation'), ''), 'not recorded') || '.'
        end,
        updated_by = actor_id,
        updated_at = now()
    where ticket_id = saved_ticket_id
      and source_system = 'NEXUS'
      and source_product_id = line_item ->> 'partId';

    total_issued := total_issued + (line_item ->> 'issuedQuantity')::integer;
    total_shortfall := total_shortfall + (line_item ->> 'shortfallQuantity')::integer;
  end loop;

  select string_agg(
    'Please order ' || source_shortfall_quantity || ' × ' || part_number
      || ' from the ' || coalesce(supplier_name, 'relevant') || ' manufacturer group.',
    E'\n'
  ) into shortage_notes
  from public.ticket_parts
  where ticket_id = saved_ticket_id
    and source_system = 'NEXUS'
    and coalesce(source_shortfall_quantity, 0) > 0;

  final_status := case when total_shortfall > 0 then 'PARTIAL' else 'ALLOCATED' end;
  update public.nexus_self_service_requests
  set status = final_status,
      nexus_allocation_id = p_allocation_id,
      error_message = null,
      updated_at = now()
  where request_id = p_request_id and created_by = actor_id;

  insert into public.ticket_updates (ticket_id, status, comment)
  values (
    saved_ticket_id,
    'PENDING',
    'NEXUS issued ' || total_issued || ' item(s).'
      || case when total_shortfall > 0 then E'\n' || shortage_notes else ' All requested stock was allocated.' end
  );

  return jsonb_build_object(
    'ticketId', saved_ticket_id,
    'status', final_status,
    'issuedQuantity', total_issued,
    'shortfallQuantity', total_shortfall,
    'shortageNote', shortage_notes
  );
end;
$$;

revoke all on function public.create_nexus_self_service_ticket(uuid, uuid, jsonb)
from public, anon;
revoke all on function public.finalize_nexus_self_service_ticket(uuid, uuid, jsonb)
from public, anon;
grant execute on function public.create_nexus_self_service_ticket(uuid, uuid, jsonb)
to authenticated;
grant execute on function public.finalize_nexus_self_service_ticket(uuid, uuid, jsonb)
to authenticated;

comment on table public.nexus_self_service_requests is 'Idempotent RELAY outbox for confirmed requester NEXUS stores issues.';
comment on function public.create_nexus_self_service_ticket(uuid, uuid, jsonb) is 'Authenticated requester creation of a RELAY ticket and pending NEXUS part rows.';
comment on function public.finalize_nexus_self_service_ticket(uuid, uuid, jsonb) is 'Requester-owned reconciliation of the idempotent NEXUS allocation result into RELAY.';
