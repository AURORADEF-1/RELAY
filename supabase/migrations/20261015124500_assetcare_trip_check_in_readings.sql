-- Enrich recorded trip breadcrumbs with the telemetry shown by AssetCare+.
create or replace function public.assetcare_trip_history(
  p_owner text,
  p_start timestamptz,
  p_end timestamptz,
  p_asset text default null
) returns jsonb language sql stable security invoker set search_path=public as $$
 with records as materialized (
  select v
  from assetcare_batches b cross join lateral jsonb_array_elements(b.items) v
  where b.received_at >= p_start - interval '2 days' and b.received_at < p_end + interval '2 days'
    and p_start <= now() and p_end > p_start and p_end-p_start <= interval '32 days'
    and length(p_owner) between 1 and 200 and v#>>'{owner,id}'=p_owner
    and (p_asset is null or v#>>'{asset,id}'=p_asset)
 ), telemetry as (
  select distinct on (v#>>'{asset,id}',v->>'date')
    v#>>'{asset,id}' asset_id,(v->>'date')::timestamptz at,
    (v#>>'{location,lat}')::double precision latitude,(v#>>'{location,lon}')::double precision longitude,
    case when coalesce(v#>>'{location,speed}',v#>>'{telemetry,speed}','') ~ '^-?\d+(\.\d+)?$' then coalesce(v#>>'{location,speed}',v#>>'{telemetry,speed}')::double precision end speed_kph,
    case coalesce(v#>>'{telemetry,ignition}','') when '1' then true when 'true' then true when '0' then false when 'false' then false end ignition,
    case when coalesce(v#>>'{telemetry,power_voltage}','') ~ '^-?\d+(\.\d+)?$' then (v#>>'{telemetry,power_voltage}')::double precision end power_voltage,
    case when coalesce(v#>>'{telemetry,battery_voltage}',v#>>'{io,battery,value}','') ~ '^-?\d+(\.\d+)?$' then coalesce(v#>>'{telemetry,battery_voltage}',v#>>'{io,battery,value}')::double precision end tracker_battery_voltage
  from records where v->>'type'='telemetry' and coalesce(v->>'date','') ~ '^\d{4}-\d{2}-\d{2}T'
    and coalesce(v#>>'{location,lat}','') ~ '^-?\d+(\.\d+)?$' and coalesce(v#>>'{location,lon}','') ~ '^-?\d+(\.\d+)?$'
    and (v#>>'{location,lat}')::double precision between -90 and 90 and (v#>>'{location,lon}')::double precision between -180 and 180
    and ((v#>>'{location,lat}')::double precision<>0 or (v#>>'{location,lon}')::double precision<>0)
  order by v#>>'{asset,id}',v->>'date'
 ), trips as (
  select distinct on (coalesce(nullif(v->>'id',''),md5(v::text)))
    coalesce(nullif(v->>'id',''),md5(v::text)) id,v#>>'{asset,id}' asset_id,coalesce(nullif(v#>>'{asset,name}',''),v#>>'{asset,id}') asset_name,
    case when coalesce(v->>'dateStart',v->>'startDate','') ~ '^\d{4}-\d{2}-\d{2}T' then coalesce(v->>'dateStart',v->>'startDate')::timestamptz end started_at,
    case when coalesce(v->>'dateEnd',v->>'endDate','') ~ '^\d{4}-\d{2}-\d{2}T' then coalesce(v->>'dateEnd',v->>'endDate')::timestamptz end ended_at,
    case when coalesce(v#>>'{start,lat}','') ~ '^-?\d+(\.\d+)?$' then (v#>>'{start,lat}')::double precision end start_latitude,
    case when coalesce(v#>>'{start,lon}','') ~ '^-?\d+(\.\d+)?$' then (v#>>'{start,lon}')::double precision end start_longitude,
    coalesce(nullif(v#>>'{start,address}',''),nullif(v#>>'{start,gc,rt}',''),nullif(v#>>'{start,gc,rd}','')) start_address,
    case when coalesce(v#>>'{end,lat}','') ~ '^-?\d+(\.\d+)?$' then (v#>>'{end,lat}')::double precision end end_latitude,
    case when coalesce(v#>>'{end,lon}','') ~ '^-?\d+(\.\d+)?$' then (v#>>'{end,lon}')::double precision end end_longitude,
    coalesce(nullif(v#>>'{end,address}',''),nullif(v#>>'{end,gc,rt}',''),nullif(v#>>'{end,gc,rd}','')) end_address,
    case when coalesce(v#>>'{stats,distance}',v#>>'{counters,distance}',v->>'distance','') ~ '^-?\d+(\.\d+)?$' then coalesce(v#>>'{stats,distance}',v#>>'{counters,distance}',v->>'distance')::double precision end distance,
    case when coalesce(v#>>'{end,counters,odometer}',v#>>'{counters,odometer}',v#>>'{telemetry,odometer}','') ~ '^-?\d+(\.\d+)?$' then coalesce(v#>>'{end,counters,odometer}',v#>>'{counters,odometer}',v#>>'{telemetry,odometer}')::double precision end odometer,
    case when coalesce(v#>>'{maxes,speed}',v#>>'{end,speed}',v#>>'{telemetry,speed}','') ~ '^-?\d+(\.\d+)?$' then coalesce(v#>>'{maxes,speed}',v#>>'{end,speed}',v#>>'{telemetry,speed}')::double precision end speed_kph
  from records where v->>'type'='trip'
 ), bounded as (
  select * from trips where ended_at>=p_start and ended_at<p_end and ended_at<=now() and asset_id is not null and distance>=0.04828032 order by ended_at desc limit 2001
 ), routed as (
  select b.*,coalesce((select jsonb_agg(jsonb_build_object('at',t.at,'latitude',t.latitude,'longitude',t.longitude,'speed_kph',t.speed_kph,'ignition',t.ignition,'power_voltage',t.power_voltage,'tracker_battery_voltage',t.tracker_battery_voltage) order by t.at)
    from telemetry t where t.asset_id=b.asset_id and t.at between b.started_at and b.ended_at),'[]'::jsonb) route_points from bounded b
 )
 select jsonb_build_object('trips',coalesce((select jsonb_agg(to_jsonb(routed) order by started_at) from routed),'[]'::jsonb),'archive_start',(select min(received_at) from assetcare_batches),'latest_saved',(select max(received_at) from assetcare_batches));
$$;

revoke all on function public.assetcare_trip_history(text,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.assetcare_trip_history(text,timestamptz,timestamptz,text) to service_role;
