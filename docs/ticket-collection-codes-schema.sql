create table if not exists public.ticket_collection_codes (
  ticket_id uuid primary key references public.tickets(id) on delete cascade,
  requester_user_id uuid not null,
  requester_name text,
  collection_code text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at timestamptz,
  used_by uuid,
  used_method text,
  constraint ticket_collection_code_format check (
    collection_code is null or collection_code ~ '^[A-Z0-9]{6}$'
  ),
  constraint ticket_collection_method check (
    used_method is null or used_method in ('qr', 'code', 'manual')
  )
);

alter table public.ticket_collection_codes enable row level security;

revoke all on public.ticket_collection_codes from anon;
revoke insert, update, delete on public.ticket_collection_codes from authenticated;
grant select on public.ticket_collection_codes to authenticated;

drop policy if exists "collection codes ticket parties read" on public.ticket_collection_codes;
create policy "collection codes ticket parties read"
on public.ticket_collection_codes
for select
to authenticated
using (
  requester_user_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

create or replace function public.issue_ticket_collection_code(
  p_ticket_id uuid,
  p_collection_code text
)
returns table (collection_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_requester_name text;
  v_code text := upper(trim(p_collection_code));
  v_expires_at timestamptz := now() + interval '24 hours';
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if v_code !~ '^[A-Z0-9]{6}$' then
    raise exception 'Collection code must contain six letters or numbers.';
  end if;

  select t.requester_name
  into v_requester_name
  from public.tickets t
  where t.id = p_ticket_id
    and t.status = 'READY'
    and (t.user_id = v_user_id or t.visible_to_user_id = v_user_id);

  if not found then
    raise exception 'A collection code can only be issued for your own READY ticket.';
  end if;

  insert into public.ticket_collection_codes (
    ticket_id,
    requester_user_id,
    requester_name,
    collection_code,
    created_at,
    expires_at,
    used_at,
    used_by,
    used_method
  ) values (
    p_ticket_id,
    v_user_id,
    v_requester_name,
    v_code,
    now(),
    v_expires_at,
    null,
    null,
    null
  )
  on conflict (ticket_id) do update set
    requester_user_id = excluded.requester_user_id,
    requester_name = excluded.requester_name,
    collection_code = excluded.collection_code,
    created_at = excluded.created_at,
    expires_at = excluded.expires_at,
    used_at = null,
    used_by = null,
    used_method = null;

  return query select v_code, v_expires_at;
end;
$$;

create or replace function public.confirm_ticket_collection(
  p_ticket_id uuid,
  p_collection_code text,
  p_method text default 'code'
)
returns table (
  collected_at timestamptz,
  requester_name text,
  confirmed_by text,
  method text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_name text;
  v_requester_name text;
  v_collected_at timestamptz := now();
  v_method text := lower(trim(p_method));
begin
  select coalesce(nullif(trim(p.full_name), ''), v_admin_id::text)
  into v_admin_name
  from public.profiles p
  where p.id = v_admin_id and p.role = 'admin';

  if not found then
    raise exception 'Admin access is required.';
  end if;

  if v_method not in ('qr', 'code') then
    raise exception 'Invalid collection confirmation method.';
  end if;

  update public.ticket_collection_codes c
  set used_at = v_collected_at,
      used_by = v_admin_id,
      used_method = v_method
  from public.tickets t
  where c.ticket_id = p_ticket_id
    and t.id = c.ticket_id
    and t.status = 'READY'
    and c.used_at is null
    and c.expires_at > now()
    and c.collection_code = upper(trim(p_collection_code))
  returning c.requester_name into v_requester_name;

  if not found then
    raise exception 'The collection code is invalid, expired, already used, or the ticket is no longer READY.';
  end if;

  insert into public.ticket_updates (ticket_id, status, comment)
  values (
    p_ticket_id,
    'READY',
    format(
      'Part collected by requester. Confirmed by %s using %s at %s for %s.',
      v_admin_name,
      upper(v_method),
      to_char(v_collected_at at time zone 'Europe/London', 'DD Mon YYYY HH24:MI'),
      coalesce(v_requester_name, 'requester')
    )
  );

  return query select v_collected_at, v_requester_name, v_admin_name, v_method;
end;
$$;

create or replace function public.confirm_own_ticket_collection_manually(p_ticket_id uuid)
returns table (collected_at timestamptz, requester_name text, method text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_requester_name text;
  v_collected_at timestamptz := now();
begin
  select t.requester_name
  into v_requester_name
  from public.tickets t
  where t.id = p_ticket_id
    and t.status = 'READY'
    and (t.user_id = v_user_id or t.visible_to_user_id = v_user_id);

  if not found then
    raise exception 'Manual collection can only be confirmed for your own READY ticket.';
  end if;

  insert into public.ticket_collection_codes (
    ticket_id,
    requester_user_id,
    requester_name,
    collection_code,
    created_at,
    expires_at,
    used_at,
    used_by,
    used_method
  ) values (
    p_ticket_id,
    v_user_id,
    v_requester_name,
    null,
    v_collected_at,
    null,
    v_collected_at,
    v_user_id,
    'manual'
  )
  on conflict (ticket_id) do update set
    requester_user_id = excluded.requester_user_id,
    requester_name = excluded.requester_name,
    collection_code = null,
    used_at = excluded.used_at,
    used_by = excluded.used_by,
    used_method = excluded.used_method;

  insert into public.ticket_updates (ticket_id, status, comment)
  values (
    p_ticket_id,
    'READY',
    format(
      'Part collected by requester. Confirmed manually at %s for %s.',
      to_char(v_collected_at at time zone 'Europe/London', 'DD Mon YYYY HH24:MI'),
      coalesce(v_requester_name, 'requester')
    )
  );

  return query select v_collected_at, v_requester_name, 'manual'::text;
end;
$$;

revoke all on function public.issue_ticket_collection_code(uuid, text) from public;
revoke all on function public.confirm_ticket_collection(uuid, text, text) from public;
revoke all on function public.confirm_own_ticket_collection_manually(uuid) from public;
revoke all on function public.issue_ticket_collection_code(uuid, text) from anon;
revoke all on function public.confirm_ticket_collection(uuid, text, text) from anon;
revoke all on function public.confirm_own_ticket_collection_manually(uuid) from anon;
grant execute on function public.issue_ticket_collection_code(uuid, text) to authenticated;
grant execute on function public.confirm_ticket_collection(uuid, text, text) to authenticated;
grant execute on function public.confirm_own_ticket_collection_manually(uuid) to authenticated;
