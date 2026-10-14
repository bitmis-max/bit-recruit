-- Move per-club roles from club_staff into club_members, preserve existing
-- assignments, then remove club_staff. Run once on the existing database.
begin;

alter table public.club_members
  add column if not exists role public.club_role not null default 'organizer';

-- Ensure every former staff account is represented in club_members, which is
-- now the source of both the club list and the role.
insert into public.club_members (club_id, user_id, role, full_name)
select staff.club_id,
       staff.user_id,
       staff.role,
       coalesce(profile.full_name, auth_user.raw_user_meta_data ->> 'full_name', auth_user.email, 'Quản trị viên')
from public.club_staff as staff
join auth.users as auth_user on auth_user.id = staff.user_id
left join public.profiles as profile on profile.id = staff.user_id
where not exists (
  select 1 from public.club_members as member
  where member.club_id = staff.club_id and member.user_id = staff.user_id
);

update public.club_members as member
set role = staff.role
from public.club_staff as staff
where staff.club_id = member.club_id
  and staff.user_id = member.user_id;

-- Keep existing RLS policies working while switching their helper functions
-- to the new role source.
create or replace function public.is_club_member(p_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.club_members
    where user_id = auth.uid()
      and club_id = p_club_id
      and is_active
  );
$$;

-- Keep previously installed RLS policies that call the old helper name valid.
create or replace function public.is_club_staff(p_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_club_member(p_club_id);
$$;

create or replace function public.is_club_admin(p_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.club_members
    where user_id = auth.uid()
      and club_id = p_club_id
      and is_active
      and role in ('owner', 'admin')
  );
$$;

drop policy if exists "users read own club memberships" on public.club_members;
create policy "users read own club memberships" on public.club_members
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "members read their clubs" on public.clubs;
create policy "members read their clubs" on public.clubs
  for select to authenticated using (
    exists (
      select 1 from public.club_members member
      where member.club_id = clubs.id
        and member.user_id = auth.uid()
        and member.is_active
    )
  );

drop table public.club_staff;

commit;
