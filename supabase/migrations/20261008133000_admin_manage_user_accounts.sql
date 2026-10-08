create or replace function public.admin_update_user_account(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_role text,
  p_interface_mode text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_relay_admin() then raise exception 'Administrator access is required'; end if;
  if p_role not in ('admin','requester','customer','user') then raise exception 'Invalid account role'; end if;
  if p_interface_mode not in ('standard','front_counter') then raise exception 'Invalid interface mode'; end if;
  if p_role <> 'admin'
    and exists (select 1 from public.profiles where id = p_user_id and role = 'admin')
    and (select count(*) from public.profiles where role = 'admin') <= 1
  then raise exception 'The final administrator cannot be demoted'; end if;
  update public.profiles set
    full_name = nullif(btrim(p_full_name), ''),
    email = nullif(lower(btrim(p_email)), ''),
    role = p_role,
    interface_mode = p_interface_mode
  where id = p_user_id;
  if not found then raise exception 'User account not found'; end if;
end;
$$;
revoke all on function public.admin_update_user_account(uuid,text,text,text,text) from public, anon;
grant execute on function public.admin_update_user_account(uuid,text,text,text,text) to authenticated;
