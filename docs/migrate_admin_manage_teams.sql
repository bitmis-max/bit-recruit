-- Allow club admins and owners to manage their club's teams from the admin UI.
-- Requires the public.is_club_admin(uuid) helper used by the recruitment policies.

grant select, insert, update, delete on public.teams to authenticated;

alter table public.teams enable row level security;

drop policy if exists "admin manage teams" on public.teams;
create policy "admin manage teams" on public.teams
  for all to authenticated
  using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));
