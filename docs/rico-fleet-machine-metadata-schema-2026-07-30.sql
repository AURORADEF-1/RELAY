alter table public.machines
  add column if not exists engine text,
  add column if not exists engine_serial_number text,
  add column if not exists build_year text,
  add column if not exists serial_range text,
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists current_hours numeric,
  add column if not exists hours_reading_date date,
  add column if not exists service_interval_hours integer,
  add column if not exists service_interval_months integer,
  add column if not exists location text,
  add column if not exists notes text;

alter table public.machines
  drop constraint if exists machines_lifecycle_status_check,
  add constraint machines_lifecycle_status_check
    check (lifecycle_status in ('active', 'disposed', 'sold')),
  drop constraint if exists machines_current_hours_check,
  add constraint machines_current_hours_check
    check (current_hours is null or current_hours >= 0),
  drop constraint if exists machines_service_interval_hours_check,
  add constraint machines_service_interval_hours_check
    check (service_interval_hours is null or service_interval_hours > 0),
  drop constraint if exists machines_service_interval_months_check,
  add constraint machines_service_interval_months_check
    check (service_interval_months is null or service_interval_months > 0);

create or replace function private.touch_machine_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists machines_touch_updated_at on public.machines;
create trigger machines_touch_updated_at
before update on public.machines
for each row
execute function private.touch_machine_updated_at();

