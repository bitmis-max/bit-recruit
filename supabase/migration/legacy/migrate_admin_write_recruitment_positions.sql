-- Fix admin inserts/updates/deletes for recruitment positions.
-- Requires public.is_club_admin(uuid) from migrate_club_roles_to_members.sql.

grant select, insert, update, delete on public.recruitment_positions to authenticated;

alter table public.recruitment_positions enable row level security;

create or replace function public.team_belongs_to_club(p_team_id uuid, p_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_team_id is null or exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and t.club_id = p_club_id
  );
$$;

revoke all on function public.team_belongs_to_club(uuid, uuid) from public;
grant execute on function public.team_belongs_to_club(uuid, uuid) to authenticated;

drop policy if exists "admin write positions" on public.recruitment_positions;
create policy "admin write positions" on public.recruitment_positions
  for all to authenticated
  using (
    exists (
      select 1
      from public.recruitment_campaigns c
      where c.id = recruitment_positions.campaign_id
        and public.is_club_admin(c.club_id)
    )
  )
  with check (
    exists (
      select 1
      from public.recruitment_campaigns c
      where c.id = recruitment_positions.campaign_id
        and public.is_club_admin(c.club_id)
        and public.team_belongs_to_club(recruitment_positions.team_id, c.club_id)
    )
  );
