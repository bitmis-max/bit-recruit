-- Run after migrate_club_roles_to_members.sql.
-- RLS permissions for campaign, position and form management.

alter table public.recruitment_campaigns enable row level security;
alter table public.recruitment_positions enable row level security;
alter table public.application_forms enable row level security;
alter table public.form_questions enable row level security;
alter table public.teams enable row level security;
alter table public.application_answers enable row level security;

drop policy if exists "staff read campaigns" on public.recruitment_campaigns;
drop policy if exists "members read campaigns" on public.recruitment_campaigns;
create policy "members read campaigns" on public.recruitment_campaigns
  for select to authenticated using (public.is_club_member(club_id));

drop policy if exists "admin write campaigns" on public.recruitment_campaigns;
create policy "admin write campaigns" on public.recruitment_campaigns
  for all to authenticated using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));

drop policy if exists "public read open campaigns" on public.recruitment_campaigns;
create policy "public read open campaigns" on public.recruitment_campaigns
  for select to anon, authenticated using (
    status = 'open'
    and (start_date is null or start_date <= now())
    and (end_date is null or end_date >= now())
  );

drop policy if exists "staff read positions" on public.recruitment_positions;
create policy "staff read positions" on public.recruitment_positions
  for select to authenticated using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = recruitment_positions.campaign_id
        and public.is_club_member(c.club_id)
    )
  );

drop policy if exists "public read open positions" on public.recruitment_positions;
create policy "public read open positions" on public.recruitment_positions
  for select to anon, authenticated using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = recruitment_positions.campaign_id
        and c.status = 'open'
        and (c.start_date is null or c.start_date <= now())
        and (c.end_date is null or c.end_date >= now())
    )
  );

drop policy if exists "admin write positions" on public.recruitment_positions;
create policy "admin write positions" on public.recruitment_positions
  for all to authenticated using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = recruitment_positions.campaign_id
        and public.is_club_admin(c.club_id)
    )
  ) with check (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = recruitment_positions.campaign_id
        and public.is_club_admin(c.club_id)
        and (
          recruitment_positions.team_id is null
          or exists (
            select 1 from public.teams t
            where t.id = recruitment_positions.team_id and t.club_id = c.club_id
          )
        )
    )
  );

drop policy if exists "staff read application forms" on public.application_forms;
drop policy if exists "members read application forms" on public.application_forms;
create policy "members read application forms" on public.application_forms
  for select to authenticated using (
    exists (
      select 1 from public.recruitment_positions p
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id
        and public.is_club_member(c.club_id)
    )
  );

drop policy if exists "admin write application forms" on public.application_forms;
create policy "admin write application forms" on public.application_forms
  for all to authenticated using (
    exists (
      select 1 from public.recruitment_positions p
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id
        and public.is_club_admin(c.club_id)
    )
  ) with check (
    exists (
      select 1 from public.recruitment_positions p
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id
        and public.is_club_admin(c.club_id)
    )
  );

drop policy if exists "public read open application forms" on public.application_forms;
create policy "public read open application forms" on public.application_forms
  for select to anon, authenticated using (
    exists (
      select 1 from public.recruitment_positions p
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id
        and c.status = 'open'
        and (c.start_date is null or c.start_date <= now())
        and (c.end_date is null or c.end_date >= now())
    )
  );

drop policy if exists "staff read form questions" on public.form_questions;
drop policy if exists "members read form questions" on public.form_questions;
create policy "members read form questions" on public.form_questions
  for select to authenticated using (
    exists (
      select 1 from public.application_forms f
      join public.recruitment_positions p on p.id = f.position_id
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id
        and public.is_club_member(c.club_id)
    )
  );

drop policy if exists "admin write form questions" on public.form_questions;
create policy "admin write form questions" on public.form_questions
  for all to authenticated using (
    exists (
      select 1 from public.application_forms f
      join public.recruitment_positions p on p.id = f.position_id
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id
        and public.is_club_admin(c.club_id)
    )
  ) with check (
    exists (
      select 1 from public.application_forms f
      join public.recruitment_positions p on p.id = f.position_id
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id
        and public.is_club_admin(c.club_id)
    )
  );

drop policy if exists "public read open form questions" on public.form_questions;
create policy "public read open form questions" on public.form_questions
  for select to anon, authenticated using (
    exists (
      select 1 from public.application_forms f
      join public.recruitment_positions p on p.id = f.position_id
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id
        and c.status = 'open'
        and (c.start_date is null or c.start_date <= now())
        and (c.end_date is null or c.end_date >= now())
    )
  );

drop policy if exists "members read teams" on public.teams;
create policy "members read teams" on public.teams
  for select to authenticated using (public.is_club_member(club_id));

drop policy if exists "public read teams for open positions" on public.teams;
create policy "public read teams for open positions" on public.teams
  for select to anon, authenticated using (
    exists (
      select 1 from public.recruitment_positions p
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where p.team_id = teams.id
        and c.status = 'open'
        and (c.start_date is null or c.start_date <= now())
        and (c.end_date is null or c.end_date >= now())
    )
  );

drop policy if exists "members read application answers" on public.application_answers;
create policy "members read application answers" on public.application_answers
  for select to authenticated using (
    exists (
      select 1 from public.applications a
      join public.recruitment_campaigns c on c.id = a.campaign_id
      where a.id = application_answers.application_id
        and public.is_club_member(c.club_id)
    )
  );
