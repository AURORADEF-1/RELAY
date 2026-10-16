-- Apply only after assetcare_compact_backfill has covered the existing archive
-- and its trip/event counts have been checked.
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

create or replace function public.staff_history_events(p_id text,p_owner text,p_start timestamptz,p_end timestamptz)
returns jsonb language sql stable security invoker set search_path=public as $$
  with bounded as (
    select asset_id,event_id,kind,occurred_at,speed_kph,limit_kph
    from assetcare_trip_events
    where owner_id=p_owner and asset_id=p_id and occurred_at>=p_start and occurred_at<p_end and occurred_at<=now()
      and p_start<=now() and p_end>p_start and p_end-p_start<=interval '32 days'
      and length(p_id) between 1 and 200 and length(p_owner) between 1 and 200
    order by occurred_at,event_id limit 10001
  )
  select jsonb_build_object(
    'events',coalesce((select jsonb_agg(to_jsonb(bounded)) from bounded),'[]'::jsonb),
    'archive_start',(select min(occurred_at) from assetcare_trip_events where owner_id=p_owner),
    'latest_saved',(select max(occurred_at) from assetcare_trip_events where owner_id=p_owner));
$$;

create or replace function public.assetcare_compact_cleanup()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare raw_rows integer; point_rows integer; trip_rows integer; event_rows integer;
begin
  -- Bound each cleanup so the ingestion lease is never held by one enormous
  -- first-run delete. Hourly runs drain any legacy backlog progressively.
  delete from assetcare_batches where ctid in (select ctid from assetcare_batches where received_at<now()-interval '48 hours' order by received_at limit 10000); get diagnostics raw_rows=row_count;
  delete from assetcare_trip_points_recent where ctid in (select ctid from assetcare_trip_points_recent where observed_at<now()-interval '48 hours' order by observed_at limit 50000); get diagnostics point_rows=row_count;
  delete from assetcare_trips where ended_at<now()-interval '3 months'; get diagnostics trip_rows=row_count;
  delete from assetcare_trip_events where occurred_at<now()-interval '3 months'; get diagnostics event_rows=row_count;
  update assetcare_stream_state set compact_cleanup_at=now() where id=true;
  return jsonb_build_object('raw_batches',raw_rows,'recent_points',point_rows,'trips',trip_rows,'events',event_rows);
end;$$;

revoke all on function public.assetcare_trip_history(text,timestamptz,timestamptz,text),
  public.staff_history_events(text,text,timestamptz,timestamptz),public.assetcare_compact_cleanup() from public,anon,authenticated;
grant execute on function public.assetcare_trip_history(text,timestamptz,timestamptz,text),
  public.staff_history_events(text,text,timestamptz,timestamptz),public.assetcare_compact_cleanup() to service_role;

create or replace function public.save_assetcare_batch(p_owner uuid,p_hash text,p_items jsonb,p_assets jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
declare a jsonb; e jsonb; cleanup_due boolean;
begin
  select compact_cleanup_at is null or compact_cleanup_at<now()-interval '1 hour' into cleanup_due
  from assetcare_stream_state where id=true and owner=p_owner and lease_until>now() for update;
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
  if cleanup_due then perform assetcare_compact_cleanup(); end if;
  return true;
end;$$;

revoke all on function public.save_assetcare_batch(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_assetcare_batch(uuid,text,jsonb,jsonb) to service_role;
