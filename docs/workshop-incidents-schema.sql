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
    check (status in ('REPORTED', 'ASSESSED', 'AWAITING_PARTS', 'IN_REPAIR', 'READY', 'CLOSED')),
  assigned_to text,
  notes text,
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
