alter table public.ticket_parts
  add column if not exists received_quantity integer not null default 0,
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references auth.users (id) on delete set null;

update public.ticket_parts
set received_quantity = least(quantity, greatest(0, coalesce(source_issued_quantity, 0))),
    received_at = case
      when coalesce(source_issued_quantity, 0) > 0 then coalesce(source_confirmed_at, updated_at, now())
      else null
    end,
    received_by = case
      when coalesce(source_issued_quantity, 0) > 0 then coalesce(source_confirmed_by, updated_by, created_by)
      else null
    end
where source_system = 'NEXUS'
  and coalesce(source_issued_quantity, 0) > 0;

alter table public.ticket_parts
  drop constraint if exists ticket_parts_received_quantity_check;

alter table public.ticket_parts
  add constraint ticket_parts_received_quantity_check
  check (received_quantity >= 0 and received_quantity <= quantity);

alter table public.ticket_purchase_orders
  drop constraint if exists ticket_purchase_orders_po_status_check;

alter table public.ticket_purchase_orders
  add constraint ticket_purchase_orders_po_status_check
  check (po_status in ('DRAFT', 'SENT', 'PART_RECEIVED', 'RECEIVED', 'CANCELLED'));

create or replace function public.receive_ticket_part(
  p_part_id uuid,
  p_quantity integer
)
returns public.ticket_parts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  received_part public.ticket_parts;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception using errcode = '22023', message = 'Receive quantity must be at least 1.';
  end if;

  update public.ticket_parts
  set received_quantity = least(quantity, received_quantity + p_quantity),
      received_at = now(),
      received_by = auth.uid(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_part_id
    and part_status <> 'CANCELLED'
    and received_quantity < quantity
  returning * into received_part;

  if received_part.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'This linked part is already fully received, cancelled, or unavailable.';
  end if;

  return received_part;
end;
$$;

revoke all on function public.receive_ticket_part(uuid, integer) from public, anon;
grant execute on function public.receive_ticket_part(uuid, integer) to authenticated;

create or replace function public.sync_nexus_issue_to_received_quantity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source_system = 'NEXUS'
    and coalesce(new.source_issued_quantity, 0) > 0
    and coalesce(new.received_quantity, 0) < least(new.quantity, new.source_issued_quantity)
  then
    new.received_quantity := least(new.quantity, new.source_issued_quantity);
    new.received_at := coalesce(new.received_at, new.source_confirmed_at, now());
    new.received_by := coalesce(new.received_by, new.source_confirmed_by, new.updated_by, new.created_by);
  end if;

  return new;
end;
$$;

drop trigger if exists sync_nexus_issue_to_received_quantity on public.ticket_parts;
create trigger sync_nexus_issue_to_received_quantity
before insert or update of source_issued_quantity on public.ticket_parts
for each row
execute function public.sync_nexus_issue_to_received_quantity();

create or replace function public.sync_ticket_purchase_order_receipt_status(p_purchase_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  active_line_count integer;
  fully_received_line_count integer;
  received_unit_count integer;
begin
  if p_purchase_order_id is null then
    return;
  end if;

  select
    count(*) filter (where part_status <> 'CANCELLED'),
    count(*) filter (
      where part_status <> 'CANCELLED'
        and received_quantity >= quantity
    ),
    coalesce(sum(received_quantity) filter (where part_status <> 'CANCELLED'), 0)
  into active_line_count, fully_received_line_count, received_unit_count
  from public.ticket_parts
  where ticket_purchase_order_id = p_purchase_order_id;

  if active_line_count = 0 then
    return;
  end if;

  update public.ticket_purchase_orders
  set po_status = case
      when fully_received_line_count = active_line_count then 'RECEIVED'
      when received_unit_count > 0 then 'PART_RECEIVED'
      when po_status in ('PART_RECEIVED', 'RECEIVED') then 'SENT'
      else po_status
    end,
    updated_at = now()
  where id = p_purchase_order_id
    and po_status <> 'CANCELLED';
end;
$$;

create or replace function public.sync_ticket_part_purchase_order_receipt_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_ticket_purchase_order_receipt_status(old.ticket_purchase_order_id);
    return old;
  end if;

  perform public.sync_ticket_purchase_order_receipt_status(new.ticket_purchase_order_id);

  if tg_op = 'UPDATE'
    and old.ticket_purchase_order_id is distinct from new.ticket_purchase_order_id
  then
    perform public.sync_ticket_purchase_order_receipt_status(old.ticket_purchase_order_id);
  end if;

  return new;
end;
$$;

drop trigger if exists sync_ticket_part_purchase_order_receipt_status on public.ticket_parts;
create trigger sync_ticket_part_purchase_order_receipt_status
after insert or update of ticket_purchase_order_id, quantity, received_quantity, part_status or delete
on public.ticket_parts
for each row
execute function public.sync_ticket_part_purchase_order_receipt_status();

do $$
declare
  purchase_order record;
begin
  for purchase_order in
    select id from public.ticket_purchase_orders where po_status <> 'CANCELLED'
  loop
    perform public.sync_ticket_purchase_order_receipt_status(purchase_order.id);
  end loop;
end
$$;

create or replace function public.prevent_ready_with_outstanding_parts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  outstanding_summary text;
begin
  if new.status = 'READY' and old.status is distinct from 'READY' then
    select string_agg(
      greatest(quantity - received_quantity, 0)::text || ' x ' ||
        coalesce(nullif(btrim(part_number), ''), nullif(btrim(part_description), ''), 'unnamed part'),
      ', '
      order by created_at
    )
    into outstanding_summary
    from public.ticket_parts
    where ticket_id = new.id
      and part_status <> 'CANCELLED'
      and received_quantity < quantity;

    if outstanding_summary is not null then
      raise exception using
        errcode = '23514',
        message = 'Receive all linked parts before marking this ticket READY. Outstanding: ' || outstanding_summary;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_ready_with_outstanding_parts on public.tickets;
create trigger prevent_ready_with_outstanding_parts
before update of status on public.tickets
for each row
execute function public.prevent_ready_with_outstanding_parts();

comment on column public.ticket_parts.received_quantity is
  'Units physically received into Stores for this linked ticket part.';
comment on function public.receive_ticket_part(uuid, integer) is
  'Atomically receives units against one linked part using the caller and ticket_parts RLS.';
comment on function public.sync_nexus_issue_to_received_quantity() is
  'Treats stock physically issued by NEXUS as received into the RELAY ticket line.';
comment on function public.sync_ticket_purchase_order_receipt_status(uuid) is
  'Derives SENT, PART_RECEIVED, or RECEIVED from active linked part quantities.';
comment on function public.prevent_ready_with_outstanding_parts() is
  'Prevents READY while any non-cancelled linked part still has units outstanding.';
