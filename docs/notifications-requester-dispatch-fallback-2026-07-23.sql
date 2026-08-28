-- Allow the authenticated notification dispatch route to notify admins when
-- SUPABASE_SERVICE_ROLE_KEY is not configured. Requesters remain limited to
-- approved event types for tickets they own or can access.

alter table public.notifications enable row level security;

create index if not exists notifications_ticket_id_idx
on public.notifications (ticket_id);

drop policy if exists "notifications self or admin insert"
on public.notifications;

create policy "notifications self admin or ticket admin insert"
on public.notifications
for insert
to authenticated
with check (
  notifications.user_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.role = 'admin'
  )
  or (
    notifications.type in (
      'new_ticket',
      'requester_message',
      'part_collected',
      'part_returned'
    )
    and notifications.ticket_id is not null
    and exists (
      select 1
      from public.profiles recipient
      where recipient.id = notifications.user_id
        and recipient.role = 'admin'
    )
    and exists (
      select 1
      from public.tickets ticket
      where ticket.id = notifications.ticket_id
        and (
          (
            notifications.type = 'new_ticket'
            and ticket.user_id = (select auth.uid())
          )
          or (
            notifications.type in (
              'requester_message',
              'part_collected',
              'part_returned'
            )
            and (
              ticket.user_id = (select auth.uid())
              or ticket.visible_to_user_id = (select auth.uid())
            )
          )
        )
    )
  )
);
