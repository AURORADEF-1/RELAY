create table if not exists private.front_counter_device_credentials (
  station_user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash bytea not null,
  rotated_at timestamptz not null default now()
);

alter table private.front_counter_device_credentials enable row level security;

revoke all on table private.front_counter_device_credentials
  from public, anon, authenticated;

create or replace function private.front_counter_device_user(p_device_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select credential.station_user_id
  from private.front_counter_device_credentials credential
  where credential.token_hash = extensions.digest(
    convert_to(coalesce(p_device_token, ''), 'utf8'),
    'sha256'
  )
  limit 1;
$$;

revoke all on function private.front_counter_device_user(text)
  from public, anon, authenticated;

create or replace function public.front_counter_device_heartbeat(
  p_device_token text,
  p_hostname text,
  p_uptime_seconds bigint,
  p_agent_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  station_user_id uuid := private.front_counter_device_user(p_device_token);
begin
  if station_user_id is null then
    raise exception 'Invalid Front Counter device credential.';
  end if;

  update public.label_print_stations station
  set device_last_seen_at = now(),
      device_hostname = left(nullif(btrim(p_hostname), ''), 120),
      device_uptime_seconds = greatest(coalesce(p_uptime_seconds, 0), 0),
      device_agent_version = left(nullif(btrim(p_agent_version), ''), 80),
      updated_at = now()
  where station.user_id = station_user_id;
end;
$$;

drop function if exists public.front_counter_device_heartbeat(text, bigint, text);
revoke all on function public.front_counter_device_heartbeat(text, text, bigint, text)
  from public;
grant execute on function public.front_counter_device_heartbeat(text, text, bigint, text)
  to anon, authenticated;

create or replace function public.claim_front_counter_device_command(p_device_token text)
returns table (
  command text,
  command_requested_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  station_user_id uuid := private.front_counter_device_user(p_device_token);
begin
  if station_user_id is null then
    raise exception 'Invalid Front Counter device credential.';
  end if;

  return query
  update public.label_print_stations station
  set device_command_status = 'running',
      updated_at = now()
  where station.user_id = station_user_id
    and station.device_command_status = 'pending'
    and station.device_command_requested_at > now() - interval '2 minutes'
  returning station.device_command, station.device_command_requested_at;
end;
$$;

drop function if exists public.claim_front_counter_device_command();
revoke all on function public.claim_front_counter_device_command(text)
  from public;
grant execute on function public.claim_front_counter_device_command(text)
  to anon, authenticated;

create or replace function public.complete_front_counter_device_command(
  p_device_token text,
  p_command text,
  p_succeeded boolean,
  p_result text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  station_user_id uuid := private.front_counter_device_user(p_device_token);
begin
  if station_user_id is null then
    raise exception 'Invalid Front Counter device credential.';
  end if;

  update public.label_print_stations station
  set device_command_status = case when p_succeeded then 'succeeded' else 'failed' end,
      device_command_completed_at = now(),
      device_command_result = left(coalesce(nullif(btrim(p_result), ''), 'No result supplied.'), 500),
      updated_at = now()
  where station.user_id = station_user_id
    and station.device_command = lower(btrim(coalesce(p_command, '')))
    and station.device_command_status = 'running';
end;
$$;

drop function if exists public.complete_front_counter_device_command(text, boolean, text);
revoke all on function public.complete_front_counter_device_command(text, text, boolean, text)
  from public;
grant execute on function public.complete_front_counter_device_command(text, text, boolean, text)
  to anon, authenticated;

comment on table private.front_counter_device_credentials is
  'Root-only device credentials for the outbound Front Counter agent. Only SHA-256 token digests are stored.';
