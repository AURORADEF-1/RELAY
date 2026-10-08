create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  support_ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  created_at timestamptz not null default now()
);

alter table public.support_ticket_attachments enable row level security;

create policy "admins can view support ticket attachments"
  on public.support_ticket_attachments for select to authenticated
  using (public.is_relay_admin());

grant select on public.support_ticket_attachments to authenticated;

create or replace function public.register_support_ticket_attachment(
  p_ticket_id uuid,
  p_file_name text,
  p_file_path text,
  p_mime_type text,
  p_file_size integer
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare attachment_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to attach images'; end if;
  if not exists (
    select 1 from public.support_tickets
    where id = p_ticket_id and requester_user_id = auth.uid()
  ) then raise exception 'You can only attach images to your own support ticket'; end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif') then
    raise exception 'Unsupported image format';
  end if;
  if p_file_size <= 0 or p_file_size > 10485760 then raise exception 'Image must be 10 MB or smaller'; end if;
  if p_file_path not like auth.uid()::text || '/support-' || p_ticket_id::text || '/%' then
    raise exception 'Invalid attachment path';
  end if;

  insert into public.support_ticket_attachments (
    support_ticket_id, uploaded_by, file_name, file_path, mime_type, file_size
  ) values (
    p_ticket_id, auth.uid(), left(p_file_name, 255), p_file_path, p_mime_type, p_file_size
  ) returning id into attachment_id;
  return attachment_id;
end;
$$;

revoke all on function public.register_support_ticket_attachment(uuid,text,text,text,integer) from public, anon;
grant execute on function public.register_support_ticket_attachment(uuid,text,text,text,integer) to authenticated;
