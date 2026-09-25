-- Keep the full event ledger, but present the newest report of each machine/code.
create function public.asset_inbox_current_events(p_before timestamptz default null) returns setof public.asset_events
language sql stable security invoker set search_path='' as $$
 select distinct on (
  case when e.kind='fault' then e.machine_id else e.id end,
  e.provider,e.kind,case when e.kind='fault' then e.payload->>'code' else null end
 ) e.* from public.asset_events e where p_before is null or e.created_at<=p_before
 order by case when e.kind='fault' then e.machine_id else e.id end,
  e.provider,e.kind,case when e.kind='fault' then e.payload->>'code' else null end,
  e.occurred_at desc,e.created_at desc,e.id;
$$;
revoke all on function public.asset_inbox_current_events(timestamptz) from public,anon;
grant execute on function public.asset_inbox_current_events(timestamptz) to authenticated,service_role;
create or replace function public.asset_inbox_page(p_kind text default null,p_unread boolean default false,p_before timestamptz default null,p_offset integer default 0)
returns table(id uuid,machine_id uuid,provider text,kind text,title text,detail text,occurred_at timestamptz,created_at timestamptz,payload jsonb,read_at timestamptz,acknowledged_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select e.id,e.machine_id,e.provider,e.kind,e.title,e.detail,e.occurred_at,e.created_at,e.payload,r.read_at,r.acknowledged_at
 from public.asset_inbox_current_events(p_before) e left join public.asset_event_receipts r on r.event_id=e.id and r.user_id=(select auth.uid())
 where (p_kind is null or e.kind=p_kind) and (not p_unread or r.event_id is null) and (p_before is null or e.created_at<=p_before)
 order by e.created_at desc,e.id limit 51 offset least(greatest(p_offset,0),10000);
$$;
create or replace function public.asset_inbox_unread_count() returns bigint
language sql stable security invoker set search_path='' as $$
 select count(*) from public.asset_inbox_current_events() e where not exists (
 select 1 from public.asset_event_receipts r where r.event_id=e.id and r.user_id=(select auth.uid()));
$$;
