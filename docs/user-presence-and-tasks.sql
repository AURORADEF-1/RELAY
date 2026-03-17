create table if not exists public.user_presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index if not exists user_presence_last_seen_at_idx
on public.user_presence (last_seen_at desc);

create table if not exists public.user_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'DONE')),
  assigned_to uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_tasks_assigned_to_status_idx
on public.user_tasks (assigned_to, status, created_at desc);

alter table public.user_presence enable row level security;
alter table public.user_tasks enable row level security;

drop policy if exists "user presence authenticated read" on public.user_presence;
create policy "user presence authenticated read"
on public.user_presence
for select
to authenticated
using (true);

drop policy if exists "user presence self upsert" on public.user_presence;
create policy "user presence self upsert"
on public.user_presence
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user presence self update" on public.user_presence;
create policy "user presence self update"
on public.user_presence
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user tasks assignee read" on public.user_tasks;
create policy "user tasks assignee read"
on public.user_tasks
for select
to authenticated
using (
  auth.uid() = assigned_to
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists "user tasks admin insert" on public.user_tasks;
create policy "user tasks admin insert"
on public.user_tasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists "user tasks assignee update" on public.user_tasks;
create policy "user tasks assignee update"
on public.user_tasks
for update
to authenticated
using (
  auth.uid() = assigned_to
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  auth.uid() = assigned_to
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);
