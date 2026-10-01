create or replace function public.roam_hire_usage_readings(p_asset_id text,p_delivery timestamptz,p_collection timestamptz default null)
returns table(at text,value double precision,ignition boolean)
language sql stable security invoker set search_path='' set statement_timeout='8s'
as $$
 with start_batches as materialized (
  select items from public.assetcare_batches where received_at between p_delivery-interval '15 minutes' and p_delivery+interval '45 minutes'
  and items @> jsonb_build_array(jsonb_build_object('asset',jsonb_build_object('id',p_asset_id))) order by received_at limit 500
 ), end_batches as materialized (
  select items from public.assetcare_batches where
  received_at >= coalesce(p_collection-interval '15 minutes',now()-interval '24 hours')
  and received_at <= coalesce(p_collection+interval '60 minutes',now())
  and items @> jsonb_build_array(jsonb_build_object('asset',jsonb_build_object('id',p_asset_id)))
  order by received_at desc limit 500
 ), records as (
  select r from (select items from start_batches union all select items from end_batches) b cross join lateral jsonb_array_elements(b.items) r
 )
 select distinct r->>'date',(r->'counters'->>'hours')::double precision,
 case r->'telemetry'->>'ignition' when '0' then false when 'false' then false when '1' then true when 'true' then true else null end
 from records where r->>'type'='telemetry' and r->'asset'->>'id'=p_asset_id
 and jsonb_typeof(r->'counters'->'hours')='number' and r->>'date' is not null
$$;
revoke all on function public.roam_hire_usage_readings(text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.roam_hire_usage_readings(text,timestamptz,timestamptz) to service_role;
