alter table public.profiles
  add column if not exists email text;

create unique index if not exists profiles_email_unique
  on public.profiles (lower(email))
  where email is not null;

comment on column public.profiles.email is
  'Optional contact email maintained by administrators. It does not change the Supabase login identity.';

create or replace function public.is_relay_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where profiles.id = check_user_id and profiles.role = 'admin'
  );
$$;

revoke all on function public.is_relay_admin(uuid) from public, anon;
grant execute on function public.is_relay_admin(uuid) to authenticated;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('SUP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  subject text not null check (char_length(subject) between 3 and 120),
  description text not null check (char_length(description) between 10 and 4000),
  requester_name text not null check (char_length(requester_name) between 2 and 120),
  requester_email text check (requester_email is null or char_length(requester_email) <= 254),
  requester_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index if not exists support_tickets_status_created_idx
  on public.support_tickets (status, created_at desc);

alter table public.support_tickets enable row level security;

drop policy if exists "signed in users can view support tickets" on public.support_tickets;
create policy "signed in users can view support tickets"
  on public.support_tickets for select to authenticated
  using (true);

drop policy if exists "admins can update support tickets" on public.support_tickets;
create policy "admins can update support tickets"
  on public.support_tickets for update to authenticated
  using (public.is_relay_admin())
  with check (public.is_relay_admin());

grant select on table public.support_tickets to authenticated;
grant update (status, updated_at, resolved_at, resolved_by) on table public.support_tickets to authenticated;

alter table public.profiles enable row level security;

drop policy if exists "admins can update profile contact emails" on public.profiles;
create policy "admins can update profile contact emails"
  on public.profiles for update to authenticated
  using (public.is_relay_admin())
  with check (public.is_relay_admin());

grant update (email) on table public.profiles to authenticated;
