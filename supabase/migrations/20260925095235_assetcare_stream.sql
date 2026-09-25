-- Dedicated queue storage: never expose raw vehicle/driver data to browser roles.
create table public.assetcare_stream_state (
 id boolean primary key default true check(id), owner uuid, lease_until timestamptz,
 next_allowed_at timestamptz, last_attempt_at timestamptz, last_saved_at timestamptz,
 last_ack_at timestamptz, last_error text, last_cycle jsonb
);
insert into public.assetcare_stream_state(id) values(true);
create table public.assetcare_batches (
 content_hash text primary key, received_at timestamptz not null default now(), items jsonb not null check(jsonb_typeof(items)='array')
);
create table public.assetcare_assets (
 asset_id text primary key, observed_at timestamptz not null, name text not null,
 machine jsonb not null, received_at timestamptz not null default now()
);
create index assetcare_batches_received on public.assetcare_batches(received_at);
alter table public.assetcare_stream_state enable row level security;
alter table public.assetcare_batches enable row level security;
alter table public.assetcare_assets enable row level security;
revoke all on public.assetcare_stream_state,public.assetcare_batches,public.assetcare_assets from public,anon,authenticated;
grant all on public.assetcare_stream_state,public.assetcare_batches,public.assetcare_assets to service_role;
create function public.claim_assetcare_stream(p_owner uuid) returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update assetcare_stream_state set owner=p_owner,lease_until=now()+interval '3 minutes',last_attempt_at=now()
 where id=true and (lease_until is null or lease_until<now()) and (next_allowed_at is null or next_allowed_at<=now());
 return found;
end;$$;
create function public.save_assetcare_batch(p_owner uuid,p_hash text,p_items jsonb,p_assets jsonb) returns boolean language plpgsql security invoker set search_path=public as $$
declare a jsonb;
begin
 perform 1 from assetcare_stream_state where id=true and owner=p_owner and lease_until>now() for update;
 if not found then return false;end if;
 insert into assetcare_batches(content_hash,items) values(p_hash,p_items) on conflict(content_hash) do nothing;
 for a in select value from jsonb_array_elements(p_assets) loop
  insert into assetcare_assets(asset_id,observed_at,name,machine) values(a->>'asset_id',(a->>'observed_at')::timestamptz,a->>'name',a->'machine')
  on conflict(asset_id) do update set observed_at=excluded.observed_at,name=excluded.name,machine=excluded.machine,received_at=now()
  where assetcare_assets.observed_at<excluded.observed_at;
 end loop;
 update assetcare_stream_state set last_saved_at=now() where id=true;
 return true;
end;$$;
revoke all on function public.claim_assetcare_stream(uuid),public.save_assetcare_batch(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.claim_assetcare_stream(uuid),public.save_assetcare_batch(uuid,text,jsonb,jsonb) to service_role;
