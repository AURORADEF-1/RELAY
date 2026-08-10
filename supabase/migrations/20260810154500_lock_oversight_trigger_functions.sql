revoke all on function public.capture_ticket_oversight_activity() from public, anon, authenticated;
revoke all on function public.capture_purchase_order_oversight_activity() from public, anon, authenticated;
revoke all on function public.is_relay_admin(uuid) from public, anon;
revoke all on function public.has_oversight_aal2(uuid) from public, anon;
grant execute on function public.is_relay_admin(uuid) to authenticated;
grant execute on function public.has_oversight_aal2(uuid) to authenticated;
