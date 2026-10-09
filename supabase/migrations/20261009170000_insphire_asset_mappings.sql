create table if not exists public.insphire_asset_mappings (
  machine_id uuid primary key references public.machines(id) on delete cascade,
  source_reference text not null check (source_reference ~ '^[A-Za-z0-9 _./-]{1,32}$'),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.insphire_asset_mappings enable row level security;
revoke all on public.insphire_asset_mappings from anon, authenticated;
grant all on public.insphire_asset_mappings to service_role;

create unique index if not exists insphire_asset_mappings_reference_key
  on public.insphire_asset_mappings (lower(source_reference));
