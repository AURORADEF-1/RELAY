-- Hire clearance is independent of the GPS-derived hire estimate.
-- Server-only tables/functions: API verifies the session and passes the real actor ID.
create table public.fleet_workflow_access (
 user_id uuid primary key references public.profiles(id), workshop boolean not null default false,
 parts boolean not null default false, hire boolean not null default false, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
create table public.fleet_hire_state (
 machine_id uuid primary key references public.machines(id), cycle_id uuid not null default gen_random_uuid(),
 location text not null default 'unknown' check(location in ('yard','away','unknown')),
 arrived_at timestamptz, last_boundary_at timestamptz, workshop_checked_at timestamptz, parts_checked_at timestamptz,
 next_service_date date, next_service_hours numeric check(next_service_hours>=0), last_service_at timestamptz, last_service_hours numeric check(last_service_hours>=0),
 released_at timestamptz, override_at timestamptz, override_reason text, override_fingerprint text,
 departure_status text check(departure_status in ('green','override','warning')), version bigint not null default 0, updated_at timestamptz not null default now()
);
create table public.fleet_workflow_audit (
 id uuid primary key, machine_id uuid not null references public.machines(id), cycle_id uuid not null,
 actor_id uuid references public.profiles(id), action text not null, reason text not null, payload jsonb not null default '{}', created_at timestamptz not null default now()
);
create index fleet_workflow_audit_machine on public.fleet_workflow_audit(machine_id,created_at desc);
create table public.fleet_workflow_messages (
 id uuid primary key default gen_random_uuid(), event_key text not null unique, machine_id uuid not null references public.machines(id),
 team text not null check(team in ('workshop','parts','hire')), title text not null, detail text not null,
 severity text not null check(severity in ('info','warning','success')), created_at timestamptz not null default now()
);
create table public.fleet_workflow_receipts (
 message_id uuid references public.fleet_workflow_messages(id), user_id uuid references public.profiles(id), read_at timestamptz not null default now(), primary key(message_id,user_id)
);
alter table public.fleet_workflow_access enable row level security;
alter table public.fleet_hire_state enable row level security;
alter table public.fleet_workflow_audit enable row level security;
alter table public.fleet_workflow_messages enable row level security;
alter table public.fleet_workflow_receipts enable row level security;
revoke all on public.fleet_workflow_access,public.fleet_hire_state,public.fleet_workflow_audit,public.fleet_workflow_messages,public.fleet_workflow_receipts from public,anon,authenticated;
grant select,insert,update on public.fleet_workflow_access,public.fleet_hire_state,public.fleet_workflow_messages,public.fleet_workflow_receipts to service_role;
grant select,insert on public.fleet_workflow_audit to service_role;

create function public.fleet_hire_assessment(p_machine uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare s public.fleet_hire_state; m public.machines; blockers text[]:='{}'; ids text[]; hrs numeric; hrs_at timestamptz; status text; fingerprint text;
begin
 select * into m from public.machines where id=p_machine;
 if not found or m.lifecycle_status<>'active' or exists(select 1 from public.customer_fleet_machines where machine_id=p_machine) then return jsonb_build_object('machine_id',p_machine,'status','excluded','available',false,'blockers',jsonb_build_array('Not active MLP fleet')); end if;
 select * into s from public.fleet_hire_state where machine_id=p_machine;
 if not found then return jsonb_build_object('machine_id',p_machine,'machine_number',m.machine_number,'status','not_assessed','available',false,'blockers',jsonb_build_array('No recorded yard clearance'),'version',0); end if;
 if s.workshop_checked_at is null then blockers:=array_append(blockers,'Workshop inspection required'); end if;
 if s.parts_checked_at is null then blockers:=array_append(blockers,'Parts check required'); end if;
 if s.next_service_date is null and s.next_service_hours is null then blockers:=array_append(blockers,'Service schedule not recorded'); end if;
 if s.next_service_date <= (now() at time zone 'Europe/London')::date then blockers:=array_append(blockers,'Service due by date'); end if;
 if s.next_service_hours is not null then
  select (payload->'hours'->>'value')::numeric,(payload->'hours'->>'at')::timestamptz into hrs,hrs_at from public.fleet_operation_samples
  where machine_id=p_machine and jsonb_typeof(payload->'hours'->'value')='number' and payload->'hours'->>'at' is not null order by captured_at desc limit 1;
  if hrs is null or hrs_at<now()-interval '48 hours' or hrs_at>now() then
   hrs:=m.current_hours;hrs_at:=m.hours_reading_date::timestamptz;
  end if;
  if hrs is null or hrs_at is null or hrs_at<now()-interval '48 hours' or hrs_at>now() then blockers:=array_append(blockers,'Current service hours need checking');
  elsif hrs>=s.next_service_hours then blockers:=array_append(blockers,'Service due by hours');end if;
 end if;
 select array_agg('Open parts request: '||id::text order by id) into ids from public.tickets t where coalesce(t.is_retail_sale,false)=false and coalesce(t.status,'')<>'COMPLETED' and
 (t.machine_number_normalized=m.machine_number_normalized or regexp_replace(upper(coalesce(t.machine_number,t.machine_reference,'')),'[^A-Z0-9]','','g')=m.machine_number_normalized);
 blockers:=blockers||coalesce(ids,'{}');
 select array_agg('Open workshop job: '||id::text order by id) into ids from public.workshop_incidents w where coalesce(w.status,'') not in ('READY','CLOSED') and regexp_replace(upper(w.machine_reference),'[^A-Z0-9]','','g')=m.machine_number_normalized;
 blockers:=blockers||coalesce(ids,'{}');
 select array_agg('Fault requires review: '||id::text order by id) into ids from public.asset_events e where e.machine_id=p_machine and e.kind='fault' and e.created_at>coalesce(s.workshop_checked_at,'-infinity'::timestamptz);
 blockers:=blockers||coalesce(ids,'{}');
 select array_agg('Active fleet flag: '||id::text order by id) into ids from public.fleet_asset_flags f where f.machine_id=p_machine and f.resolved_at is null;
 blockers:=blockers||coalesce(ids,'{}');
 fingerprint:=md5(array_to_string(blockers,'|'));
 status:=case when s.location<>'yard' then case when s.location='away' then 'away' else 'location_unconfirmed' end
 when s.override_at is not null and s.override_fingerprint=fingerprint then 'available_override'
 when cardinality(blockers)>0 then 'on_hold' when s.released_at is null then 'awaiting_release' else 'available' end;
 return jsonb_build_object('machine_id',p_machine,'machine_number',m.machine_number,'model',concat_ws(' ',m.make,m.model),'status',status,'available',status in ('available','available_override'),'blockers',to_jsonb(blockers),'fingerprint',fingerprint,'current_hours',hrs,'hours_at',hrs_at,'state',to_jsonb(s),'version',s.version,'checked_at',now());
end $$;
revoke all on function public.fleet_hire_assessment(uuid) from public,anon,authenticated;
grant execute on function public.fleet_hire_assessment(uuid) to service_role;

create function public.fleet_hire_action(p_id uuid,p_machine uuid,p_actor uuid,p_version bigint,p_action text,p_reason text,p_payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.fleet_hire_state; a public.fleet_workflow_access; admin boolean; assessment jsonb; previous public.fleet_workflow_audit; team_name text; service_date date; service_hours numeric;
begin
 select role='admin' into admin from public.profiles where id=p_actor;
 select * into a from public.fleet_workflow_access where user_id=p_actor;
 if not coalesce(admin,false) and not coalesce(a.workshop or a.parts or a.hire,false) then raise exception 'Workflow access required' using errcode='42501';end if;
 if p_action not in ('workshop_clear','parts_clear','service_complete','service_plan','release','override','hold') then raise exception 'Invalid workflow action';end if;
 if length(trim(coalesce(p_reason,'')))<5 or length(p_reason)>1500 then raise exception 'A reason or work record of 5 to 1500 characters is required';end if;
 if not coalesce(admin,false) and not(case when p_action in ('workshop_clear','service_complete','service_plan') then coalesce(a.workshop,false) when p_action='parts_clear' then coalesce(a.parts,false) when p_action in ('release','override') then coalesce(a.hire,false) else true end) then raise exception 'Not permitted for this workflow action' using errcode='42501';end if;
 if not exists(select 1 from public.machines where id=p_machine and lifecycle_status='active') or exists(select 1 from public.customer_fleet_machines where machine_id=p_machine) then raise exception 'Active MLP fleet required';end if;
 insert into public.fleet_hire_state(machine_id) values(p_machine) on conflict do nothing;
 select * into s from public.fleet_hire_state where machine_id=p_machine for update;
 select * into previous from public.fleet_workflow_audit where id=p_id;
 if found then
  if previous.machine_id=p_machine and previous.actor_id=p_actor and previous.action=p_action and previous.reason=p_reason and previous.payload=p_payload then return public.fleet_hire_assessment(p_machine);end if;
  raise exception 'Submission ID already used';
 end if;
 if s.version<>p_version then raise exception 'Workflow changed. Refresh before saving.' using errcode='40001';end if;
 assessment:=public.fleet_hire_assessment(p_machine);
 if p_action='release' and (s.location<>'yard' or jsonb_array_length(assessment->'blockers')>0) then raise exception 'Complete all checks or record an authorised override';end if;
 if p_action in ('workshop_clear','parts_clear','service_complete') and s.location<>'yard' then raise exception 'A confirmed yard arrival is required for yard checks';end if;
 if p_action in ('service_complete','service_plan') then
  service_date:=nullif(p_payload->>'next_service_date','')::date;service_hours:=nullif(p_payload->>'next_service_hours','')::numeric;
  if service_date is null and service_hours is null then raise exception 'Next service date or hours required';end if;
  if service_date is not null and service_date<=(now() at time zone 'Europe/London')::date then raise exception 'Next service date must be in the future';end if;
  if service_hours is not null and service_hours<0 then raise exception 'Service hours must be positive';end if;
  if p_action='service_complete' and (nullif(p_payload->>'completed_hours','') is null or (p_payload->>'completed_hours')::numeric<0 or (service_hours is not null and service_hours<=(p_payload->>'completed_hours')::numeric)) then raise exception 'Record completion hours and a later next service threshold';end if;
  s.next_service_date:=service_date;s.next_service_hours:=service_hours;
  if p_action='service_complete' then
   s.last_service_at:=now();s.last_service_hours:=(p_payload->>'completed_hours')::numeric;
   update public.machines set current_hours=s.last_service_hours,hours_reading_date=(now() at time zone 'Europe/London')::date where id=p_machine;
  end if;
 end if;
 if p_action='workshop_clear' then s.workshop_checked_at:=now();end if;
 if p_action='parts_clear' then s.parts_checked_at:=now();end if;
 if p_action='release' then s.released_at:=now();s.override_at:=null;s.override_reason:=null;s.override_fingerprint:=null;
 elsif p_action='override' then s.override_at:=now();s.override_reason:=p_reason;s.override_fingerprint:=assessment->>'fingerprint';
 else s.released_at:=null;s.override_at:=null;s.override_reason:=null;s.override_fingerprint:=null;end if;
 if p_action='hold' then s.workshop_checked_at:=null;s.parts_checked_at:=null;end if;
 update public.fleet_hire_state set workshop_checked_at=s.workshop_checked_at,parts_checked_at=s.parts_checked_at,next_service_date=s.next_service_date,next_service_hours=s.next_service_hours,last_service_at=s.last_service_at,last_service_hours=s.last_service_hours,released_at=s.released_at,override_at=s.override_at,override_reason=s.override_reason,override_fingerprint=s.override_fingerprint,version=version+1,updated_at=now() where machine_id=p_machine;
 insert into public.fleet_workflow_audit(id,machine_id,cycle_id,actor_id,action,reason,payload) values(p_id,p_machine,s.cycle_id,p_actor,p_action,p_reason,p_payload);
 foreach team_name in array array['workshop','parts','hire'] loop
  insert into public.fleet_workflow_messages(event_key,machine_id,team,title,detail,severity) values(p_id::text||':'||team_name,p_machine,team_name,case p_action when 'service_complete' then 'Service recorded — clearance checks remain' when 'release' then 'Cleared and available for hire' when 'override' then 'Hire override recorded' when 'hold' then 'Machine placed on hold' else 'Machine workflow updated' end,p_reason,case when p_action in ('override','hold') then 'warning' when p_action='release' then 'success' else 'info' end);
 end loop;
 return public.fleet_hire_assessment(p_machine);
end $$;
revoke all on function public.fleet_hire_action(uuid,uuid,uuid,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.fleet_hire_action(uuid,uuid,uuid,bigint,text,text,jsonb) to service_role;

create function public.fleet_hire_boundary() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.fleet_hire_state; assessment jsonb; outcome text; team_name text; issues boolean; has_job boolean;
begin
 if new.kind not in ('yard_arrival','yard_departure') then return new;end if;
 if not exists(select 1 from public.machines where id=new.machine_id and lifecycle_status='active') or exists(select 1 from public.customer_fleet_machines where machine_id=new.machine_id) then return new;end if;
 insert into public.fleet_hire_state(machine_id) values(new.machine_id) on conflict do nothing;
 select * into s from public.fleet_hire_state where machine_id=new.machine_id for update;
 if new.occurred_at<=coalesce(s.last_boundary_at,'-infinity'::timestamptz) then return new;end if;
 if (new.kind='yard_arrival' and s.location='yard') or (new.kind='yard_departure' and s.location='away') then
  update public.fleet_hire_state set last_boundary_at=new.occurred_at where machine_id=new.machine_id;
  return new;end if;
 if new.kind='yard_arrival' then
  update public.fleet_hire_state set location='yard',cycle_id=gen_random_uuid(),arrived_at=new.occurred_at,last_boundary_at=new.occurred_at,workshop_checked_at=null,parts_checked_at=null,released_at=null,override_at=null,override_reason=null,override_fingerprint=null,departure_status=null,version=version+1,updated_at=now() where machine_id=new.machine_id;
  outcome:='Returned to Yard — inspection and service check required';
 else
  assessment:=public.fleet_hire_assessment(new.machine_id);
  outcome:=case when assessment->>'status'='available' then 'green' when s.override_at is not null and s.override_fingerprint=assessment->>'fingerprint' then 'override' else 'warning' end;
  update public.fleet_hire_state set location='away',last_boundary_at=new.occurred_at,departure_status=outcome,version=version+1,updated_at=now() where machine_id=new.machine_id;
  outcome:=case outcome when 'green' then 'Left yard — cleared for hire ✓' when 'override' then 'Left yard — authorised override' else 'WARNING: asset left yard without clearance' end;
 end if;
 assessment:=public.fleet_hire_assessment(new.machine_id);
 has_job:=exists(select 1 from jsonb_array_elements_text(assessment->'blockers') b where b like 'Open parts request:%' or b like 'Open workshop job:%');
 foreach team_name in array array['workshop','parts','hire'] loop
  insert into public.fleet_workflow_messages(event_key,machine_id,team,title,detail,severity) values(new.id::text||':'||team_name,new.machine_id,team_name,outcome,array_to_string(array(select jsonb_array_elements_text(assessment->'blockers')),'; ')||case when not has_job and jsonb_array_length(assessment->'blockers')>0 then '. No open workshop job or parts request is linked. Review and raise work if needed.' else '' end,case when new.kind='yard_departure' and outcome like '%✓' then 'success' else 'warning' end) on conflict(event_key) do nothing;
 end loop;
 return new;
end $$;
revoke all on function public.fleet_hire_boundary() from public,anon,authenticated;
grant execute on function public.fleet_hire_boundary() to service_role;
create trigger fleet_hire_boundary_event after insert on public.asset_events for each row execute function public.fleet_hire_boundary();

-- Existing confirmed crossings seed presence only; never manufacture clearance.
insert into public.fleet_hire_state(machine_id,location,arrived_at,last_boundary_at)
select e.machine_id,case when e.occurred_at < now()-interval '24 hours' then 'unknown' when e.kind='yard_arrival' then 'yard' else 'away' end,
 case when e.kind='yard_arrival' then e.occurred_at end,e.occurred_at
from (select distinct on(machine_id) machine_id,kind,occurred_at from public.asset_events where kind in ('yard_arrival','yard_departure') order by machine_id,occurred_at desc) e
join public.machines m on m.id=e.machine_id where m.lifecycle_status='active'
and not exists(select 1 from public.customer_fleet_machines c where c.machine_id=e.machine_id)
on conflict do nothing;

create table public.fleet_workflow_access_audit (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),actor_id uuid not null references public.profiles(id),
 permissions jsonb not null,created_at timestamptz not null default now()
);
alter table public.fleet_workflow_access_audit enable row level security;
revoke all on public.fleet_workflow_access_audit from public,anon,authenticated;
grant select,insert on public.fleet_workflow_access_audit to service_role;
create function public.fleet_workflow_set_access(p_actor uuid,p_user uuid,p_workshop boolean,p_parts boolean,p_hire boolean) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'Administrator required' using errcode='42501';end if;
 insert into public.fleet_workflow_access(user_id,workshop,parts,hire,updated_by) values(p_user,p_workshop,p_parts,p_hire,p_actor)
 on conflict(user_id) do update set workshop=excluded.workshop,parts=excluded.parts,hire=excluded.hire,updated_by=p_actor,updated_at=now();
 insert into public.fleet_workflow_access_audit(user_id,actor_id,permissions) values(p_user,p_actor,jsonb_build_object('workshop',p_workshop,'parts',p_parts,'hire',p_hire));
end $$;
revoke all on function public.fleet_workflow_set_access(uuid,uuid,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.fleet_workflow_set_access(uuid,uuid,boolean,boolean,boolean) to service_role;

-- One round trip per bounded batch instead of a network request per machine.
create function public.fleet_hire_assess_batch(p_machines uuid[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if coalesce(cardinality(p_machines),0)>250 then raise exception 'Batch too large';end if;
 return coalesce((select jsonb_agg(public.fleet_hire_assessment(id)) from unnest(p_machines) id),'[]'::jsonb);
end $$;
revoke all on function public.fleet_hire_assess_batch(uuid[]) from public,anon,authenticated;
grant execute on function public.fleet_hire_assess_batch(uuid[]) to service_role;
