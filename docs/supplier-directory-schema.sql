create table if not exists public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  supplier_name_normalized text not null unique,
  contact_email text,
  contact_phone text,
  whatsapp_number text,
  preferred_contact_method text default 'manual' check (
    preferred_contact_method in ('email', 'phone', 'whatsapp', 'manual')
  ),
  workflow_stage text not null default 'draft' check (
    workflow_stage in ('draft', 'ready', 'emailed', 'whatsapp_sent', 'follow_up')
  ),
  notes text,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplier_contacts_supplier_name_normalized_idx
on public.supplier_contacts (supplier_name_normalized);

create index if not exists supplier_contacts_supplier_name_idx
on public.supplier_contacts (supplier_name);
