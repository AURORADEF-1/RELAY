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
 if moved and (new.alert_movement_at is null or new.received_at-new.alert_movement_at>=interval '30 seconds') then
  titles:=array_append(titles,'Sign Watch: cone moved');
  bodies:=array_append(bodies,'Sign Watch Test detected movement or a change from its upright position. Open Fleet → Sign Watch to check the cone.');
  new.alert_movement_at:=new.received_at;
 end if;
 if state<>'fallen' and continuous and prev->>'motion_session'=new.payload->>'motion_session'
   and coalesce((new.payload->>'fall_seq')::bigint,0)>coalesce((prev->>'fall_seq')::bigint,0)
   and not new.alert_fallen_sent then
  titles:=array_append(titles,'Sign Watch: cone knocked over');
  bodies:=array_append(bodies,'Sign Watch Test detected a knock-over between uploads. Check the current position in Fleet → Sign Watch.');
 end if;
 if state='fallen' then
  new.alert_fallen_since:=coalesce(new.alert_fallen_since,new.received_at);
  if not new.alert_fallen_sent then
   titles:=array_append(titles,'Sign Watch: cone knocked over');
   bodies:=array_append(bodies,'Sign Watch Test is knocked over. Please check and stand the cone upright.');
   new.alert_fallen_sent:=true;
  end if;
  if not new.alert_left_sent and new.received_at-new.alert_fallen_since>=interval '60 seconds' then
   titles:=array_append(titles,'Sign Watch: cone still knocked over');
   bodies:=array_append(bodies,'Sign Watch Test has remained knocked over for at least 60 seconds of fresh readings and needs attention.');
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
  insert into public.notifications(user_id,type,title,body)
   select id,'sign_watch',titles[i],bodies[i] from public.profiles where role='admin';
 end loop;
 return new;
end $$;
revoke all on function public.sign_watch_alerts_on_reading() from public,anon,authenticated;
grant execute on function public.sign_watch_alerts_on_reading() to service_role;
create trigger sign_watch_alerts_after_write after insert or update of payload,received_at on public.sign_watch_latest
 for each row execute function public.sign_watch_alerts_on_reading();
