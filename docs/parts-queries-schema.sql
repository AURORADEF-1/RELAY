create table if not exists public.parts_queries (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  part_description text not null,
  job_number text,
  part_price numeric(12,2),
  ordered_for_job boolean not null default false,
  fitter text,
  workshop_response text,
  job_status text not null default 'OPEN'
    check (job_status in ('OPEN', 'CLOSED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parts_queries_job_status_idx
on public.parts_queries (job_status);

create index if not exists parts_queries_job_number_idx
on public.parts_queries (job_number);

create index if not exists parts_queries_updated_at_idx
on public.parts_queries (updated_at desc);

alter table public.parts_queries enable row level security;

drop policy if exists "parts queries admin read" on public.parts_queries;
create policy "parts queries admin read"
on public.parts_queries
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

drop policy if exists "parts queries admin insert" on public.parts_queries;
create policy "parts queries admin insert"
on public.parts_queries
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

drop policy if exists "parts queries admin update" on public.parts_queries;
create policy "parts queries admin update"
on public.parts_queries
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
