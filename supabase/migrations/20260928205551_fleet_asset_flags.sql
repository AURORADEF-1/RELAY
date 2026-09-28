-- Private admin annotations. Raw tracker credentials and telemetry are not stored here.
create table public.fleet_asset_flags (
 id uuid primary key,
 asset_key text not null check (length(asset_key) between 1 and 250),
 provider text not null check (provider in ('jcb','trackunit','takeuchi','assetcare')),
 pin text not null check (length(pin) between 1 and 200),
 machine_id uuid,
 label text not null,
 reason text not null check (length(trim(reason)) between 3 and 500),
 created_at timestamptz not null default now(),
 created_by uuid not null,
 resolved_at timestamptz,
 resolved_by uuid,
 resolution text,
 check ((resolved_at is null and resolved_by is null and resolution is null) or
        (resolved_at is not null and resolved_by is not null and resolution is not null and length(trim(resolution)) between 3 and 500))
);
create unique index fleet_asset_flags_one_active on public.fleet_asset_flags(asset_key) where resolved_at is null;
create unique index fleet_asset_flags_provider_active on public.fleet_asset_flags(provider,pin) where resolved_at is null;
create index fleet_asset_flags_active on public.fleet_asset_flags(created_at desc) where resolved_at is null;
alter table public.fleet_asset_flags enable row level security;
revoke all on public.fleet_asset_flags from public, anon, authenticated;
grant select, insert, update on public.fleet_asset_flags to service_role;
