create extension if not exists btree_gist with schema extensions;
create table public.fleet_reservations (
 id uuid primary key,
 machine_id uuid not null references public.machines(id),
 starts_on date not null,
 ends_on date not null,
 job_reference text not null check(length(trim(job_reference)) between 1 and 100),
 site text not null check(length(trim(site)) between 1 and 200),
 notes text check(length(notes)<=1000),
 status text not null default 'reserved' check(status in ('reserved','cancelled')),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 cancelled_by uuid references public.profiles(id),
 cancelled_at timestamptz,
 check(ends_on>=starts_on and ends_on-starts_on<=366),
 exclude using gist (machine_id extensions.gist_uuid_ops with =,daterange(starts_on,ends_on,'[]') with &&) where(status='reserved')
);
alter table public.fleet_reservations enable row level security;
revoke all on public.fleet_reservations from public,anon,authenticated;
grant select,insert,update on public.fleet_reservations to service_role;
