alter table public.tickets
  add column if not exists is_urgent boolean not null default false,
  add column if not exists urgent_flagged_at timestamptz,
  add column if not exists urgent_flagged_by text,
  add column if not exists urgent_reminder_dismissed_at timestamptz,
  add column if not exists urgent_reminder_dismissed_by text;

create index if not exists tickets_is_urgent_idx
on public.tickets (is_urgent, status, urgent_flagged_at desc);

create index if not exists tickets_urgent_assigned_idx
on public.tickets (assigned_to, is_urgent, urgent_reminder_dismissed_at);
