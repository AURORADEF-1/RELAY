-- Server-only request coordination across users, cron jobs and Vercel instances.
create table public.fleet_api_cache (
 provider text not null check (provider in ('jcb','trackunit','takeuchi')),
 cache_key text not null, payload jsonb, checked_at timestamptz,
 lease_until timestamptz not null default 'epoch', owner uuid,
 primary key (provider, cache_key)
);
alter table public.fleet_api_cache enable row level security;
revoke all on public.fleet_api_cache from public, anon, authenticated;
grant all on public.fleet_api_cache to service_role;
-- Reuse the live Takeuchi cache and leases through rollout; do not reset quotas.
alter table public.takeuchi_api_cache add column owner uuid;

create table public.fleet_api_budget (
 provider text primary key check (provider in ('jcb','trackunit','takeuchi')),
 cooldown_until timestamptz not null default 'epoch',
 window_start timestamptz not null default 'epoch', requests integer not null default 0,
 second_start timestamptz not null default 'epoch', second_requests integer not null default 0,
 total_requests bigint not null default 0, limited_responses bigint not null default 0
);
alter table public.fleet_api_budget enable row level security;
revoke all on public.fleet_api_budget from public, anon, authenticated;
grant all on public.fleet_api_budget to service_role;

create function public.claim_fleet_api_cache(p_provider text,p_key text,p_owner uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.fleet_api_cache; t timestamptz := clock_timestamp();
begin
 if p_provider='takeuchi' and p_key <> 'operations-collection' then
  insert into public.takeuchi_api_cache(cache_key) values(p_key) on conflict do nothing;
  select p_provider,cache_key,payload,checked_at,lease_until,owner into r from public.takeuchi_api_cache where cache_key=p_key for update;
  if r.checked_at > t - interval '15 minutes' and r.payload is not null then
   return jsonb_build_object('state','cached','data',r.payload,'checkedAt',r.checked_at);
  end if;
  if r.lease_until > t then return jsonb_build_object('state','busy'); end if;
  update public.takeuchi_api_cache set owner=p_owner,lease_until=t+interval '15 minutes' where cache_key=p_key;
  return jsonb_build_object('state','load');
 end if;
 insert into public.fleet_api_cache(provider,cache_key) values(p_provider,p_key) on conflict do nothing;
 select * into r from public.fleet_api_cache where provider=p_provider and cache_key=p_key for update;
 if r.checked_at > t - interval '15 minutes' and r.payload is not null then
  return jsonb_build_object('state','cached','data',r.payload,'checkedAt',r.checked_at);
 end if;
 if r.lease_until > t then return jsonb_build_object('state','busy'); end if;
 update public.fleet_api_cache set owner=p_owner,lease_until=t+interval '15 minutes' where provider=p_provider and cache_key=p_key;
 return jsonb_build_object('state','load');
end $$;

-- RELAY's own ceiling, not a claim about vendor contractual allowances.
-- This rolling window caps all outgoing calls, including auth and pagination.
create function public.admit_fleet_api_request(p_provider text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.fleet_api_budget; t timestamptz := clock_timestamp();
begin
 insert into public.fleet_api_budget(provider) values(p_provider) on conflict do nothing;
 select * into r from public.fleet_api_budget where provider=p_provider for update;
 if r.cooldown_until > t then return false; end if;
 if r.window_start <= t-interval '1 minute' then r.window_start=t; r.requests=0; end if;
 if r.second_start <= t-interval '1 second' then r.second_start=t; r.second_requests=0; end if;
 if r.requests >= 300 or r.second_requests >= 20 then return false; end if;
 update public.fleet_api_budget set window_start=r.window_start,requests=r.requests+1,second_start=r.second_start,second_requests=r.second_requests+1,total_requests=total_requests+1 where provider=p_provider;
 return true;
end $$;

create function public.cooldown_fleet_api(p_provider text,p_until timestamptz)
returns void language sql security invoker set search_path = '' as $$
 insert into public.fleet_api_budget(provider,cooldown_until,limited_responses)
 values(p_provider,greatest(p_until,clock_timestamp()+interval '15 minutes'),1)
 on conflict(provider) do update set
 cooldown_until=greatest(fleet_api_budget.cooldown_until,excluded.cooldown_until),
 limited_responses=fleet_api_budget.limited_responses+1;
$$;
revoke all on function public.claim_fleet_api_cache(text,text,uuid) from public,anon,authenticated;
revoke all on function public.admit_fleet_api_request(text) from public,anon,authenticated;
revoke all on function public.cooldown_fleet_api(text,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_fleet_api_cache(text,text,uuid) to service_role;
grant execute on function public.admit_fleet_api_request(text) to service_role;
grant execute on function public.cooldown_fleet_api(text,timestamptz) to service_role;
