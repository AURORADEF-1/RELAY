-- Serve journey history from the indexed compact archive. Retention cleanup is
-- intentionally not enabled by this migration.
create or replace function public.assetcare_trip_history(
  p_owner text,p_start timestamptz,p_end timestamptz,p_asset text default null
) returns jsonb language sql stable security invoker set search_path=public as $$
  with bounded as (
    select id,asset_id,asset_name,started_at,ended_at,start_latitude,start_longitude,start_address,
      end_latitude,end_longitude,end_address,distance,odometer,speed_kph,route_points
    from assetcare_trips
    where owner_id=p_owner and ended_at>=p_start and ended_at<p_end and ended_at<=now()
      and (p_asset is null or asset_id=p_asset) and distance>=0.04828032
      and p_start<=now() and p_end>p_start and p_end-p_start<=interval '32 days'
      and length(p_owner) between 1 and 200
    order by ended_at desc limit 2001
  )
  select jsonb_build_object(
    'trips',coalesce((select jsonb_agg(to_jsonb(bounded) order by started_at) from bounded),'[]'::jsonb),
    'archive_start',(select min(ended_at) from assetcare_trips where owner_id=p_owner),
    'latest_saved',(select max(saved_at) from assetcare_trips where owner_id=p_owner));
$$;

revoke all on function public.assetcare_trip_history(text,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.assetcare_trip_history(text,timestamptz,timestamptz,text) to service_role;
