create table if not exists public.session_controls (
  user_id uuid primary key references auth.users (id) on delete cascade,
  forced_logout_after timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.session_controls enable row level security;

drop policy if exists "session controls self read" on public.session_controls;
create policy "session controls self read"
on public.session_controls
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "session controls admin read" on public.session_controls;
create policy "session controls admin read"
on public.session_controls
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

drop policy if exists "session controls admin write" on public.session_controls;
create policy "session controls admin write"
on public.session_controls
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

drop policy if exists "session controls admin update" on public.session_controls;
create policy "session controls admin update"
on public.session_controls
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);

create index if not exists session_controls_forced_logout_after_idx
on public.session_controls (forced_logout_after desc);
