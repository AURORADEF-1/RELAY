-- Retail CRM schema plan for RELAY admin users.
-- Apply manually in Supabase SQL editor after reviewing names and RLS policies.

create table if not exists public.retail_leads (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  company_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  request_summary text not null,
  request_details text,
  source text default 'retail',
  pipeline_stage text not null default 'new' check (
    pipeline_stage in ('new', 'qualified', 'quoted', 'follow_up', 'negotiation', 'won', 'lost')
  ),
  lead_status text not null default 'new' check (
    lead_status in ('new', 'active', 'quoted', 'won', 'lost', 'closed')
  ),
  assigned_user_id uuid references public.profiles (id) on delete set null,
  estimated_value numeric(12,2),
  quote_value numeric(12,2),
  quote_reference text,
  quote_status text check (
    quote_status in ('draft', 'sent', 'accepted', 'expired', 'rejected')
  ),
  quote_valid_until date,
  quoted_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  sale_amount numeric(12,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.retail_quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.retail_leads (id) on delete cascade,
  quote_reference text,
  status text not null default 'draft' check (
    status in ('draft', 'sent', 'accepted', 'expired', 'rejected')
  ),
  total_value numeric(12,2),
  valid_until date,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.retail_sales (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.retail_leads (id) on delete set null,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  amount numeric(12,2) not null,
  closed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.retail_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.retail_leads (id) on delete cascade,
  activity_type text not null default 'note' check (
    activity_type in ('note', 'call', 'email', 'meeting', 'quote_sent', 'status_change')
  ),
  activity_text text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.retail_targets (
  month_key text primary key check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  target_amount numeric(12,2) not null default 30000,
  created_at timestamptz not null default now()
);

create index if not exists retail_leads_assigned_user_idx
  on public.retail_leads (assigned_user_id, updated_at desc);

create index if not exists retail_leads_pipeline_stage_idx
  on public.retail_leads (pipeline_stage, lead_status);

create index if not exists retail_quotes_lead_idx
  on public.retail_quotes (lead_id, created_at desc);

create index if not exists retail_sales_closed_at_idx
  on public.retail_sales (closed_at desc);

create index if not exists retail_activities_lead_idx
  on public.retail_activities (lead_id, created_at desc);

-- Suggested RLS direction:
-- 1. Admin users can select/insert/update/delete retail_* tables.
-- 2. Non-admin users should have no access unless you later introduce a sales-specific role.
-- 3. Use profiles.role = 'admin' as the initial policy predicate, consistent with the current app.
