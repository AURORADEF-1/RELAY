create table public.oversight_page_activity (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  route_path text not null,
  ticket_id uuid references public.tickets(id) on delete set null,
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint oversight_page_activity_route_length check (char_length(route_path) between 1 and 300)
);

create index oversight_page_activity_user_started_idx
  on public.oversight_page_activity(user_id, started_at desc);
create index oversight_page_activity_started_idx
  on public.oversight_page_activity(started_at desc);
create index oversight_page_activity_ticket_idx
  on public.oversight_page_activity(ticket_id) where ticket_id is not null;

alter table public.oversight_page_activity enable row level security;

create policy "page activity protected read"
on public.oversight_page_activity for select to authenticated
using (user_id = (select auth.uid()) or public.has_oversight_aal2());

create policy "page activity self insert"
on public.oversight_page_activity for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "page activity self update"
on public.oversight_page_activity for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on public.oversight_page_activity from anon;
grant select, insert, update on public.oversight_page_activity to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'oversight_page_activity'
  ) then
    alter publication supabase_realtime add table public.oversight_page_activity;
  end if;
end $$;
