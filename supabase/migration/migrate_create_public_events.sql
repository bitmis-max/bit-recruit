create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null,
  description text,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists events_club_sort_order_idx
  on public.events (club_id, sort_order, created_at desc);

grant select on public.clubs to anon, authenticated;
drop policy if exists "public read club overview" on public.clubs;
create policy "public read club overview" on public.clubs
  for select to anon, authenticated
  using (true);

alter table public.events enable row level security;
grant select on public.events to anon, authenticated;

drop policy if exists "public read events" on public.events;
create policy "public read events" on public.events
  for select to anon, authenticated
  using (true);
