create table if not exists public.ticket_parts (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  ticket_purchase_order_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  job_number text,
  machine_reference text,
  machine_number_normalized text,
  machine_make text,
  machine_model text,
  part_description text not null,
  part_number text not null,
  quantity integer not null default 1 check (quantity > 0),
  part_status text not null default 'REQUESTED'
    check (part_status in ('REQUESTED', 'SOURCED', 'FITTED', 'CANCELLED')),
  supplier_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ticket_parts
  add column if not exists ticket_purchase_order_id uuid;

create index if not exists ticket_parts_ticket_id_idx
on public.ticket_parts (ticket_id);

create index if not exists ticket_parts_purchase_order_id_idx
on public.ticket_parts (ticket_purchase_order_id);

create index if not exists ticket_parts_job_number_idx
on public.ticket_parts (job_number);

create index if not exists ticket_parts_machine_reference_idx
on public.ticket_parts (machine_reference);

create index if not exists ticket_parts_part_number_idx
on public.ticket_parts (part_number);

create index if not exists ticket_parts_created_at_idx
on public.ticket_parts (created_at desc);

alter table public.ticket_parts enable row level security;

drop policy if exists "ticket parts admin read" on public.ticket_parts;
create policy "ticket parts admin read"
on public.ticket_parts
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

drop policy if exists "ticket parts admin insert" on public.ticket_parts;
create policy "ticket parts admin insert"
on public.ticket_parts
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

drop policy if exists "ticket parts admin update" on public.ticket_parts;
create policy "ticket parts admin update"
on public.ticket_parts
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

drop policy if exists "ticket parts admin delete" on public.ticket_parts;
create policy "ticket parts admin delete"
on public.ticket_parts
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

create table if not exists public.ticket_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  supplier_name text not null,
  supplier_name_normalized text not null,
  purchase_order_number text not null,
  supplier_email text,
  order_amount numeric(12,2),
  po_status text not null default 'DRAFT'
    check (po_status in ('DRAFT', 'SENT', 'RECEIVED', 'CANCELLED')),
  notes text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ticket_id, purchase_order_number)
);

create index if not exists ticket_purchase_orders_ticket_id_idx
on public.ticket_purchase_orders (ticket_id);

create index if not exists ticket_purchase_orders_supplier_name_idx
on public.ticket_purchase_orders (supplier_name_normalized);

create index if not exists ticket_purchase_orders_status_idx
on public.ticket_purchase_orders (po_status);

create index if not exists ticket_purchase_orders_created_at_idx
on public.ticket_purchase_orders (created_at desc);

alter table public.ticket_purchase_orders enable row level security;

drop policy if exists "ticket purchase orders admin read" on public.ticket_purchase_orders;
create policy "ticket purchase orders admin read"
on public.ticket_purchase_orders
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

drop policy if exists "ticket purchase orders admin insert" on public.ticket_purchase_orders;
create policy "ticket purchase orders admin insert"
on public.ticket_purchase_orders
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

drop policy if exists "ticket purchase orders admin update" on public.ticket_purchase_orders;
create policy "ticket purchase orders admin update"
on public.ticket_purchase_orders
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

drop policy if exists "ticket purchase orders admin delete" on public.ticket_purchase_orders;
create policy "ticket purchase orders admin delete"
on public.ticket_purchase_orders
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

alter table public.ticket_parts
  drop constraint if exists ticket_parts_purchase_order_fk;

alter table public.ticket_parts
  add constraint ticket_parts_purchase_order_fk
  foreign key (ticket_purchase_order_id)
  references public.ticket_purchase_orders (id)
  on delete set null;
