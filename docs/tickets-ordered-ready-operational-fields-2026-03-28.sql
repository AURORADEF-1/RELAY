alter table public.tickets
  add column if not exists expected_delivery_date date,
  add column if not exists lead_time_note text,
  add column if not exists ordered_at timestamptz,
  add column if not exists ordered_by text,
  add column if not exists purchase_order_number text,
  add column if not exists supplier_name text,
  add column if not exists supplier_email text,
  add column if not exists order_amount numeric(12,2),
  add column if not exists bin_location text,
  add column if not exists ready_at timestamptz,
  add column if not exists ready_by text,
  add column if not exists overdue_reminder_dismissed_at timestamptz,
  add column if not exists overdue_reminder_dismissed_by text;

create index if not exists tickets_status_expected_delivery_date_idx
on public.tickets (status, expected_delivery_date);

create index if not exists tickets_supplier_name_idx
on public.tickets (supplier_name);

create table if not exists public.supplier_monthly_spend_snapshots (
  id uuid primary key default gen_random_uuid(),
  month_start date not null,
  supplier_name text not null,
  supplier_name_normalized text not null,
  order_count integer not null default 0,
  total_spend numeric(12,2) not null default 0,
  generated_at timestamptz not null default now()
);

create unique index if not exists supplier_monthly_spend_snapshots_month_supplier_idx
on public.supplier_monthly_spend_snapshots (month_start, supplier_name_normalized);

create index if not exists supplier_monthly_spend_snapshots_month_idx
on public.supplier_monthly_spend_snapshots (month_start desc);
