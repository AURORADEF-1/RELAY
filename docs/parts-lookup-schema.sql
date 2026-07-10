create table if not exists public.parts_lookup (
  id uuid primary key default gen_random_uuid(),
  source_ticket_part_id uuid not null unique references public.ticket_parts (id) on delete cascade,
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  ticket_purchase_order_id uuid references public.ticket_purchase_orders (id) on delete set null,
  job_number text,
  machine_number text,
  machine_number_normalized text,
  machine_reference text,
  machine_fleet_type text,
  machine_make text,
  machine_model text,
  machine_serial_number text,
  part_description text not null,
  part_number text not null,
  quantity integer not null default 1 check (quantity > 0),
  supplier_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parts_lookup_ticket_id_idx
on public.parts_lookup (ticket_id);

create index if not exists parts_lookup_machine_number_normalized_idx
on public.parts_lookup (machine_number_normalized);

create index if not exists parts_lookup_machine_reference_idx
on public.parts_lookup (machine_reference);

create index if not exists parts_lookup_part_number_idx
on public.parts_lookup (part_number);

create index if not exists parts_lookup_job_number_idx
on public.parts_lookup (job_number);

create index if not exists parts_lookup_updated_at_idx
on public.parts_lookup (updated_at desc);

alter table public.parts_lookup enable row level security;

drop policy if exists "parts lookup admin read" on public.parts_lookup;
create policy "parts lookup admin read"
on public.parts_lookup
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists "parts lookup admin insert" on public.parts_lookup;
create policy "parts lookup admin insert"
on public.parts_lookup
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists "parts lookup admin update" on public.parts_lookup;
create policy "parts lookup admin update"
on public.parts_lookup
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists "parts lookup admin delete" on public.parts_lookup;
create policy "parts lookup admin delete"
on public.parts_lookup
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create or replace function public.refresh_parts_lookup_for_ticket(p_ticket_id uuid)
returns void
language plpgsql
as $$
begin
  insert into public.parts_lookup (
    source_ticket_part_id,
    ticket_id,
    ticket_purchase_order_id,
    job_number,
    machine_number,
    machine_number_normalized,
    machine_reference,
    machine_fleet_type,
    machine_make,
    machine_model,
    machine_serial_number,
    part_description,
    part_number,
    quantity,
    supplier_name,
    notes,
    created_at,
    updated_at
  )
  select
    tp.id,
    tp.ticket_id,
    tp.ticket_purchase_order_id,
    nullif(t.job_number, ''),
    nullif(t.machine_number, ''),
    nullif(t.machine_number_normalized, ''),
    nullif(coalesce(t.machine_reference, tp.machine_reference), ''),
    nullif(t.machine_fleet_type, ''),
    nullif(t.machine_make, ''),
    nullif(t.machine_model, ''),
    nullif(t.machine_serial_number, ''),
    tp.part_description,
    tp.part_number,
    tp.quantity,
    nullif(tp.supplier_name, ''),
    nullif(tp.notes, ''),
    tp.created_at,
    now()
  from public.ticket_parts tp
  join public.tickets t
    on t.id = tp.ticket_id
  where tp.ticket_id = p_ticket_id
  on conflict (source_ticket_part_id) do update
  set
    ticket_id = excluded.ticket_id,
    ticket_purchase_order_id = excluded.ticket_purchase_order_id,
    job_number = excluded.job_number,
    machine_number = excluded.machine_number,
    machine_number_normalized = excluded.machine_number_normalized,
    machine_reference = excluded.machine_reference,
    machine_fleet_type = excluded.machine_fleet_type,
    machine_make = excluded.machine_make,
    machine_model = excluded.machine_model,
    machine_serial_number = excluded.machine_serial_number,
    part_description = excluded.part_description,
    part_number = excluded.part_number,
    quantity = excluded.quantity,
    supplier_name = excluded.supplier_name,
    notes = excluded.notes,
    updated_at = excluded.updated_at;

  delete from public.parts_lookup pl
  where pl.ticket_id = p_ticket_id
    and not exists (
      select 1
      from public.ticket_parts tp
      where tp.id = pl.source_ticket_part_id
        and tp.ticket_id = p_ticket_id
    );
end;
$$;

create or replace function public.sync_parts_lookup_after_ticket_parts_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1
      from public.tickets t
      where t.id = old.ticket_id
    ) then
      perform public.refresh_parts_lookup_for_ticket(old.ticket_id);
    end if;
    return null;
  end if;

  perform public.refresh_parts_lookup_for_ticket(new.ticket_id);

  if tg_op = 'UPDATE' and old.ticket_id is distinct from new.ticket_id then
    perform public.refresh_parts_lookup_for_ticket(old.ticket_id);
  end if;

  return null;
end;
$$;

drop trigger if exists refresh_parts_lookup_after_ticket_parts_change on public.ticket_parts;
create trigger refresh_parts_lookup_after_ticket_parts_change
after insert or update or delete on public.ticket_parts
for each row
execute function public.sync_parts_lookup_after_ticket_parts_change();

create or replace function public.sync_parts_lookup_after_ticket_change()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_parts_lookup_for_ticket(new.id);
  return null;
end;
$$;

drop trigger if exists refresh_parts_lookup_after_ticket_change on public.tickets;
create trigger refresh_parts_lookup_after_ticket_change
after update of job_number, machine_number, machine_number_normalized, machine_reference, machine_fleet_type, machine_make, machine_model, machine_serial_number on public.tickets
for each row
execute function public.sync_parts_lookup_after_ticket_change();

do $$
declare
  ticket_row record;
begin
  for ticket_row in
    select distinct ticket_id
    from public.ticket_parts
  loop
    perform public.refresh_parts_lookup_for_ticket(ticket_row.ticket_id);
  end loop;
end;
$$;
