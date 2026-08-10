create or replace function public.prevent_ready_with_outstanding_parts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  outstanding_summary text;
begin
  if old.status = 'ORDERED' and new.status = 'READY' then
    select string_agg(
      greatest(quantity - received_quantity, 0)::text || ' x ' ||
        coalesce(nullif(btrim(part_number), ''), nullif(btrim(part_description), ''), 'unnamed part'),
      ', '
      order by created_at
    )
    into outstanding_summary
    from public.ticket_parts
    where ticket_id = new.id
      and part_status <> 'CANCELLED'
      and received_quantity < quantity;

    if outstanding_summary is not null then
      raise exception using
        errcode = '23514',
        message = 'Receive all linked parts before moving this ticket from ORDERED to READY. Outstanding: ' || outstanding_summary;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.prevent_ready_with_outstanding_parts() is
  'Blocks ORDERED to READY only while a non-cancelled linked part still has units outstanding.';
