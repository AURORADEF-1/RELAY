-- Match AssetCare's visible journey list: ignore movements shorter than 0.03 miles
-- and project the provider's current stats/address fields.
create or replace function public.assetcare_trip_history(
  p_owner text,
  p_start timestamptz,
  p_end timestamptz,
  p_asset text default null
) returns jsonb language sql stable security invoker set search_path=public as $$
 with records as (
  select v
  from assetcare_batches b cross join lateral jsonb_array_elements(b.items) v
  where b.received_at >= p_start - interval '2 days'
    and b.received_at < p_end + interval '2 days'
    and p_start <= now() and p_end > p_start and p_end-p_start <= interval '32 days'
    and length(p_owner) between 1 and 200
    and (p_asset is null or b.items @> jsonb_build_array(jsonb_build_object('asset',jsonb_build_object('id',p_asset))))
    and v->>'type'='trip' and v#>>'{owner,id}'=p_owner
    and (p_asset is null or v#>>'{asset,id}'=p_asset)
 ), trips as (
  select distinct on (coalesce(nullif(v->>'id',''),md5(v::text)))
    coalesce(nullif(v->>'id',''),md5(v::text)) id,
    v#>>'{asset,id}' asset_id,
    coalesce(nullif(v#>>'{asset,name}',''),v#>>'{asset,id}') asset_name,
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
  from records
 ), bounded as (
  select * from trips
  where ended_at >= p_start and ended_at < p_end and ended_at <= now()
    and asset_id is not null and distance >= 0.04828032
  order by ended_at desc limit 2001
 )
 select jsonb_build_object(
  'trips',coalesce((select jsonb_agg(to_jsonb(bounded) order by ended_at desc) from bounded),'[]'::jsonb),
  'archive_start',(select min(received_at) from assetcare_batches),
  'latest_saved',(select max(received_at) from assetcare_batches)
 );
$$;

revoke all on function public.assetcare_trip_history(text,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.assetcare_trip_history(text,timestamptz,timestamptz,text) to service_role;
