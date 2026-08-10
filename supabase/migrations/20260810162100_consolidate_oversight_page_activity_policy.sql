drop policy if exists "page activity self read" on public.oversight_page_activity;
drop policy if exists "page activity oversight read" on public.oversight_page_activity;
drop policy if exists "page activity protected read" on public.oversight_page_activity;

create policy "page activity protected read"
on public.oversight_page_activity for select to authenticated
using (user_id = (select auth.uid()) or public.has_oversight_aal2());
