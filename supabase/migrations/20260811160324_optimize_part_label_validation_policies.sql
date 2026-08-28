create index if not exists label_print_jobs_ticket_part_id_idx
  on public.label_print_jobs (ticket_part_id);

create index if not exists label_print_jobs_verified_by_idx
  on public.label_print_jobs (verified_by);

create index if not exists label_print_jobs_issued_by_idx
  on public.label_print_jobs (issued_by);

drop policy if exists "Admins can view label validation" on public.label_print_jobs;
drop policy if exists "Admins can update label validation" on public.label_print_jobs;
drop policy if exists "Print station users can view their jobs" on public.label_print_jobs;
drop policy if exists "Print station users can update their jobs" on public.label_print_jobs;

create policy "Print station users can view their jobs"
  on public.label_print_jobs
  for select
  to authenticated
  using (
    (select auth.uid()) = target_user_id
    or exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.role = 'admin'
    )
  );

create policy "Print station users can update their jobs"
  on public.label_print_jobs
  for update
  to authenticated
  using (
    (select auth.uid()) = target_user_id
    or exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.role = 'admin'
    )
  )
  with check (
    (select auth.uid()) = target_user_id
    or exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.role = 'admin'
    )
  );
