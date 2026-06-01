create table if not exists public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  supplier_name_normalized text not null unique,
  contact_email text,
  contact_phone text,
  whatsapp_number text,
  preferred_contact_method text default 'manual' check (
    preferred_contact_method in ('email', 'phone', 'whatsapp', 'manual')
  ),
  workflow_stage text not null default 'draft' check (
    workflow_stage in ('draft', 'ready', 'emailed', 'whatsapp_sent', 'follow_up')
  ),
  notes text,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplier_contacts_supplier_name_normalized_idx
on public.supplier_contacts (supplier_name_normalized);

create index if not exists supplier_contacts_supplier_name_idx
on public.supplier_contacts (supplier_name);

alter table public.supplier_contacts enable row level security;

drop policy if exists "supplier contacts admin read" on public.supplier_contacts;
create policy "supplier contacts admin read"
on public.supplier_contacts
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

drop policy if exists "supplier contacts admin insert" on public.supplier_contacts;
create policy "supplier contacts admin insert"
on public.supplier_contacts
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

drop policy if exists "supplier contacts admin update" on public.supplier_contacts;
create policy "supplier contacts admin update"
on public.supplier_contacts
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

drop policy if exists "supplier contacts admin delete" on public.supplier_contacts;
create policy "supplier contacts admin delete"
on public.supplier_contacts
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

create table if not exists public.supplier_monthly_spend_snapshots (
  id uuid primary key default gen_random_uuid(),
  month_start date not null,
  supplier_name text not null,
  supplier_name_normalized text not null,
  order_count integer not null default 0,
  total_spend numeric(12,2) not null default 0,
  generated_at timestamptz not null default now()
);

create unique index if not exists supplier_monthly_spend_snapshots_month_supplier_idx
on public.supplier_monthly_spend_snapshots (month_start, supplier_name_normalized);

create index if not exists supplier_monthly_spend_snapshots_month_idx
on public.supplier_monthly_spend_snapshots (month_start desc);

alter table public.supplier_monthly_spend_snapshots enable row level security;

drop policy if exists "supplier snapshots admin read" on public.supplier_monthly_spend_snapshots;
create policy "supplier snapshots admin read"
on public.supplier_monthly_spend_snapshots
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

drop policy if exists "supplier snapshots admin insert" on public.supplier_monthly_spend_snapshots;
create policy "supplier snapshots admin insert"
on public.supplier_monthly_spend_snapshots
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

drop policy if exists "supplier snapshots admin update" on public.supplier_monthly_spend_snapshots;
create policy "supplier snapshots admin update"
on public.supplier_monthly_spend_snapshots
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

drop policy if exists "supplier snapshots admin delete" on public.supplier_monthly_spend_snapshots;
create policy "supplier snapshots admin delete"
on public.supplier_monthly_spend_snapshots
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

alter table public.tickets enable row level security;

drop policy if exists "tickets admin read" on public.tickets;
create policy "tickets admin read"
on public.tickets
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

drop policy if exists "tickets admin update" on public.tickets;
create policy "tickets admin update"
on public.tickets
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

drop policy if exists "tickets admin delete" on public.tickets;
create policy "tickets admin delete"
on public.tickets
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
