-- Compact reporting history: deliberately separate from inbox alerts and hire workflow triggers.
create table public.plant_yard_positions (
 provider text not null, pin text not null, observed_at timestamptz not null,
 side smallint not null check(side in (-1,0,1)),
 primary key(provider,pin,observed_at)
);
alter table public.plant_yard_positions enable row level security;
revoke all on public.plant_yard_positions from public,anon,authenticated;
grant select,insert,update,delete on public.plant_yard_positions to service_role;

-- 1 = yard, -1 = outside, 0 = boundary uncertainty. Mirrors positionSide's 20 m band.
create function public.plant_yard_side(p_lat double precision,p_lon double precision)
returns smallint language plpgsql immutable strict security invoker set search_path='' as $$
declare ring jsonb := '[[0.9569907, 52.3930541], [0.9564818, 52.3930337], [0.9561752, 52.3930336], [0.9544359, 52.3929885], [0.9536607, 52.3929231], [0.9522995, 52.3927824], [0.9528305, 52.3911095], [0.9530824, 52.3911577], [0.9532088, 52.3911227], [0.9534582, 52.3905481], [0.9537076, 52.3899719], [0.9541529, 52.3901634], [0.9547672, 52.3906807], [0.9543782, 52.3911669], [0.95422, 52.3914058], [0.9539276, 52.3919706], [0.9540805, 52.3920082], [0.9545043, 52.3912291], [0.9546894, 52.3909573], [0.9548745, 52.3907495], [0.9560036, 52.3914336], [0.9569636, 52.3920383], [0.9573179, 52.3923011], [0.9575269, 52.3925481], [0.9577833, 52.3929076], [0.9578007, 52.3930018], [0.9577297, 52.393082], [0.9576362, 52.3930616], [0.9575419, 52.3931908], [0.9574588, 52.3931646], [0.9574212, 52.3932064], [0.9573112, 52.3931802], [0.9573005, 52.3932031], [0.9571691, 52.3931752], [0.9571805, 52.3931147], [0.9569907, 52.3930541]]'::jsonb; i integer; ax float8; ay float8; bx float8; end_y float8;
 dx float8; dy float8; px float8; py float8; t float8; sx float8;
begin
 if not (p_lat between -90 and 90 and p_lon between -180 and 180) or (p_lat=0 and p_lon=0) then return null; end if;
 -- Skip polygon work for positions well beyond the yard.
 if p_lat<52.389 or p_lat>52.394 or p_lon<0.951 or p_lon>0.959 then return -1; end if;
 sx:=111320*cos(radians(p_lat));
 for i in 1..jsonb_array_length(ring)-1 loop
 ax:=(ring->(i-1)->>0)::float8; ay:=(ring->(i-1)->>1)::float8;
 bx:=(ring->i->>0)::float8; end_y:=(ring->i->>1)::float8;
 dx:=(bx-ax)*sx; dy:=(end_y-ay)*111320; px:=(p_lon-ax)*sx; py:=(p_lat-ay)*111320;
 t:=greatest(0,least(1,(px*dx+py*dy)/coalesce(nullif(dx*dx+dy*dy,0),1)));
 if sqrt((px-t*dx)^2+(py-t*dy)^2)<=20 then return 0; end if;
 end loop;
 if point(p_lon,p_lat) <@ polygon '((0.9569907,52.3930541),(0.9564818,52.3930337),(0.9561752,52.3930336),(0.9544359,52.3929885),(0.9536607,52.3929231),(0.9522995,52.3927824),(0.9528305,52.3911095),(0.9530824,52.3911577),(0.9532088,52.3911227),(0.9534582,52.3905481),(0.9537076,52.3899719),(0.9541529,52.3901634),(0.9547672,52.3906807),(0.9543782,52.3911669),(0.95422,52.3914058),(0.9539276,52.3919706),(0.9540805,52.3920082),(0.9545043,52.3912291),(0.9546894,52.3909573),(0.9548745,52.3907495),(0.9560036,52.3914336),(0.9569636,52.3920383),(0.9573179,52.3923011),(0.9575269,52.3925481),(0.9577833,52.3929076),(0.9578007,52.3930018),(0.9577297,52.393082),(0.9576362,52.3930616),(0.9575419,52.3931908),(0.9574588,52.3931646),(0.9574212,52.3932064),(0.9573112,52.3931802),(0.9573005,52.3932031),(0.9571691,52.3931752),(0.9571805,52.3931147),(0.9569907,52.3930541))' then return 1; end if;
 return -1;
end $$;

create function public.plant_yard_save(p_provider text,p_pin text,p_at text,p_lat text,p_lon text)
returns void language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz; side_value smallint;
begin
 if p_pin is null or p_pin='' or p_at is null then return; end if;
 begin
 stamp:=p_at::timestamptz;
 side_value:=public.plant_yard_side(p_lat::float8,p_lon::float8);
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return;
 end;
 if side_value is null or stamp>now() or not isfinite(stamp) then return; end if;
 insert into public.plant_yard_positions values(p_provider,p_pin,stamp,side_value) on conflict do nothing;
end $$;

create function public.plant_yard_capture() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb; row_data jsonb; location_data jsonb; stamp text;
begin
 if tg_table_name='fleet_operation_samples' then
 perform public.plant_yard_save(new.provider,new.pin,new.payload->'position'->>'at',new.payload->'position'->>'latitude',new.payload->'position'->>'longitude');
 else
 for item in select value from jsonb_array_elements(new.items) loop
 row_data:=case when item->>'type'='event' then item->'details'->'telemetry' else item end;
 if row_data->>'type' not in ('telemetry','trip') or row_data->'owner'->>'id' is distinct from item->'owner'->>'id' then continue; end if;
 location_data:=case when row_data->>'type'='trip' then row_data->'end' else row_data->'location' end;
 if row_data->>'type'='telemetry' and jsonb_typeof(location_data->'age')='number' and (location_data->>'age')::numeric>0 then continue; end if;
 stamp:=case when row_data->>'type'='trip' then row_data->>'dateEnd' else row_data->>'date' end;
 perform public.plant_yard_save('assetcare',row_data->'asset'->>'id',stamp,location_data->>'lat',location_data->>'lon');
 end loop;
 end if;
 return new;
end $$;
create trigger plant_yard_sample after insert on public.fleet_operation_samples for each row execute function public.plant_yard_capture();
create trigger plant_yard_batch after insert on public.assetcare_batches for each row execute function public.plant_yard_capture();

-- One compact row per authorised tracker. Unknown readings never erase a known side.
-- All dates are observation times, never collection timestamps.
create function public.plant_yard_timeline(p_keys jsonb,p_to timestamptz)
returns table(provider text,pin text,first_at timestamptz,last_at timestamptz,readings bigint,changes jsonb)
language sql stable security invoker set search_path='' set statement_timeout='8s' as $$
 with keys as (select distinct x->>'provider' provider,x->>'pin' pin from jsonb_array_elements(p_keys) x),
 points as materialized (
 select p.* from public.plant_yard_positions p join keys k using(provider,pin) where p.observed_at<p_to
 ), seq as (
 select *,lag(side) over(partition by provider,pin order by observed_at) previous from points where side<>0
 ), transitions as (
 select provider,pin,jsonb_agg(jsonb_build_object('at',observed_at,'side',side) order by observed_at) changes from seq where previous is null or previous<>side group by provider,pin
 )
 select p.provider,p.pin,min(p.observed_at),max(p.observed_at),count(*),coalesce(t.changes,'[]'::jsonb)
 from points p left join transitions t using(provider,pin) group by p.provider,p.pin,t.changes
$$;
revoke all on function public.plant_yard_side(float8,float8),public.plant_yard_save(text,text,text,text,text),public.plant_yard_capture(),public.plant_yard_timeline(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.plant_yard_side(float8,float8),public.plant_yard_save(text,text,text,text,text),public.plant_yard_capture(),public.plant_yard_timeline(jsonb,timestamptz) to service_role;

-- Resumable, bounded historical replay. Does not create inbox or hire workflow events.
create function public.plant_yard_backfill(p_from timestamptz,p_to timestamptz,p_provider text)
returns integer language plpgsql security invoker set search_path='' set statement_timeout='25s' as $$
declare item jsonb; row_data jsonb; loc jsonb; rec record; n integer:=0;
begin
 if p_to<=p_from or p_to-p_from>interval '1 day' or p_provider not in ('manufacturer','assetcare') then raise exception 'Invalid replay window'; end if;
 if p_provider='manufacturer' then
 for rec in select provider,pin,payload from public.fleet_operation_samples where captured_at>=p_from and captured_at<p_to loop
 perform public.plant_yard_save(rec.provider,rec.pin,rec.payload->'position'->>'at',rec.payload->'position'->>'latitude',rec.payload->'position'->>'longitude');n:=n+1;
 end loop;
 else
 for item in select value from public.assetcare_batches b cross join lateral jsonb_array_elements(b.items) where b.received_at>=p_from and b.received_at<p_to loop
 row_data:=case when item->>'type'='event' then item->'details'->'telemetry' else item end;
 if row_data->>'type' not in ('telemetry','trip') or row_data->'owner'->>'id' is distinct from item->'owner'->>'id' then continue; end if;
 loc:=case when row_data->>'type'='trip' then row_data->'end' else row_data->'location' end;
 if row_data->>'type'='telemetry' and jsonb_typeof(loc->'age')='number' and (loc->>'age')::numeric>0 then continue; end if;
 perform public.plant_yard_save('assetcare',row_data->'asset'->>'id',case when row_data->>'type'='trip' then row_data->>'dateEnd' else row_data->>'date' end,loc->>'lat',loc->>'lon');n:=n+1;
 end loop;
 end if;
 return n;
end $$;
revoke all on function public.plant_yard_backfill(timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.plant_yard_backfill(timestamptz,timestamptz,text) to service_role;
