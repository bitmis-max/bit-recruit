-- Assign each club member to one team so interview support can be scoped by team.
alter table public.club_members
  add column if not exists team_id uuid references public.teams(id) on delete set null;

create index if not exists club_members_club_team_idx
  on public.club_members (club_id, team_id);
