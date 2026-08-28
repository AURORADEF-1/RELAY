create table if not exists public.ticket_chat_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, ticket_id)
);

alter table public.ticket_chat_reads enable row level security;

grant select, insert, update on public.ticket_chat_reads to authenticated;

drop policy if exists "ticket chat reads self select" on public.ticket_chat_reads;
create policy "ticket chat reads self select"
on public.ticket_chat_reads
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "ticket chat reads self insert" on public.ticket_chat_reads;
create policy "ticket chat reads self insert"
on public.ticket_chat_reads
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "ticket chat reads self update" on public.ticket_chat_reads;
create policy "ticket chat reads self update"
on public.ticket_chat_reads
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists ticket_chat_reads_ticket_id_idx
on public.ticket_chat_reads (ticket_id, last_read_at desc);

create or replace function public.relay_chat_operator_key(value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when lower(trim(coalesce(value, ''))) = 'samanthac.admin' then 'samantha'
    when lower(trim(coalesce(value, ''))) ~ '^george(\s|$)' then 'george'
    when lower(trim(coalesce(value, ''))) ~ '^samantha(\s|$)' then 'samantha'
    when lower(trim(coalesce(value, ''))) ~ '^scott(\s|$)' then 'scott'
    when lower(trim(coalesce(value, ''))) ~ '^tom(\s|$)' then 'tom'
    else lower(regexp_replace(trim(coalesce(value, '')), '\s+', ' ', 'g'))
  end;
$$;

create or replace function public.can_access_ticket_chat(target_ticket_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.tickets ticket
    left join public.profiles profile
      on profile.id = (select auth.uid())
    where ticket.id = target_ticket_id
      and (
        ticket.user_id = (select auth.uid())
        or ticket.visible_to_user_id = (select auth.uid())
        or (
          profile.role = 'admin'
          and (
            nullif(trim(ticket.assigned_to), '') is null
            or public.relay_chat_operator_key(ticket.assigned_to)
              = public.relay_chat_operator_key(profile.full_name)
            or exists (
              select 1
              from public.oversight_access access
              where access.user_id = (select auth.uid())
                and access.enabled = true
            )
          )
        )
      )
  );
$$;

revoke all on function public.relay_chat_operator_key(text) from public, anon;
revoke all on function public.can_access_ticket_chat(uuid) from public, anon;
grant execute on function public.relay_chat_operator_key(text) to authenticated;
grant execute on function public.can_access_ticket_chat(uuid) to authenticated;

drop policy if exists "authenticated can view ticket messages" on public.ticket_messages;
create policy "ticket chat participants can view messages"
on public.ticket_messages
for select
to authenticated
using (public.can_access_ticket_chat(ticket_id));

drop policy if exists "authenticated can insert ticket messages" on public.ticket_messages;
create policy "ticket chat participants can insert messages"
on public.ticket_messages
for insert
to authenticated
with check (
  sender_user_id = (select auth.uid())
  and public.can_access_ticket_chat(ticket_id)
);

drop policy if exists "authenticated can view ticket attachments" on public.ticket_attachments;
create policy "ticket chat participants can view attachments"
on public.ticket_attachments
for select
to authenticated
using (
  (
    attachment_context = 'chat'
    and public.can_access_ticket_chat(ticket_id)
  )
  or (
    coalesce(attachment_context, 'ticket') <> 'chat'
    and exists (
      select 1
      from public.tickets ticket
      where ticket.id = ticket_attachments.ticket_id
        and (
          ticket.user_id = (select auth.uid())
          or exists (
            select 1
            from public.profiles profile
            where profile.id = (select auth.uid())
              and profile.role = 'admin'
          )
        )
    )
  )
);

drop policy if exists "authenticated can insert ticket attachments" on public.ticket_attachments;
create policy "ticket chat participants can insert attachments"
on public.ticket_attachments
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (
    (
      attachment_context = 'chat'
      and public.can_access_ticket_chat(ticket_id)
    )
    or (
      coalesce(attachment_context, 'ticket') <> 'chat'
      and exists (
        select 1
        from public.tickets ticket
        where ticket.id = ticket_attachments.ticket_id
          and (
            ticket.user_id = (select auth.uid())
            or exists (
              select 1
              from public.profiles profile
              where profile.id = (select auth.uid())
                and profile.role = 'admin'
            )
          )
      )
    )
  )
);

drop policy if exists "ticket attachment owners can update attachments" on public.ticket_attachments;
create policy "ticket attachment owners can update attachments"
on public.ticket_attachments
for update
to authenticated
using (
  uploaded_by = (select auth.uid())
  and (
    coalesce(attachment_context, 'ticket') <> 'chat'
    or public.can_access_ticket_chat(ticket_id)
  )
)
with check (
  uploaded_by = (select auth.uid())
  and (
    coalesce(attachment_context, 'ticket') <> 'chat'
    or public.can_access_ticket_chat(ticket_id)
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ticket_messages'
  ) then
    alter publication supabase_realtime add table public.ticket_messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ticket_attachments'
  ) then
    alter publication supabase_realtime add table public.ticket_attachments;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ticket_chat_reads'
  ) then
    alter publication supabase_realtime add table public.ticket_chat_reads;
  end if;
end
$$;
