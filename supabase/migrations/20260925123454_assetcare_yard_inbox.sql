-- Preserve yard transition history and inbox events atomically before queue acknowledgement.
alter table public.assetcare_assets add column position_history jsonb not null default '[]'::jsonb;
alter table public.asset_events drop constraint asset_events_provider_check;
alter table public.asset_events add constraint asset_events_provider_check check(provider in ('jcb','trackunit','takeuchi','assetcare'));
create or replace function public.save_assetcare_batch(p_owner uuid,p_hash text,p_items jsonb,p_assets jsonb) returns boolean language plpgsql security invoker set search_path=public as $$
declare a jsonb; e jsonb;
begin
 perform 1 from assetcare_stream_state where id=true and owner=p_owner and lease_until>now() for update;
 if not found then return false;end if;
 insert into assetcare_batches(content_hash,items) values(p_hash,p_items) on conflict(content_hash) do nothing;
 for a in select value from jsonb_array_elements(p_assets) loop
  insert into assetcare_assets(asset_id,observed_at,name,machine,position_history) values(a->>'asset_id',(a->>'observed_at')::timestamptz,a->>'name',a->'machine',coalesce(a->'position_history','[]'::jsonb))
  on conflict(asset_id) do update set observed_at=excluded.observed_at,name=excluded.name,machine=excluded.machine,position_history=case when a ? 'position_history' then excluded.position_history else assetcare_assets.position_history end,received_at=now()
  where assetcare_assets.observed_at<=excluded.observed_at;
  for e in select value from jsonb_array_elements(coalesce(a->'events','[]'::jsonb)) loop
   insert into asset_events(event_key,machine_id,provider,kind,title,detail,occurred_at,payload)
   values(e->>'event_key',(e->>'machine_id')::uuid,'assetcare',e->>'kind',e->>'title',e->>'detail',(e->>'occurred_at')::timestamptz,e->'payload')
   on conflict(event_key) do nothing;
  end loop;
 end loop;
 update assetcare_stream_state set last_saved_at=now() where id=true;
 return true;
end;$$;
