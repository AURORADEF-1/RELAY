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
    ticket.supplier_name,
    ticket.order_amount,
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

create or replace function public.list_front_counter_wallboard_supplier_spend()
returns table (
  id uuid,
  supplier_name text,
  order_amount numeric,
  ordered_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz,
  status text
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
    ticket.supplier_name,
    ticket.order_amount,
    ticket.ordered_at,
    ticket.updated_at,
    ticket.created_at,
    ticket.status
  from public.tickets ticket
  where nullif(btrim(ticket.supplier_name), '') is not null
  order by ticket.ordered_at desc nulls last
  limit 500;
end;
$$;

revoke all on function public.list_front_counter_wallboard_supplier_spend() from public, anon;
grant execute on function public.list_front_counter_wallboard_supplier_spend() to authenticated;

comment on function public.list_front_counter_wallboard_supplier_spend() is
  'Returns the same bounded supplier-spend dataset used by the admin wallboard, restricted to Front Counter identities.';
