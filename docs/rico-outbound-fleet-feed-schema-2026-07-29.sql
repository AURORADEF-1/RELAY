create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.rico_fleet_feed_credentials (
  singleton boolean primary key default true check (singleton),
  token_hash text not null check (length(token_hash) = 64),
  updated_at timestamptz not null default now()
);

alter table private.rico_fleet_feed_credentials enable row level security;

create or replace function public.rico_fleet_feed_page(
  p_token text,
  p_limit integer default 200,
  p_offset integer default 0,
  p_updated_since timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_hash text;
  page_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  page_offset integer := greatest(coalesce(p_offset, 0), 0);
  response jsonb;
begin
  select credentials.token_hash
  into expected_hash
  from private.rico_fleet_feed_credentials as credentials
  where credentials.singleton = true;

  if
    expected_hash is null
    or p_token is null
    or encode(extensions.digest(p_token, 'sha256'), 'hex') <> expected_hash
  then
    raise insufficient_privilege using message = 'RICO fleet feed authentication failed';
  end if;

  with eligible as (
    select
      machines.id,
      machines.machine_number,
      machines.machine_number_normalized,
      machines.fleet_type,
      machines.item_description,
      machines.make,
      machines.model,
      machines.serial_number,
      machines.status,
      machines.engine,
      machines.engine_serial_number,
      machines.build_year,
      machines.serial_range,
      machines.lifecycle_status,
      machines.current_hours,
      machines.hours_reading_date,
      machines.service_interval_hours,
      machines.service_interval_months,
      machines.location,
      machines.notes,
      machines.created_at,
      machines.updated_at
    from public.machines
    where
      p_updated_since is null
      or machines.updated_at >= p_updated_since
  ),
  page as (
    select eligible.*
    from eligible
    order by eligible.updated_at asc nulls first, eligible.id asc
    limit page_limit
    offset page_offset
  )
  select jsonb_build_object(
    'total',
    (select count(*) from eligible),
    'serial_unknown',
    (
      select count(*)
      from public.machines
      where
        serial_number is null
        or upper(btrim(serial_number)) in (
          '',
          '-',
          '0',
          'N/A',
          'NA',
          'NONE',
          'NOT KNOWN',
          'TBC',
          'UNKNOWN'
        )
    ),
    'rows',
    coalesce(
      (
        select jsonb_agg(to_jsonb(page) order by page.updated_at asc nulls first, page.id asc)
        from page
      ),
      '[]'::jsonb
    )
  )
  into response;

  return response;
end;
$$;

revoke all on function public.rico_fleet_feed_page(text, integer, integer, timestamptz)
from public, authenticated;

grant execute on function public.rico_fleet_feed_page(text, integer, integer, timestamptz)
to anon;
