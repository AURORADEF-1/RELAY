alter table public.tickets
  add column if not exists retail_sales_reference text;

create index if not exists tickets_retail_sales_reference_idx
  on public.tickets (retail_sales_reference);

comment on column public.tickets.retail_sales_reference is
  'Customer-facing reference used for retail collection and delivery communications.';
