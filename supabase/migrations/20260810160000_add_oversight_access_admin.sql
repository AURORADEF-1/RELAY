create or replace function public.set_oversight_access(target_email text, should_enable boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if not public.is_relay_admin(auth.uid()) then
    raise exception 'Admin access is required';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No RELAY account exists for that email address';
  end if;

  insert into public.oversight_access(user_id, enabled, created_by)
  values (target_user_id, should_enable, auth.uid())
  on conflict (user_id) do update
  set enabled = excluded.enabled,
      created_by = excluded.created_by;

  return target_user_id;
end;
$$;

revoke all on function public.set_oversight_access(text, boolean) from public, anon;
grant execute on function public.set_oversight_access(text, boolean) to authenticated;
