-- Read-only staff events. Raw feed data remains service-role only.
create or replace function public.staff_history_events(p_id text, p_owner text, p_start timestamptz, p_end timestamptz)
returns jsonb language sql stable security invoker set search_path=public as $$
 with records as (
  select v from assetcare_batches b cross join lateral jsonb_array_elements(b.items) v
  where b.received_at >= p_start - interval '2 days'
    and p_start <= now() and p_end > p_start and p_end-p_start <= interval '32 days'
    and length(p_id) between 1 and 200 and length(p_owner) between 1 and 200
    and v->>'type'='event' and v#>>'{owner,id}'=p_owner
    and v#>>'{details,asset,id}'=p_id
    and (v->>'eventClass'='overspeedevent' and v->>'eventType'='start'
      or v->>'eventClass'='zoneevent' and v->>'eventType' in ('enter','exit')
      and v#>>'{details,zone,id}'='412b4071-dc0e-4c45-aecb-49fb8542c19f')
 ), events as (
  select distinct v#>>'{details,asset,id}' asset_id,v->>'id' event_id,
    case when v->>'eventClass'='overspeedevent' then 'speeding' when v->>'eventType'='enter' then 'arrival' else 'departure' end kind,
    (v->>'eventDate')::timestamptz occurred_at,
    case when v->>'eventClass'='overspeedevent' then v#>>'{details,telemetry,location,speed}' end speed_kph,
    case when v->>'eventClass'='overspeedevent' then v#>>'{details,limit,kph}' end limit_kph
  from records where (v->>'eventDate')::timestamptz >= p_start and (v->>'eventDate')::timestamptz <= now() and (v->>'eventDate')::timestamptz < p_end
 ), bounded as (select * from events order by occurred_at,event_id limit 10001)
 select jsonb_build_object('events',coalesce((select jsonb_agg(to_jsonb(bounded)) from bounded),'[]'::jsonb),
 'archive_start',(select min(received_at) from assetcare_batches),
 'latest_saved',(select max(received_at) from assetcare_batches));
$$;
revoke all on function public.staff_history_events(text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.staff_history_events(text,text,timestamptz,timestamptz) to service_role;
