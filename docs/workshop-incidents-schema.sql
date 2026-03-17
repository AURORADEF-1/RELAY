create table if not exists public.workshop_incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reported_by text,
  incident_type text not null check (incident_type in ('DAMAGE', 'TYRE_BREAKDOWN')),
  machine_reference text not null,
  job_number text,
  location_type text not null check (location_type in ('Onsite', 'Yard')),
  location_summary text,
  description text not null,
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status text not null default 'REPORTED'
    check (status in ('REPORTED', 'ASSESSED', 'AWAITING_PARTS', 'PARTS_ASSIGNED', 'IN_REPAIR', 'READY', 'CLOSED')),
  assigned_to text,
  notes text,
  linked_parts_ticket_id uuid references public.tickets (id) on delete set null,
  po_number text,
  damage_area text,
  tyre_position text,
  vehicle_immobilised boolean default false,
  replacement_required boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workshop_incidents_status_idx
on public.workshop_incidents (status);

create index if not exists workshop_incidents_type_idx
on public.workshop_incidents (incident_type);

create index if not exists workshop_incidents_user_id_idx
on public.workshop_incidents (user_id);

create index if not exists workshop_incidents_updated_at_idx
on public.workshop_incidents (updated_at desc);

create table if not exists public.workshop_incident_attachments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.workshop_incidents (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  file_name text,
  file_path text not null,
  file_url text,
  mime_type text,
  created_at timestamptz not null default now()
);

create index if not exists workshop_incident_attachments_incident_id_idx
on public.workshop_incident_attachments (incident_id, created_at asc);

alter table public.workshop_incidents enable row level security;

drop policy if exists "workshop incidents admin read" on public.workshop_incidents;
create policy "workshop incidents admin read"
on public.workshop_incidents
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

drop policy if exists "workshop incidents admin insert" on public.workshop_incidents;
create policy "workshop incidents admin insert"
on public.workshop_incidents
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

drop policy if exists "workshop incidents admin update" on public.workshop_incidents;
create policy "workshop incidents admin update"
on public.workshop_incidents
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

alter table public.workshop_incident_attachments enable row level security;

drop policy if exists "workshop incident attachments admin read" on public.workshop_incident_attachments;
create policy "workshop incident attachments admin read"
on public.workshop_incident_attachments
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

drop policy if exists "workshop incident attachments admin insert" on public.workshop_incident_attachments;
create policy "workshop incident attachments admin insert"
on public.workshop_incident_attachments
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
