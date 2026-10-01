create table if not exists public.roam_asset_hour_readings (
 source_id text primary key,
 machine_id uuid not null references public.machines(id),
 payload jsonb not null,
 active boolean not null default true,
 synced_at timestamptz not null default now()
);
create index if not exists roam_asset_hour_readings_machine_idx on public.roam_asset_hour_readings(machine_id);
alter table public.roam_asset_hour_readings enable row level security;
revoke all on public.roam_asset_hour_readings from anon,authenticated;
grant all on public.roam_asset_hour_readings to service_role;
create table if not exists public.roam_hours_sync (id boolean primary key default true check(id),last_success timestamptz not null,readings integer not null);
alter table public.roam_hours_sync enable row level security;
revoke all on public.roam_hours_sync from anon,authenticated;
grant all on public.roam_hours_sync to service_role;
create or replace function public.sync_roam_asset_hours(p_rows jsonb,p_started_at timestamptz) returns integer language plpgsql security invoker set search_path=public as $$
declare n integer;
begin
 perform pg_advisory_xact_lock(hashtext('sync_roam_asset_hours'));
 if exists(select 1 from public.roam_hours_sync where last_success>p_started_at) then return 0; end if;
 if jsonb_typeof(p_rows)<>'array' then raise exception 'Expected reading array'; end if;
 insert into public.roam_asset_hour_readings(source_id,machine_id,payload,active,synced_at)
 select x->>'id',(x->>'relay_asset_id')::uuid,x,true,p_started_at from jsonb_array_elements(p_rows) x
 on conflict(source_id) do update set machine_id=excluded.machine_id,payload=excluded.payload,active=true,synced_at=excluded.synced_at;
 get diagnostics n=row_count;
 update public.roam_asset_hour_readings set active=false,synced_at=p_started_at where active and not exists(select 1 from jsonb_array_elements(p_rows) x where x->>'id'=source_id);
 insert into public.roam_hours_sync(id,last_success,readings) values(true,p_started_at,n) on conflict(id) do update set last_success=excluded.last_success,readings=excluded.readings;
 return n;
end $$;
revoke all on function public.sync_roam_asset_hours(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_roam_asset_hours(jsonb,timestamptz) to service_role;
