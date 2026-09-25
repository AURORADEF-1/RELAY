-- Private imported classification keys; never embed staff/vehicle labels in source.
create table public.fleet_asset_groups (
 lookup_hash text primary key check(length(lookup_hash)=64),
 cost_centre text not null,
 category text not null check(category in ('Plant','HGV','Vehicles','People','Stock','Unclassified')),
 imported_at timestamptz not null default now()
);
alter table public.fleet_asset_groups enable row level security;
revoke all on public.fleet_asset_groups from public,anon,authenticated;
grant all on public.fleet_asset_groups to service_role;
