-- Allow club admins to edit interview session details and delete a session
-- only while it has no applicant assignments and no assigned support members.
-- Requires public.is_club_admin(uuid) and the interview tables to exist.

create or replace function public.can_delete_empty_interview_session(p_session_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.interview_sessions s
    join public.recruitment_campaigns c on c.id = s.campaign_id
    where s.id = p_session_id
      and public.is_club_admin(c.club_id)
      and not exists (
        select 1
        from public.interview_assignments a
        where a.session_id = s.id
      )
      and not exists (
        select 1
        from public.interview_session_members m
        where m.session_id = s.id
      )
  );
$$;

revoke all on function public.can_delete_empty_interview_session(uuid) from public;
grant execute on function public.can_delete_empty_interview_session(uuid) to authenticated;

grant delete on public.interview_sessions to authenticated;
grant update on public.interview_sessions to authenticated;

drop policy if exists "admin update interview sessions" on public.interview_sessions;
create policy "admin update interview sessions" on public.interview_sessions
  for update to authenticated
  using (
    exists (
      select 1
      from public.recruitment_campaigns c
      join public.recruitment_positions p on p.campaign_id = c.id
      where c.id = interview_sessions.campaign_id
        and p.id = interview_sessions.position_id
        and public.is_club_admin(c.club_id)
    )
  )
  with check (
    exists (
      select 1
      from public.recruitment_campaigns c
      join public.recruitment_positions p on p.campaign_id = c.id
      where c.id = interview_sessions.campaign_id
        and p.id = interview_sessions.position_id
        and public.is_club_admin(c.club_id)
    )
  );

drop policy if exists "only admins update interview sessions" on public.interview_sessions;
create policy "only admins update interview sessions" on public.interview_sessions
  as restrictive for update to authenticated
  using (
    exists (
      select 1
      from public.recruitment_campaigns c
      join public.recruitment_positions p on p.campaign_id = c.id
      where c.id = interview_sessions.campaign_id
        and p.id = interview_sessions.position_id
        and public.is_club_admin(c.club_id)
    )
  )
  with check (
    exists (
      select 1
      from public.recruitment_campaigns c
      join public.recruitment_positions p on p.campaign_id = c.id
      where c.id = interview_sessions.campaign_id
        and p.id = interview_sessions.position_id
        and public.is_club_admin(c.club_id)
    )
  );

drop policy if exists "admin delete empty interview sessions" on public.interview_sessions;
create policy "admin delete empty interview sessions" on public.interview_sessions
  for delete to authenticated
  using (public.can_delete_empty_interview_session(id));

-- Restrictive policy also constrains any pre-existing permissive FOR ALL
-- policy on interview_sessions.
drop policy if exists "only delete empty interview sessions" on public.interview_sessions;
create policy "only delete empty interview sessions" on public.interview_sessions
  as restrictive for delete to authenticated
  using (public.can_delete_empty_interview_session(id));
