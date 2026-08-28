-- Additive RICO provenance for proposed ticket parts.
-- Existing ticket_parts RLS policies continue to govern every row.
alter table public.ticket_parts
  add column if not exists source_system text,
  add column if not exists source_product_id text,
  add column if not exists source_price_snapshot numeric(12,2),
  add column if not exists source_currency text,
  add column if not exists source_stock_snapshot integer,
  add column if not exists source_checked_at timestamptz,
  add column if not exists source_search_method text,
  add column if not exists source_machine_id uuid references public.machines (id) on delete set null,
  add column if not exists source_machine_serial_number text,
  add column if not exists source_confirmed_by uuid references auth.users (id) on delete set null,
  add column if not exists source_confirmed_at timestamptz;

alter table public.ticket_parts
  drop constraint if exists ticket_parts_source_system_check,
  add constraint ticket_parts_source_system_check
    check (source_system is null or source_system = 'RICO'),
  drop constraint if exists ticket_parts_source_search_method_check,
  add constraint ticket_parts_source_search_method_check
    check (
      source_search_method is null
      or source_search_method in ('MACHINE', 'RICO_REFERENCE', 'CROSS_REFERENCE', 'CATALOGUE')
    ),
  drop constraint if exists ticket_parts_source_currency_check,
  add constraint ticket_parts_source_currency_check
    check (source_currency is null or source_currency ~ '^[A-Z]{3}$');

create index if not exists ticket_parts_source_product_idx
on public.ticket_parts (source_system, source_product_id)
where source_system is not null;

create index if not exists ticket_parts_source_machine_idx
on public.ticket_parts (source_machine_id)
where source_machine_id is not null;
