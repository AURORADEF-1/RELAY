-- Compact AssetCare+ journey retention. Completed journeys are stored as one row
-- with their route readings; only a short rolling point buffer is kept for trips
-- that have not closed yet. Browser roles cannot read any of these tables.
create table public.assetcare_trip_points_recent (
  owner_id text not null,
  asset_id text not null,
  asset_name text,
  observed_at timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  speed_kph double precision,
  ignition boolean,
  power_voltage double precision,
  tracker_battery_voltage double precision,
  primary key(owner_id,asset_id,observed_at)
);

create index assetcare_trip_points_recent_observed
  on public.assetcare_trip_points_recent(observed_at);

create table public.assetcare_trips (
  owner_id text not null,
  id text not null,
  asset_id text not null,
  asset_name text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  start_latitude double precision,
  start_longitude double precision,
  start_address text,
  end_latitude double precision,
  end_longitude double precision,
  end_address text,
  distance double precision,
  odometer double precision,
  speed_kph double precision,
  route_points jsonb not null default '[]'::jsonb check(jsonb_typeof(route_points)='array'),
  saved_at timestamptz not null default now(),
  primary key(owner_id,id)
);

create index assetcare_trips_owner_asset_ended
  on public.assetcare_trips(owner_id,asset_id,ended_at desc);
create index assetcare_trips_ended on public.assetcare_trips(ended_at);

create table public.assetcare_trip_events (
  owner_id text not null,
  event_id text not null,
  asset_id text not null,
  kind text not null check(kind in ('speeding','arrival','departure')),
  occurred_at timestamptz not null,
  speed_kph double precision,
  limit_kph double precision,
  primary key(owner_id,event_id)
);

create index assetcare_trip_events_owner_asset_at
  on public.assetcare_trip_events(owner_id,asset_id,occurred_at);
create index assetcare_trip_events_at on public.assetcare_trip_events(occurred_at);

alter table public.assetcare_trip_points_recent enable row level security;
alter table public.assetcare_trips enable row level security;
alter table public.assetcare_trip_events enable row level security;
revoke all on public.assetcare_trip_points_recent,public.assetcare_trips,public.assetcare_trip_events from public,anon,authenticated;
grant select,insert,update,delete on public.assetcare_trip_points_recent,public.assetcare_trips,public.assetcare_trip_events to service_role;

alter table public.assetcare_stream_state
  add column if not exists compact_cleanup_at timestamptz;

create or replace function public.assetcare_compact_capture(p_items jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare trip_json jsonb; trip_start timestamptz; trip_end timestamptz; trip_id text; trip_owner text; trip_asset text;
begin
  -- Points arrive before (or in the same batch as) the completed trip record.
  insert into assetcare_trip_points_recent(owner_id,asset_id,asset_name,observed_at,latitude,longitude,speed_kph,ignition,power_voltage,tracker_battery_voltage)
  select distinct on (item_json#>>'{owner,id}',item_json#>>'{asset,id}',item_json->>'date')
    item_json#>>'{owner,id}',item_json#>>'{asset,id}',nullif(item_json#>>'{asset,name}',''),(item_json->>'date')::timestamptz,
    (item_json#>>'{location,lat}')::double precision,(item_json#>>'{location,lon}')::double precision,
    case when coalesce(item_json#>>'{location,speed}',item_json#>>'{telemetry,speed}','') ~ '^-?\d+(\.\d+)?$' then coalesce(item_json#>>'{location,speed}',item_json#>>'{telemetry,speed}')::double precision end,
    case coalesce(item_json#>>'{telemetry,ignition}','') when '1' then true when 'true' then true when '0' then false when 'false' then false end,
    case when coalesce(item_json#>>'{telemetry,power_voltage}','') ~ '^-?\d+(\.\d+)?$' then (item_json#>>'{telemetry,power_voltage}')::double precision end,
    case when coalesce(item_json#>>'{telemetry,battery_voltage}',item_json#>>'{io,battery,value}','') ~ '^-?\d+(\.\d+)?$' then coalesce(item_json#>>'{telemetry,battery_voltage}',item_json#>>'{io,battery,value}')::double precision end
  from jsonb_array_elements(p_items) item_json
  where item_json->>'type'='telemetry' and nullif(item_json#>>'{owner,id}','') is not null and nullif(item_json#>>'{asset,id}','') is not null
    and coalesce(item_json->>'date','') ~ '^\d{4}-\d{2}-\d{2}T'
    and coalesce(item_json#>>'{location,lat}','') ~ '^-?\d+(\.\d+)?$' and coalesce(item_json#>>'{location,lon}','') ~ '^-?\d+(\.\d+)?$'
    and (item_json#>>'{location,lat}')::double precision between -90 and 90
    and (item_json#>>'{location,lon}')::double precision between -180 and 180
    and ((item_json#>>'{location,lat}')::double precision<>0 or (item_json#>>'{location,lon}')::double precision<>0)
  order by item_json#>>'{owner,id}',item_json#>>'{asset,id}',item_json->>'date'
  on conflict(owner_id,asset_id,observed_at) do update set
    asset_name=coalesce(excluded.asset_name,assetcare_trip_points_recent.asset_name),latitude=excluded.latitude,longitude=excluded.longitude,
    speed_kph=coalesce(excluded.speed_kph,assetcare_trip_points_recent.speed_kph),ignition=coalesce(excluded.ignition,assetcare_trip_points_recent.ignition),
    power_voltage=coalesce(excluded.power_voltage,assetcare_trip_points_recent.power_voltage),
    tracker_battery_voltage=coalesce(excluded.tracker_battery_voltage,assetcare_trip_points_recent.tracker_battery_voltage);

  insert into assetcare_trip_events(owner_id,event_id,asset_id,kind,occurred_at,speed_kph,limit_kph)
  select distinct on (item_json#>>'{owner,id}',coalesce(nullif(item_json->>'id',''),md5(item_json::text)))
    item_json#>>'{owner,id}',coalesce(nullif(item_json->>'id',''),md5(item_json::text)),item_json#>>'{details,asset,id}',
    case when item_json->>'eventClass'='overspeedevent' then 'speeding' when item_json->>'eventType'='enter' then 'arrival' else 'departure' end,
    (item_json->>'eventDate')::timestamptz,
    case when item_json->>'eventClass'='overspeedevent' and coalesce(item_json#>>'{details,telemetry,location,speed}','') ~ '^-?\d+(\.\d+)?$' then (item_json#>>'{details,telemetry,location,speed}')::double precision end,
    case when item_json->>'eventClass'='overspeedevent' and coalesce(item_json#>>'{details,limit,kph}','') ~ '^-?\d+(\.\d+)?$' then (item_json#>>'{details,limit,kph}')::double precision end
  from jsonb_array_elements(p_items) item_json
  where item_json->>'type'='event' and nullif(item_json#>>'{owner,id}','') is not null and nullif(item_json#>>'{details,asset,id}','') is not null
    and coalesce(item_json->>'eventDate','') ~ '^\d{4}-\d{2}-\d{2}T'
    and (item_json->>'eventClass'='overspeedevent' and item_json->>'eventType'='start'
      or item_json->>'eventClass'='zoneevent' and item_json->>'eventType' in ('enter','exit') and item_json#>>'{details,zone,id}'='412b4071-dc0e-4c45-aecb-49fb8542c19f')
  order by item_json#>>'{owner,id}',coalesce(nullif(item_json->>'id',''),md5(item_json::text))
  on conflict(owner_id,event_id) do update set speed_kph=excluded.speed_kph,limit_kph=excluded.limit_kph;

  for trip_json in select value from jsonb_array_elements(p_items) where value->>'type'='trip' loop
    trip_owner:=trip_json#>>'{owner,id}'; trip_asset:=trip_json#>>'{asset,id}';
    begin
      trip_start:=coalesce(trip_json->>'dateStart',trip_json->>'startDate')::timestamptz;
      trip_end:=coalesce(trip_json->>'dateEnd',trip_json->>'endDate')::timestamptz;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then continue;
    end;
    if nullif(trip_owner,'') is null or nullif(trip_asset,'') is null or trip_end<trip_start or trip_end>now()+interval '5 minutes' then continue; end if;
    trip_id:=coalesce(nullif(trip_json->>'id',''),md5(trip_json::text));
    insert into assetcare_trips(owner_id,id,asset_id,asset_name,started_at,ended_at,start_latitude,start_longitude,start_address,end_latitude,end_longitude,end_address,distance,odometer,speed_kph,route_points)
    values(trip_owner,trip_id,trip_asset,coalesce(nullif(trip_json#>>'{asset,name}',''),trip_asset),trip_start,trip_end,
      case when coalesce(trip_json#>>'{start,lat}','') ~ '^-?\d+(\.\d+)?$' then (trip_json#>>'{start,lat}')::double precision end,
      case when coalesce(trip_json#>>'{start,lon}','') ~ '^-?\d+(\.\d+)?$' then (trip_json#>>'{start,lon}')::double precision end,
      coalesce(nullif(trip_json#>>'{start,address}',''),nullif(trip_json#>>'{start,gc,rt}',''),nullif(trip_json#>>'{start,gc,rd}','')),
      case when coalesce(trip_json#>>'{end,lat}','') ~ '^-?\d+(\.\d+)?$' then (trip_json#>>'{end,lat}')::double precision end,
      case when coalesce(trip_json#>>'{end,lon}','') ~ '^-?\d+(\.\d+)?$' then (trip_json#>>'{end,lon}')::double precision end,
      coalesce(nullif(trip_json#>>'{end,address}',''),nullif(trip_json#>>'{end,gc,rt}',''),nullif(trip_json#>>'{end,gc,rd}','')),
      case when coalesce(trip_json#>>'{stats,distance}',trip_json#>>'{counters,distance}',trip_json->>'distance','') ~ '^-?\d+(\.\d+)?$' then coalesce(trip_json#>>'{stats,distance}',trip_json#>>'{counters,distance}',trip_json->>'distance')::double precision end,
      case when coalesce(trip_json#>>'{end,counters,odometer}',trip_json#>>'{counters,odometer}',trip_json#>>'{telemetry,odometer}','') ~ '^-?\d+(\.\d+)?$' then coalesce(trip_json#>>'{end,counters,odometer}',trip_json#>>'{counters,odometer}',trip_json#>>'{telemetry,odometer}')::double precision end,
      case when coalesce(trip_json#>>'{maxes,speed}',trip_json#>>'{end,speed}',trip_json#>>'{telemetry,speed}','') ~ '^-?\d+(\.\d+)?$' then coalesce(trip_json#>>'{maxes,speed}',trip_json#>>'{end,speed}',trip_json#>>'{telemetry,speed}')::double precision end,
      coalesce((select jsonb_agg(jsonb_build_object('at',p.observed_at,'latitude',p.latitude,'longitude',p.longitude,'speed_kph',p.speed_kph,'ignition',p.ignition,'power_voltage',p.power_voltage,'tracker_battery_voltage',p.tracker_battery_voltage) order by p.observed_at)
        from assetcare_trip_points_recent p where p.owner_id=trip_owner and p.asset_id=trip_asset and p.observed_at between trip_start and trip_end),'[]'::jsonb))
    on conflict(owner_id,id) do update set asset_name=excluded.asset_name,started_at=excluded.started_at,ended_at=excluded.ended_at,
      start_latitude=excluded.start_latitude,start_longitude=excluded.start_longitude,start_address=excluded.start_address,
      end_latitude=excluded.end_latitude,end_longitude=excluded.end_longitude,end_address=excluded.end_address,
      distance=excluded.distance,odometer=excluded.odometer,speed_kph=excluded.speed_kph,
      route_points=case when jsonb_array_length(excluded.route_points)>0 then excluded.route_points else assetcare_trips.route_points end,saved_at=now();
  end loop;
end;$$;

revoke all on function public.assetcare_compact_capture(jsonb) from public,anon,authenticated;
grant execute on function public.assetcare_compact_capture(jsonb) to service_role;

-- Install compact capture but deliberately leave old raw rows in place until the
-- separate backfill has been verified.
create or replace function public.save_assetcare_batch(p_owner uuid,p_hash text,p_items jsonb,p_assets jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
declare a jsonb; e jsonb;
begin
  perform 1 from assetcare_stream_state where id=true and owner=p_owner and lease_until>now() for update;
  if not found then return false; end if;
  insert into assetcare_batches(content_hash,items) values(p_hash,p_items) on conflict(content_hash) do nothing;
  perform assetcare_compact_capture(p_items);
  for a in select value from jsonb_array_elements(p_assets) loop
    insert into assetcare_assets(asset_id,observed_at,name,machine,position_history)
    values(a->>'asset_id',(a->>'observed_at')::timestamptz,a->>'name',a->'machine',coalesce(a->'position_history','[]'::jsonb))
    on conflict(asset_id) do update set observed_at=excluded.observed_at,name=excluded.name,machine=excluded.machine,
      position_history=case when a ? 'position_history' then excluded.position_history else assetcare_assets.position_history end,received_at=now()
    where assetcare_assets.observed_at<=excluded.observed_at;
    for e in select value from jsonb_array_elements(coalesce(a->'events','[]'::jsonb)) loop
      insert into asset_events(event_key,machine_id,provider,kind,title,detail,occurred_at,payload)
      values(e->>'event_key',(e->>'machine_id')::uuid,'assetcare',e->>'kind',e->>'title',e->>'detail',(e->>'occurred_at')::timestamptz,e->'payload')
      on conflict(event_key) do nothing;
    end loop;
  end loop;
  update assetcare_stream_state set last_saved_at=now(),history_paused=false where id=true;
  return true;
end;$$;

revoke all on function public.save_assetcare_batch(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_assetcare_batch(uuid,text,jsonb,jsonb) to service_role;

-- Replay at most one day at a time. Calling this repeatedly is safe.
create or replace function public.assetcare_compact_backfill(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare row_data record; processed integer:=0;
begin
  if p_to<=p_from or p_to-p_from>interval '1 day' or p_to>now()+interval '1 minute' then raise exception 'Invalid replay window'; end if;
  -- Replay chronologically from the archive's oldest day. The rolling point
  -- table carries route readings forward until each trip record closes.
  for row_data in select items from assetcare_batches where received_at>=p_from and received_at<p_to order by received_at loop
    perform assetcare_compact_capture(row_data.items); processed:=processed+1;
  end loop;
  return jsonb_build_object('batches',processed,'trips',(select count(*) from assetcare_trips where ended_at>=p_from and ended_at<p_to));
end;$$;

revoke all on function public.assetcare_compact_backfill(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.assetcare_compact_backfill(timestamptz,timestamptz) to service_role;
