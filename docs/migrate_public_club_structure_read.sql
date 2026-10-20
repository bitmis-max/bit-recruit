-- Allow the public club overview page to read its public structure data.
-- The existing teams policy only exposes teams attached to currently open
-- recruitment positions, which hides the team list outside recruitment periods.

grant select on public.clubs, public.teams to anon, authenticated;

alter table public.clubs enable row level security;
alter table public.teams enable row level security;

drop policy if exists "public read club overview" on public.clubs;
create policy "public read club overview" on public.clubs
  for select to anon, authenticated
  using (true);

drop policy if exists "public read team structure" on public.teams;
create policy "public read team structure" on public.teams
  for select to anon, authenticated
  using (true);
