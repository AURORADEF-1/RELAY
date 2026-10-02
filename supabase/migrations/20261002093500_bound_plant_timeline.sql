-- Bound report work to two months plus one older baseline per tracker.
create or replace function public.plant_yard_timeline(p_keys jsonb,p_to timestamptz)
returns table(provider text,pin text,first_at timestamptz,last_at timestamptz,readings bigint,changes jsonb)
language sql stable security invoker set search_path='' set statement_timeout='8s' as $$
 with keys as (select distinct x->>'provider' provider,x->>'pin' pin from jsonb_array_elements(p_keys) x),
 points as materialized (
 select p.* from public.plant_yard_positions p join keys k using(provider,pin) where p.observed_at<p_to and p.observed_at>=p_to-interval '62 days'
 union all
 select older.* from keys k cross join lateral (select p.* from public.plant_yard_positions p where p.provider=k.provider and p.pin=k.pin and p.observed_at<p_to-interval '62 days' and p.side<>0 order by p.observed_at desc limit 1) older
 ), seq as (
 select *,lag(side) over(partition by provider,pin order by observed_at) previous from points where side<>0
 ), transitions as (
 select provider,pin,jsonb_agg(jsonb_build_object('at',observed_at,'side',side) order by observed_at) changes from seq where previous is null or previous<>side group by provider,pin
 )
 select p.provider,p.pin,min(p.observed_at),max(p.observed_at),count(*),coalesce(t.changes,'[]'::jsonb)
 from points p left join transitions t using(provider,pin) group by p.provider,p.pin,t.changes
$$;
