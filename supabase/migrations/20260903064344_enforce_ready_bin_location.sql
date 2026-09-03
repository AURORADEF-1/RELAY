create or replace function public.enforce_ready_ticket_bin_location()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'READY' and nullif(btrim(new.bin_location), '') is null then
    raise exception using
      errcode = '23514',
      message = 'Bin location is required before marking a ticket READY.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_ready_ticket_bin_location on public.tickets;

create trigger enforce_ready_ticket_bin_location
before insert or update of status, bin_location on public.tickets
for each row
execute function public.enforce_ready_ticket_bin_location();

comment on function public.enforce_ready_ticket_bin_location() is
  'Prevents tickets entering or remaining READY without a non-blank bin location.';
