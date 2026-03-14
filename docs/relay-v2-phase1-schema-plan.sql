-- RELAY v2 schema plan
-- Phase 1 planning file only. This is not applied automatically.
-- Phase 2 should implement the migrations after column names are confirmed.

-- Roles / profile assumptions
-- A lightweight role model is needed so requesters only see their own records,
-- while parts/admin operators can access all chats and attachments.
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'requester' check (role in ('requester', 'parts', 'admin')),
  created_at timestamptz not null default now()
);

-- Ticket attachments uploaded from the submit form or from ticket chat.
create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null references public.tickets (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  file_name text not null,
  file_path text not null,
  file_url text,
  mime_type text,
  attachment_context text not null default 'ticket' check (attachment_context in ('ticket', 'chat')),
  message_id uuid references public.ticket_messages (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Ticket-linked live chat / support thread.
create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null references public.tickets (id) on delete cascade,
  sender_user_id uuid references auth.users (id) on delete set null,
  sender_role text not null check (sender_role in ('requester', 'parts', 'admin', 'ai')),
  message_text text,
  attachment_id uuid references public.ticket_attachments (id) on delete set null,
  attachment_url text,
  attachment_type text,
  is_ai_message boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ticket_messages_body_check check (
    coalesce(nullif(trim(message_text), ''), attachment_url) is not null
  )
);

-- Suggested storage buckets
-- 1. relay-ticket-media
--    Use for ticket submission photos and chat images.
--    Recommended path layout:
--    tickets/<ticket-id>/submit/<filename>
--    tickets/<ticket-id>/chat/<message-id>-<filename>

-- Suggested indexes
create index if not exists ticket_attachments_ticket_id_idx
  on public.ticket_attachments (ticket_id, created_at desc);

create index if not exists ticket_messages_ticket_id_idx
  on public.ticket_messages (ticket_id, created_at asc);

-- Suggested RLS policy direction
-- tickets:
--   requesters can select their own tickets via tickets.user_id = auth.uid()
--   parts/admin can select/update all tickets via role in user_profiles
--
-- ticket_attachments:
--   requesters can select attachments for their own tickets
--   requesters can insert attachments linked to their own tickets
--   parts/admin can select/insert/update all ticket attachments
--
-- ticket_messages:
--   requesters can select/insert messages only for their own tickets
--   parts/admin can select/insert/update all messages
--   AI messages should be inserted by a trusted server-side path only
--
-- Helper predicate idea for policies:
-- exists (
--   select 1
--   from public.tickets
--   where tickets.id = ticket_messages.ticket_id
--     and tickets.user_id = auth.uid()
-- )
--
-- Helper role predicate idea:
-- exists (
--   select 1
--   from public.user_profiles
--   where user_profiles.user_id = auth.uid()
--     and user_profiles.role in ('parts', 'admin')
-- )
