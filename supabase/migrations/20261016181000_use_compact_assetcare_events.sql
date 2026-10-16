-- Read speeding and yard events from the fleet-wide compact archive. This
-- restores historical event overlays without activating raw-data cleanup.
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

create or replace function public.staff_daily_events(p_ids text[],p_owner text,p_start timestamptz)
returns jsonb language sql stable security invoker set search_path=public as $$
  with bounded as (
    select asset_id,event_id,kind,occurred_at,speed_kph,limit_kph
    from assetcare_trip_events
    where owner_id=p_owner and asset_id=any(p_ids) and occurred_at>=p_start and occurred_at<=now()
      and p_start>=now()-interval '2 days' and p_start<=now()
      and cardinality(p_ids) between 1 and 2000 and length(p_owner) between 1 and 200
    order by occurred_at,event_id limit 10001
  )
  select coalesce(jsonb_agg(to_jsonb(bounded)),'[]'::jsonb) from bounded;
$$;

revoke all on function public.staff_history_events(text,text,timestamptz,timestamptz),
  public.staff_daily_events(text[],text,timestamptz) from public,anon,authenticated;
grant execute on function public.staff_history_events(text,text,timestamptz,timestamptz),
  public.staff_daily_events(text[],text,timestamptz) to service_role;
