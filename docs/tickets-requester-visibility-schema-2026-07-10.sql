alter table public.tickets
  add column if not exists visible_to_user_id uuid;

create index if not exists tickets_visible_to_user_id_idx
on public.tickets (visible_to_user_id);

alter table public.tickets enable row level security;

drop policy if exists "tickets requester read" on public.tickets;
create policy "tickets requester read"
on public.tickets
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
  or user_id = (select auth.uid())
  or visible_to_user_id = (select auth.uid())
);

drop policy if exists "tickets requester update" on public.tickets;
create policy "tickets requester update"
on public.tickets
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
