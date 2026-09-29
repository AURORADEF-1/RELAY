alter table public.asset_events drop constraint asset_events_provider_check;
alter table public.asset_events add constraint asset_events_provider_check check(provider in ('jcb','trackunit','takeuchi','assetcare','signwatch'));
alter table public.asset_events drop constraint asset_events_kind_check;
alter table public.asset_events add constraint asset_events_kind_check check(kind in ('movement','yard_arrival','yard_departure','fault','not_checked_in','data_unavailable','sign_watch'));
alter table public.asset_events alter column machine_id drop not null;
alter table public.asset_events add constraint asset_events_machine_or_signwatch check(machine_id is not null or (provider='signwatch' and kind='sign_watch' and payload->>'device_id'='sign-watch-test'));
-- Serialized by the existing per-device latest row lock. No public RPC or new grants.
alter table public.sign_watch_latest
 add column if not exists alert_fallen_since timestamptz,
 add column if not exists alert_fallen_sent boolean not null default false,
 add column if not exists alert_left_sent boolean not null default false,
 add column if not exists alert_movement_at timestamptz;
create or replace function public.sign_watch_alerts_on_reading() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
 state text := new.payload->>'status';
 prev jsonb;
 fresh boolean;
 continuous boolean := false;
 moved boolean := false;
 titles text[] := '{}';
 bodies text[] := '{}';
 i integer;
begin
 if tg_op='UPDATE' then
  prev:=old.payload;
  continuous:= new.received_at-old.received_at between interval '0 seconds' and interval '20 seconds';
  new.alert_fallen_since:=old.alert_fallen_since;
  new.alert_fallen_sent:=old.alert_fallen_sent;
  new.alert_left_sent:=old.alert_left_sent;
  new.alert_movement_at:=old.alert_movement_at;
 end if;
 fresh:=coalesce((new.payload->>'calibrated')::boolean,false)
   and coalesce((new.payload->>'sensor_age_ms')::numeric,99999)<1500
   and state in ('level','tilted','moving','fallen')
   and not coalesce((new.payload->>'calibrating')::boolean,false);
 if not fresh or not continuous then
  new.alert_fallen_since:=null;
  -- Preserve sent flags across an outage: do not repeat an existing incident.
 end if;
 if fresh then
 if prev->>'calibrated_at' is distinct from new.payload->>'calibrated_at' then
  new.alert_fallen_since:=null;new.alert_fallen_sent:=false;new.alert_left_sent:=false;
 end if;
 moved:= (state in ('moving','tilted') and coalesce(prev->>'status','') not in ('moving','tilted','fallen'))
  or (continuous and prev->>'motion_session'=new.payload->>'motion_session'
      and coalesce((new.payload->>'motion_seq')::bigint,0)>coalesce((prev->>'motion_seq')::bigint,0));
 if state<>'fallen' and continuous and prev->>'motion_session'=new.payload->>'motion_session'
   and coalesce((new.payload->>'fall_seq')::bigint,0)>coalesce((prev->>'fall_seq')::bigint,0)
   and not new.alert_fallen_sent then
  titles:=array_append(titles,'Test knocked over');
  bodies:=array_append(bodies,'Test detected a knock-over between uploads. Check the current position in Fleet → Sign Watch.');
 end if;
 if state='fallen' then
  new.alert_fallen_since:=coalesce(new.alert_fallen_since,new.received_at);
  if not new.alert_fallen_sent then
   titles:=array_append(titles,'Test knocked over');
   bodies:=array_append(bodies,'Test is knocked over. Please check and stand the cone upright.');
   new.alert_fallen_sent:=true;
  end if;
  if not new.alert_left_sent and new.received_at-new.alert_fallen_since>=interval '60 seconds' then
   titles:=array_append(titles,'Test still knocked over');
   bodies:=array_append(bodies,'Test has remained knocked over for at least 60 seconds of fresh readings and needs attention.');
   new.alert_left_sent:=true;
  end if;
 elsif state in ('level','tilted') then
  new.alert_fallen_since:=null;new.alert_fallen_sent:=false;new.alert_left_sent:=false;
 else
  -- Moving or missing telemetry cannot prove it remained fallen.
  new.alert_fallen_since:=null;
 end if;
 end if;
 update public.sign_watch_latest set alert_fallen_since=new.alert_fallen_since, alert_fallen_sent=new.alert_fallen_sent, alert_left_sent=new.alert_left_sent, alert_movement_at=new.alert_movement_at where device_id=new.device_id;
 for i in 1..coalesce(array_length(titles,1),0) loop
  insert into public.asset_events(event_key,machine_id,provider,kind,title,detail,occurred_at,payload)
   values('signwatch:'||new.device_id||':'||new.received_at::text||':'||i,null,'signwatch','sign_watch',titles[i],bodies[i],new.received_at,jsonb_build_object('device_id',new.device_id,'name','Test'))
   on conflict(event_key) do nothing;
 end loop;
 return new;
end $$;
revoke all on function public.sign_watch_alerts_on_reading() from public,anon,authenticated;
grant execute on function public.sign_watch_alerts_on_reading() to service_role;

-- Preserve the real knock-over events in Fleet Inbox and silence the retired pop-up channel.
insert into public.asset_events(event_key,machine_id,provider,kind,title,detail,occurred_at,payload)
select 'signwatch:import:'||created_at::text||':'||title,null,'signwatch','sign_watch',replace(title,'Sign Watch: cone','Test'),replace(body,'Sign Watch Test','Test'),created_at,jsonb_build_object('device_id','sign-watch-test','name','Test')
from public.notifications where type='sign_watch' and title in ('Sign Watch: cone knocked over','Sign Watch: cone still knocked over')
group by created_at,title,body on conflict(event_key) do nothing;
update public.notifications set read_at=coalesce(read_at,now()) where type='sign_watch';
