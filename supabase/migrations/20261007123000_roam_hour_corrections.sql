create table public.roam_hour_corrections (
 machine_id uuid primary key references public.machines(id),
 roam_source_id text not null,
 roam_hours numeric not null check (roam_hours>=0),
 provider_hours numeric not null check (provider_hours>=0),
 reading_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.roam_hour_corrections enable row level security;
revoke all on public.roam_hour_corrections from public,anon,authenticated;
grant all on public.roam_hour_corrections to service_role;
