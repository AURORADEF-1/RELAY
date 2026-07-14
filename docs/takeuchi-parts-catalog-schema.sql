create table if not exists public.takeuchi_parts_catalog (
  id uuid primary key default gen_random_uuid(),
  catalog_key text not null unique,
  machine_make text not null default 'Takeuchi',
  machine_model text not null,
  machine_model_normalized text not null,
  serial_start bigint not null,
  serial_end bigint not null,
  bom_main_group text not null,
  bom_sub_group text not null,
  bom_item text,
  part_number text not null,
  part_description text not null,
  suggested_part_number text,
  notes text,
  source_file_name text,
  source_sheet text,
  source_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint takeuchi_parts_catalog_serial_range_check check (serial_start <= serial_end)
);

create index if not exists takeuchi_parts_catalog_model_idx
on public.takeuchi_parts_catalog (machine_model_normalized);

create index if not exists takeuchi_parts_catalog_serial_start_idx
on public.takeuchi_parts_catalog (serial_start);

create index if not exists takeuchi_parts_catalog_serial_end_idx
on public.takeuchi_parts_catalog (serial_end);

create index if not exists takeuchi_parts_catalog_main_group_idx
on public.takeuchi_parts_catalog (bom_main_group);

create index if not exists takeuchi_parts_catalog_sub_group_idx
on public.takeuchi_parts_catalog (bom_sub_group);

create index if not exists takeuchi_parts_catalog_part_number_idx
on public.takeuchi_parts_catalog (part_number);

create index if not exists takeuchi_parts_catalog_updated_at_idx
on public.takeuchi_parts_catalog (updated_at desc);

alter table public.takeuchi_parts_catalog enable row level security;

drop policy if exists "takeuchi parts catalog admin read" on public.takeuchi_parts_catalog;
create policy "takeuchi parts catalog admin read"
on public.takeuchi_parts_catalog
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

drop policy if exists "takeuchi parts catalog admin insert" on public.takeuchi_parts_catalog;
create policy "takeuchi parts catalog admin insert"
on public.takeuchi_parts_catalog
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

drop policy if exists "takeuchi parts catalog admin update" on public.takeuchi_parts_catalog;
create policy "takeuchi parts catalog admin update"
on public.takeuchi_parts_catalog
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

drop policy if exists "takeuchi parts catalog admin delete" on public.takeuchi_parts_catalog;
create policy "takeuchi parts catalog admin delete"
on public.takeuchi_parts_catalog
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
