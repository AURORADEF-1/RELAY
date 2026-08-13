alter table public.tickets
  add column nexus_order_id uuid,
  add column nexus_external_order_id text,
  add column nexus_status_synced_at timestamptz,
  add column nexus_status_sync_error text;

create unique index tickets_nexus_order_unique
  on public.tickets (nexus_order_id)
  where nexus_order_id is not null;
create index tickets_nexus_external_order_index
  on public.tickets (nexus_external_order_id)
  where nexus_external_order_id is not null;

comment on column public.tickets.nexus_order_id is
  'NEXUS ecommerce-order UUID. One Shopify order creates one idempotent RELAY retail ticket.';
comment on column public.tickets.nexus_status_synced_at is
  'Last time this RELAY ticket status was confirmed back to NEXUS.';

create function public.accept_nexus_ecommerce_order(
  p_nexus_order_id uuid,
  p_external_order_id text,
  p_order_number text,
  p_currency text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_delivery_address text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_ticket_id uuid;
  existing_ticket_id uuid;
  total_units integer;
  line_summary text;
begin
  if p_nexus_order_id is null then
    raise exception 'NEXUS order ID is required';
  end if;
  if nullif(btrim(coalesce(p_order_number, '')), '') is null then
    raise exception 'Order number is required';
  end if;
  if p_currency is not null and p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter code';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one order line is required';
  end if;
  if jsonb_array_length(p_lines) > 250 then
    raise exception 'An ecommerce order cannot contain more than 250 lines';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as item
    where nullif(btrim(item ->> 'partNumber'), '') is null
       or nullif(btrim(item ->> 'description'), '') is null
       or (item ->> 'quantity') !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'Each order line requires a part number, description and positive quantity';
  end if;

  select id into existing_ticket_id
  from public.tickets
  where nexus_order_id = p_nexus_order_id;
  if existing_ticket_id is not null then
    return jsonb_build_object(
      'ticketId', existing_ticket_id,
      'status', 'processing',
      'idempotentReplay', true
    );
  end if;

  select sum((item ->> 'quantity')::integer),
         string_agg(
           (item ->> 'quantity') || ' x ' || (item ->> 'partNumber') ||
           ' - ' || (item ->> 'description'),
           E'\n' order by item ->> 'partNumber'
         )
    into total_units, line_summary
  from jsonb_array_elements(p_lines) as item;

  insert into public.tickets (
    status, is_retail_sale, retail_sales_reference,
    customer_name, customer_email, customer_phone,
    retail_delivery_method, retail_delivery_address,
    request_summary, request_details,
    nexus_order_id, nexus_external_order_id
  ) values (
    'IN_PROGRESS', true, btrim(p_order_number),
    nullif(btrim(coalesce(p_customer_name, '')), ''),
    nullif(btrim(coalesce(p_customer_email, '')), ''),
    nullif(btrim(coalesce(p_customer_phone, '')), ''),
    'delivery', nullif(btrim(coalesce(p_delivery_address, '')), ''),
    'Shopify order ' || btrim(p_order_number) || ' - ' || total_units || ' item' ||
      case when total_units = 1 then '' else 's' end,
    line_summary,
    p_nexus_order_id, nullif(btrim(coalesce(p_external_order_id, '')), '')
  )
  on conflict (nexus_order_id) where nexus_order_id is not null do nothing
  returning id into saved_ticket_id;

  if saved_ticket_id is null then
    select id into existing_ticket_id
    from public.tickets
    where nexus_order_id = p_nexus_order_id;
    return jsonb_build_object(
      'ticketId', existing_ticket_id,
      'status', 'processing',
      'idempotentReplay', true
    );
  end if;

  insert into public.ticket_parts (
    ticket_id, part_description, part_number, quantity, part_status,
    notes, source_system, source_product_id, source_price_snapshot,
    source_currency, source_stock_snapshot, source_checked_at,
    source_search_method, source_requested_quantity, source_issued_quantity,
    source_shortfall_quantity, source_stock_after, source_allocation_status
  )
  select
    saved_ticket_id,
    item ->> 'description',
    item ->> 'partNumber',
    (item ->> 'quantity')::integer,
    'SOURCED',
    'Shopify SKU ' || coalesce(nullif(item ->> 'sku', ''), item ->> 'partNumber'),
    'NEXUS',
    nullif(item ->> 'partId', ''),
    nullif(item ->> 'unitPrice', '')::numeric,
    p_currency,
    nullif(item ->> 'quantityAfter', '')::integer,
    now(),
    'CATALOGUE',
    (item ->> 'quantity')::integer,
    (item ->> 'quantity')::integer,
    0,
    nullif(item ->> 'quantityAfter', '')::integer,
    'ALLOCATED'
  from jsonb_array_elements(p_lines) as item;

  insert into public.ticket_updates (ticket_id, status, comment)
  values (
    saved_ticket_id,
    'IN_PROGRESS',
    'Shopify order accepted from NEXUS. Stock has been allocated and processing started.'
  );

  return jsonb_build_object(
    'ticketId', saved_ticket_id,
    'status', 'processing',
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.accept_nexus_ecommerce_order(
  uuid, text, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.accept_nexus_ecommerce_order(
  uuid, text, text, text, text, text, text, text, jsonb
) to service_role;
