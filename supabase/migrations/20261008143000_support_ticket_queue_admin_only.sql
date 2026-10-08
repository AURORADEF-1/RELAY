drop policy if exists "signed in users can view support tickets" on public.support_tickets;
drop policy if exists "admins can view support tickets" on public.support_tickets;

create policy "admins can view support tickets"
  on public.support_tickets for select to authenticated
  using (public.is_relay_admin());
