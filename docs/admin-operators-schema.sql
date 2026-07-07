create table if not exists public.admin_operators (
  name text primary key,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.admin_operators enable row level security;

drop policy if exists "admin operators authenticated read" on public.admin_operators;
create policy "admin operators authenticated read"
on public.admin_operators
for select
to authenticated
using (true);

drop policy if exists "admin operators admin insert" on public.admin_operators;
create policy "admin operators admin insert"
on public.admin_operators
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) = 'admin'
        or lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@mlp.local'
        or split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1) like '%.admin'
      )
  )
);

drop policy if exists "admin operators admin delete" on public.admin_operators;
create policy "admin operators admin delete"
on public.admin_operators
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) = 'admin'
        or lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@mlp.local'
        or split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1) like '%.admin'
      )
  )
);

insert into public.admin_operators (name, sort_order)
values
  ('Scott', 1),
  ('Tom', 2),
  ('George', 3),
  ('Samantha', 4)
on conflict (name) do nothing;
