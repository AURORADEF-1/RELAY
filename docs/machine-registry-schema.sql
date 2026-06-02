create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  machine_number text not null,
  machine_number_normalized text not null unique,
  fleet_type text not null check (fleet_type in ('telehandler', 'excavator')),
  item_description text not null,
  make text,
  model text,
  serial_number text,
  status text,
  quantity integer,
  buying_price numeric,
  selling_price numeric,
  source_sheet text,
  source_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists machines_machine_number_idx
on public.machines (machine_number);

create index if not exists machines_fleet_type_idx
on public.machines (fleet_type);

alter table public.machines enable row level security;

drop policy if exists "machines authenticated read" on public.machines;
create policy "machines authenticated read"
on public.machines
for select
to authenticated
using (true);

drop policy if exists "machines admin insert" on public.machines;
create policy "machines admin insert"
on public.machines
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

drop policy if exists "machines admin update" on public.machines;
create policy "machines admin update"
on public.machines
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

drop policy if exists "machines admin delete" on public.machines;
create policy "machines admin delete"
on public.machines
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

alter table public.tickets
  add column if not exists machine_number text,
  add column if not exists machine_number_normalized text,
  add column if not exists machine_fleet_type text,
  add column if not exists machine_item_description text,
  add column if not exists machine_make text,
  add column if not exists machine_model text,
  add column if not exists machine_serial_number text,
  add column if not exists machine_status text,
  add column if not exists machine_quantity integer,
  add column if not exists machine_buying_price numeric,
  add column if not exists machine_selling_price numeric,
  add column if not exists machine_source_sheet text,
  add column if not exists machine_source_row integer,
  add column if not exists machine_verified boolean not null default false,
  add column if not exists machine_verified_at timestamptz,
  add column if not exists machine_verified_by text;

create index if not exists tickets_machine_number_normalized_idx
on public.tickets (machine_number_normalized);

create index if not exists tickets_machine_verified_idx
on public.tickets (machine_verified);
