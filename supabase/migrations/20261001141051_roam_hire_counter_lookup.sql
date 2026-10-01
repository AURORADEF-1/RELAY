create or replace function public.roam_hire_counter_readings(p_asset_id text,p_delivery timestamptz)
returns table(at text,value double precision)
language sql stable security invoker set search_path='' set statement_timeout='8s'
as $$
 with baseline as materialized (
  select items from public.assetcare_batches
  where received_at between p_delivery-interval '15 minutes' and p_delivery+interval '45 minutes'
  and items @> jsonb_build_array(jsonb_build_object('asset',jsonb_build_object('id',p_asset_id)))
  order by received_at limit 500
 ), recent as materialized (
  select items from public.assetcare_batches
  where received_at>=now()-interval '24 hours'
  and items @> jsonb_build_array(jsonb_build_object('asset',jsonb_build_object('id',p_asset_id)))
  order by received_at desc limit 200
 ), records as (
  select r from (select items from baseline union all select items from recent) b
  cross join lateral jsonb_array_elements(b.items) r
 )
 select distinct r->>'date',(r->'counters'->>'hours')::double precision from records
 where r->>'type'='telemetry' and r->'asset'->>'id'=p_asset_id
 and jsonb_typeof(r->'counters'->'hours')='number' and r->>'date' is not null
$$;
revoke all on function public.roam_hire_counter_readings(text,timestamptz) from public,anon,authenticated;
grant execute on function public.roam_hire_counter_readings(text,timestamptz) to service_role;
