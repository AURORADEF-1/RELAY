-- Separate asset inbox: never writes to notifications or invokes popup delivery.
create table public.asset_events (
 id uuid primary key default gen_random_uuid(),
 event_key text not null unique,
 machine_id uuid not null references public.machines(id) on delete cascade,
 provider text not null check(provider in ('jcb','trackunit','takeuchi')),
 kind text not null check(kind in ('movement','yard_arrival','yard_departure','fault','not_checked_in','data_unavailable')),
 title text not null, detail text not null,
 occurred_at timestamptz not null, created_at timestamptz not null default now(),
 payload jsonb not null default '{}'::jsonb
);
create index asset_events_machine_time on public.asset_events(machine_id,occurred_at desc,id);
create index asset_events_created on public.asset_events(created_at desc,id);
create table public.asset_event_receipts (
 event_id uuid not null references public.asset_events(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 read_at timestamptz not null default now(), acknowledged_at timestamptz,
 primary key(event_id,user_id)
);
create index asset_event_receipts_user on public.asset_event_receipts(user_id,event_id);
alter table public.asset_events enable row level security;
alter table public.asset_event_receipts enable row level security;
revoke all on public.asset_events,public.asset_event_receipts from anon,authenticated;
grant select on public.asset_events to authenticated;
grant select,insert,update on public.asset_event_receipts to authenticated;
grant all on public.asset_events,public.asset_event_receipts to service_role;
create policy asset_events_admin_read on public.asset_events for select to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'));
create policy asset_receipts_own_read on public.asset_event_receipts for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'));
create policy asset_receipts_own_insert on public.asset_event_receipts for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'));
create policy asset_receipts_own_update on public.asset_event_receipts for update to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin')) with check(user_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'));
create function public.asset_inbox_page(p_kind text default null,p_unread boolean default false,p_before timestamptz default null,p_offset integer default 0)
returns table(id uuid,machine_id uuid,provider text,kind text,title text,detail text,occurred_at timestamptz,created_at timestamptz,payload jsonb,read_at timestamptz,acknowledged_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select e.id,e.machine_id,e.provider,e.kind,e.title,e.detail,e.occurred_at,e.created_at,e.payload,r.read_at,r.acknowledged_at
 from public.asset_events e left join public.asset_event_receipts r on r.event_id=e.id and r.user_id=(select auth.uid())
 where (p_kind is null or e.kind=p_kind) and (not p_unread or r.event_id is null) and (p_before is null or e.created_at<=p_before)
 order by e.created_at desc,e.id limit 51 offset least(greatest(p_offset,0),10000);
$$;
revoke all on function public.asset_inbox_page(text,boolean,timestamptz,integer) from public,anon;
grant execute on function public.asset_inbox_page(text,boolean,timestamptz,integer) to authenticated;

create function public.asset_inbox_unread_count() returns bigint
language sql stable security invoker set search_path='' as $$
 select count(*) from public.asset_events e where not exists (
 select 1 from public.asset_event_receipts r where r.event_id=e.id and r.user_id=(select auth.uid()));
$$;
revoke all on function public.asset_inbox_unread_count() from public,anon;
grant execute on function public.asset_inbox_unread_count() to authenticated;
