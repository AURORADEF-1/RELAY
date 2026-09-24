-- Separate LiveLink permissions: ordinary requester/customer access is insufficient.
create table public.jcb_livelink_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.jcb_livelink_mappings (
  pin text primary key check (length(pin) between 1 and 100),
  machine_id uuid not null unique references public.machines(id) on delete cascade,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.jcb_livelink_access enable row level security;
alter table public.jcb_livelink_mappings enable row level security;
revoke all on public.jcb_livelink_access, public.jcb_livelink_mappings from anon, authenticated;
grant select, insert, update, delete on public.jcb_livelink_access, public.jcb_livelink_mappings to authenticated;
grant all on public.jcb_livelink_access, public.jcb_livelink_mappings to service_role;
create policy "LiveLink own access or admin read" on public.jcb_livelink_access for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
create policy "LiveLink admin access insert" on public.jcb_livelink_access for insert to authenticated
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
create policy "LiveLink admin access update" on public.jcb_livelink_access for update to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
create policy "LiveLink admin access delete" on public.jcb_livelink_access for delete to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
create policy "LiveLink authorised mapping read" on public.jcb_livelink_mappings for select to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
    or exists (select 1 from public.jcb_livelink_access where user_id = (select auth.uid()) and enabled));
create policy "LiveLink admin mapping insert" on public.jcb_livelink_mappings for insert to authenticated
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
create policy "LiveLink admin mapping update" on public.jcb_livelink_mappings for update to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
create policy "LiveLink admin mapping delete" on public.jcb_livelink_mappings for delete to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
