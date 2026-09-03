alter table public.label_print_stations
  add column if not exists device_last_seen_at timestamptz,
  add column if not exists device_hostname text,
  add column if not exists device_uptime_seconds bigint,
  add column if not exists device_agent_version text,
  add column if not exists device_command text
    check (device_command in ('refresh_session', 'reboot', 'shutdown')),
  add column if not exists device_command_status text
    check (device_command_status in ('pending', 'running', 'succeeded', 'failed')),
  add column if not exists device_command_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists device_command_requested_at timestamptz,
  add column if not exists device_command_completed_at timestamptz,
  add column if not exists device_command_result text;

create index if not exists label_print_stations_pending_device_command_idx
  on public.label_print_stations (device_command_status, device_command_requested_at)
  where device_command_status in ('pending', 'running');

create or replace function public.get_front_counter_device_status()
returns table (
  station_name text,
  device_online boolean,
  device_last_seen_at timestamptz,
  device_hostname text,
  device_uptime_seconds bigint,
  device_agent_version text,
  printer_online boolean,
  printer_name text,
  printer_last_seen_at timestamptz,
  printer_last_error text,
  command text,
  command_status text,
  command_requested_at timestamptz,
  command_completed_at timestamptz,
  command_result text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role = 'admin'
  ) then
    raise exception 'Admin access is required.';
  end if;

  return query
  select
    station.station_name,
    station.device_last_seen_at > now() - interval '30 seconds',
    station.device_last_seen_at,
    station.device_hostname,
    station.device_uptime_seconds,
    station.device_agent_version,
    station.last_seen_at > now() - interval '90 seconds'
      and station.last_error is null,
    station.printer_name,
    station.last_seen_at,
    station.last_error,
    station.device_command,
    station.device_command_status,
    station.device_command_requested_at,
    station.device_command_completed_at,
    station.device_command_result
  from public.label_print_stations station
  join auth.users users on users.id = station.user_id
  where lower(users.email) = 'frontcounter.user@mlp.local'
  limit 1;
end;
$$;

revoke all on function public.get_front_counter_device_status()
  from public, anon;
grant execute on function public.get_front_counter_device_status()
  to authenticated;

create or replace function public.request_front_counter_device_command(p_command text)
returns table (
  command text,
  command_status text,
  command_requested_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_command text := lower(btrim(coalesce(p_command, '')));
  target_user_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role = 'admin'
  ) then
    raise exception 'Admin access is required.';
  end if;

  if normalized_command not in ('refresh_session', 'reboot', 'shutdown') then
    raise exception 'Unsupported Front Counter command.';
  end if;

  select users.id
  into target_user_id
  from auth.users users
  where lower(users.email) = 'frontcounter.user@mlp.local'
  limit 1;

  if target_user_id is null then
    raise exception 'The Front Counter station is not configured.';
  end if;

  if exists (
    select 1
    from public.label_print_stations station
    where station.user_id = target_user_id
      and station.device_command_status in ('pending', 'running')
      and station.device_command_requested_at > now() - interval '2 minutes'
  ) then
    raise exception 'A Front Counter command is already in progress.';
  end if;

  return query
  update public.label_print_stations station
  set device_command = normalized_command,
      device_command_status = 'pending',
      device_command_requested_by = auth.uid(),
      device_command_requested_at = now(),
      device_command_completed_at = null,
      device_command_result = null,
      updated_at = now()
  where station.user_id = target_user_id
  returning
    station.device_command,
    station.device_command_status,
    station.device_command_requested_at;
end;
$$;

revoke all on function public.request_front_counter_device_command(text)
  from public, anon;
grant execute on function public.request_front_counter_device_command(text)
  to authenticated;

create or replace function public.front_counter_device_heartbeat(
  p_hostname text,
  p_uptime_seconds bigint,
  p_agent_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_front_counter_user(auth.uid()) then
    raise exception 'Front counter access is required.';
  end if;

  update public.label_print_stations station
  set device_last_seen_at = now(),
      device_hostname = left(nullif(btrim(p_hostname), ''), 120),
      device_uptime_seconds = greatest(coalesce(p_uptime_seconds, 0), 0),
      device_agent_version = left(nullif(btrim(p_agent_version), ''), 80),
      updated_at = now()
  where station.user_id = auth.uid();
end;
$$;

revoke all on function public.front_counter_device_heartbeat(text, bigint, text)
  from public, anon;
grant execute on function public.front_counter_device_heartbeat(text, bigint, text)
  to authenticated;

create or replace function public.claim_front_counter_device_command()
returns table (
  command text,
  command_requested_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_front_counter_user(auth.uid()) then
    raise exception 'Front counter access is required.';
  end if;

  return query
  update public.label_print_stations station
  set device_command_status = 'running',
      updated_at = now()
  where station.user_id = auth.uid()
    and station.device_command_status = 'pending'
    and station.device_command_requested_at > now() - interval '2 minutes'
  returning station.device_command, station.device_command_requested_at;
end;
$$;

revoke all on function public.claim_front_counter_device_command()
  from public, anon;
grant execute on function public.claim_front_counter_device_command()
  to authenticated;

create or replace function public.complete_front_counter_device_command(
  p_command text,
  p_succeeded boolean,
  p_result text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_front_counter_user(auth.uid()) then
    raise exception 'Front counter access is required.';
  end if;

  update public.label_print_stations station
  set device_command_status = case when p_succeeded then 'succeeded' else 'failed' end,
      device_command_completed_at = now(),
      device_command_result = left(coalesce(nullif(btrim(p_result), ''), 'No result supplied.'), 500),
      updated_at = now()
  where station.user_id = auth.uid()
    and station.device_command = lower(btrim(coalesce(p_command, '')))
    and station.device_command_status = 'running';
end;
$$;

revoke all on function public.complete_front_counter_device_command(text, boolean, text)
  from public, anon;
grant execute on function public.complete_front_counter_device_command(text, boolean, text)
  to authenticated;

comment on function public.request_front_counter_device_command(text) is
  'Queues one allow-listed maintenance command for the outbound-only Front Counter device agent.';
comment on function public.front_counter_device_heartbeat(text, bigint, text) is
  'Records the dedicated device agent heartbeat separately from the CUPS browser heartbeat.';
