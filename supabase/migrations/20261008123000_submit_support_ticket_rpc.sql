create or replace function public.submit_support_ticket(
  p_subject text, p_description text, p_requester_name text, p_requester_email text default null
)
returns table (id uuid, reference text)
language plpgsql security definer set search_path = public
as $$
declare created public.support_tickets;
begin
  insert into public.support_tickets(subject, description, requester_name, requester_email, requester_user_id)
  values (btrim(p_subject), btrim(p_description), btrim(p_requester_name), nullif(lower(btrim(p_requester_email)), ''), auth.uid())
  returning * into created;
  insert into public.notifications(user_id, ticket_id, type, title, body)
  select profile.id, null, 'support_ticket', 'Support ticket ' || created.reference,
    created.requester_name || ': ' || created.subject
  from public.profiles profile where profile.role = 'admin';
  return query select created.id, created.reference;
end;
$$;
revoke all on function public.submit_support_ticket(text,text,text,text) from public;
grant execute on function public.submit_support_ticket(text,text,text,text) to anon, authenticated;
