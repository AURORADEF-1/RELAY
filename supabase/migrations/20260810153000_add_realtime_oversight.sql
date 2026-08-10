create table if not exists public.oversight_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.oversight_access enable row level security;

create or replace function public.is_relay_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = check_user_id and role = 'admin'
  );
$$;

create or replace function public.has_oversight_aal2(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (
      select 1 from public.oversight_access
      where user_id = check_user_id and enabled
    );
$$;

revoke all on function public.is_relay_admin(uuid) from public;
revoke all on function public.has_oversight_aal2(uuid) from public;
grant execute on function public.is_relay_admin(uuid) to authenticated;
grant execute on function public.has_oversight_aal2(uuid) to authenticated;

drop policy if exists "oversight access self or admin read" on public.oversight_access;
create policy "oversight access self or admin read"
on public.oversight_access for select to authenticated
using (user_id = (select auth.uid()) or public.is_relay_admin());

drop policy if exists "oversight access admin insert" on public.oversight_access;
create policy "oversight access admin insert"
on public.oversight_access for insert to authenticated
with check (public.is_relay_admin());

drop policy if exists "oversight access admin update" on public.oversight_access;
create policy "oversight access admin update"
on public.oversight_access for update to authenticated
using (public.is_relay_admin()) with check (public.is_relay_admin());

drop policy if exists "oversight access admin delete" on public.oversight_access;
create policy "oversight access admin delete"
on public.oversight_access for delete to authenticated
using (public.is_relay_admin());

alter table public.user_presence
  add column if not exists session_id text,
  add column if not exists session_started_at timestamptz,
  add column if not exists route_path text,
  add column if not exists current_ticket_id uuid references public.tickets(id) on delete set null,
  add column if not exists page_opened_at timestamptz;

create index if not exists user_presence_session_id_idx on public.user_presence(session_id);
create index if not exists user_presence_current_ticket_id_idx on public.user_presence(current_ticket_id);

drop policy if exists "user presence authenticated read" on public.user_presence;
drop policy if exists "user presence protected read" on public.user_presence;
create policy "user presence protected read"
on public.user_presence for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_relay_admin()
  or public.has_oversight_aal2()
);

create table if not exists public.oversight_activity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text,
  event_type text not null check (event_type in ('ticket_closed', 'order_placed')),
  ticket_id uuid references public.tickets(id) on delete set null,
  ticket_job_number text,
  amount numeric(12,2),
  occurred_at timestamptz not null default now()
);

create index if not exists oversight_events_user_time_idx
  on public.oversight_activity_events(user_id, occurred_at desc);
create index if not exists oversight_events_session_idx
  on public.oversight_activity_events(session_id, occurred_at desc);

alter table public.oversight_activity_events enable row level security;

drop policy if exists "oversight events protected read" on public.oversight_activity_events;
create policy "oversight events protected read"
on public.oversight_activity_events for select to authenticated
using (public.has_oversight_aal2());

drop policy if exists "tickets oversight read" on public.tickets;
create policy "tickets oversight read"
on public.tickets for select to authenticated
using (public.has_oversight_aal2());

create or replace function public.capture_ticket_oversight_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  active_session text;
begin
  if actor_id is null then
    return new;
  end if;

  select session_id into active_session
  from public.user_presence where user_id = actor_id;

  if old.status is distinct from new.status and new.status = 'COMPLETED' then
    insert into public.oversight_activity_events
      (user_id, session_id, event_type, ticket_id, ticket_job_number, occurred_at)
    values
      (actor_id, active_session, 'ticket_closed', new.id, new.job_number, now());
  end if;

  if old.status is distinct from new.status and new.status = 'ORDERED' then
    insert into public.oversight_activity_events
      (user_id, session_id, event_type, ticket_id, ticket_job_number, amount, occurred_at)
    values
      (actor_id, active_session, 'order_placed', new.id, new.job_number, new.order_amount, now());
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_capture_oversight_activity on public.tickets;
create trigger tickets_capture_oversight_activity
after update on public.tickets
for each row execute function public.capture_ticket_oversight_activity();

revoke all on function public.capture_ticket_oversight_activity() from public, anon, authenticated;

create or replace function public.capture_purchase_order_oversight_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := coalesce(new.created_by, auth.uid());
  active_session text;
  job_number text;
begin
  if actor_id is null or new.po_status = 'DRAFT' then
    return new;
  end if;

  select session_id into active_session
  from public.user_presence where user_id = actor_id;
  select t.job_number into job_number
  from public.tickets t where t.id = new.ticket_id;

  insert into public.oversight_activity_events
    (user_id, session_id, event_type, ticket_id, ticket_job_number, amount, occurred_at)
  values
    (actor_id, active_session, 'order_placed', new.ticket_id, job_number, new.order_amount, now());
  return new;
end;
$$;

drop trigger if exists purchase_orders_capture_oversight_activity on public.ticket_purchase_orders;
create trigger purchase_orders_capture_oversight_activity
after insert on public.ticket_purchase_orders
for each row execute function public.capture_purchase_order_oversight_activity();

revoke all on function public.capture_purchase_order_oversight_activity() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_presence'
  ) then
    alter publication supabase_realtime add table public.user_presence;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'oversight_activity_events'
  ) then
    alter publication supabase_realtime add table public.oversight_activity_events;
  end if;
end $$;
