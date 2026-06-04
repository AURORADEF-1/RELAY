alter table public.tickets
  add column if not exists is_retail_sale boolean not null default false,
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists retail_delivery_method text check (retail_delivery_method in ('collect', 'delivery')),
  add column if not exists retail_delivery_address text,
  add column if not exists retail_apc_tracking_number text;

create index if not exists tickets_is_retail_sale_idx
on public.tickets (is_retail_sale);

create index if not exists tickets_retail_delivery_method_idx
on public.tickets (retail_delivery_method);

