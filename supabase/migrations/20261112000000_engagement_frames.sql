-- Đối chiếu tương tác Facebook và avatar khung.
-- Xem docs/CONTRACT.md (mục 1) và docs/database.md.
--   * avatar_frames, member_facebook_aliases (+ trigger, index, RLS, grant)
--   * tasks.kind, tasks.post_url, tasks.frame_id (+ check, trigger cùng CLB)
--   * bucket 'avatar-frames' (public, 2 MB, image/png)
--   * create_task (thêm 4 tham số mới ở cuối), apply_task_scan

begin;

-- ---------------------------------------------------------------------------
-- 1. Bảng
-- ---------------------------------------------------------------------------

create table public.avatar_frames (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  -- đường dẫn trong bucket 'avatar-frames': '<club_id>/<uuid>.png'
  image_path text not null,
  created_by uuid references public.club_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index avatar_frames_club_idx on public.avatar_frames (club_id, created_at desc);

alter table public.tasks
  add column kind text not null default 'general',
  add column post_url text,
  add column frame_id uuid references public.avatar_frames(id) on delete set null;

alter table public.tasks
  add constraint tasks_kind_check check (kind in ('general', 'engagement', 'avatar')),
  add constraint tasks_post_url_format
    check (post_url is null or post_url ~ '^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+'),
  add constraint tasks_engagement_needs_post_url
    check (kind <> 'engagement' or post_url is not null),
  add constraint tasks_frame_only_for_avatar
    check (kind = 'avatar' or frame_id is null);

create index tasks_frame_idx on public.tasks (frame_id) where frame_id is not null;

create table public.member_facebook_aliases (
  club_id uuid not null references public.clubs(id) on delete cascade,
  fb_key text not null check (fb_key ~ '^(id:[0-9]{3,25}|u:[a-z0-9.]{1,80})$'),
  member_id uuid not null references public.club_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, fb_key)
);

create index member_facebook_aliases_member_idx on public.member_facebook_aliases (member_id);

-- ---------------------------------------------------------------------------
-- 2. Trigger
-- ---------------------------------------------------------------------------

-- Khung của việc phải cùng CLB với việc.
create or replace function public.enforce_task_frame_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.frame_id is not null and not exists (
    select 1 from public.avatar_frames f
    where f.id = new.frame_id and f.club_id = new.club_id
  ) then
    raise exception 'Khung avatar không thuộc CLB này';
  end if;
  return new;
end;
$$;

create trigger tasks_frame_club_check
  before insert or update of club_id, frame_id on public.tasks
  for each row execute function public.enforce_task_frame_club();

-- Thành viên của alias phải cùng CLB với alias.
create or replace function public.enforce_member_alias_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.club_members m
    where m.id = new.member_id and m.club_id = new.club_id
  ) then
    raise exception 'Thành viên không thuộc CLB này';
  end if;
  return new;
end;
$$;

create trigger member_facebook_aliases_club_check
  before insert or update of club_id, member_id on public.member_facebook_aliases
  for each row execute function public.enforce_member_alias_club();

-- ---------------------------------------------------------------------------
-- 3. RLS và grant
-- ---------------------------------------------------------------------------

alter table public.avatar_frames enable row level security;
alter table public.member_facebook_aliases enable row level security;

revoke all on public.avatar_frames from public, anon, authenticated;
revoke all on public.member_facebook_aliases from public, anon, authenticated;

-- Khung là ảnh quảng bá (trang ghép avatar công khai). Ghi qua API (service-role).
-- Cấp theo cột để không lộ created_by (uuid của thành viên). Không dùng select("*") ở client.
grant select (id, club_id, name, image_path, created_at) on public.avatar_frames to anon, authenticated;
grant all on public.avatar_frames to service_role;

grant select, delete on public.member_facebook_aliases to authenticated;
grant insert (club_id, fb_key, member_id) on public.member_facebook_aliases to authenticated;
grant all on public.member_facebook_aliases to service_role;

create policy "public read avatar frames" on public.avatar_frames
  for select to anon, authenticated using (true);

create policy "admins read facebook aliases" on public.member_facebook_aliases
  for select to authenticated using (public.is_club_admin(club_id));
create policy "admins insert facebook aliases" on public.member_facebook_aliases
  for insert to authenticated with check (public.is_club_admin(club_id));
create policy "admins delete facebook aliases" on public.member_facebook_aliases
  for delete to authenticated using (public.is_club_admin(club_id));

-- tasks: grant insert/update giữ nguyên; kind, post_url, frame_id chỉ đặt qua create_task.

-- ---------------------------------------------------------------------------
-- 4. Storage bucket (đọc công khai; ghi/xóa chỉ service-role, không có policy ghi)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatar-frames', 'avatar-frames', true, 2097152, array['image/png']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "public read avatar frames" on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatar-frames');

-- ---------------------------------------------------------------------------
-- 5. Hàm nghiệp vụ
-- ---------------------------------------------------------------------------

-- Thêm 4 tham số có default ở cuối (giữ nguyên thứ tự 6 tham số cũ).
drop function public.create_task(uuid, text, text, timestamptz, uuid[], uuid);

create or replace function public.create_task(
  p_club_id uuid,
  p_title text,
  p_description text,
  p_due_at timestamptz,
  p_member_ids uuid[],
  p_team_id uuid,
  p_kind text default 'general',
  p_post_url text default null,
  p_frame_id uuid default null,
  p_all_members boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(p_title);
  v_kind text := coalesce(p_kind, 'general');
  v_post_url text := nullif(btrim(p_post_url), '');
  v_ids uuid[];
  v_creator uuid;
  v_task_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để giao việc';
  end if;

  if p_club_id is null or not public.is_club_admin(p_club_id) then
    raise exception 'Bạn không có quyền giao việc trong CLB này';
  end if;

  if v_title is null or char_length(v_title) not between 1 and 200 then
    raise exception 'Tiêu đề việc phải có từ 1 đến 200 ký tự';
  end if;

  if p_due_at is null then
    raise exception 'Vui lòng chọn hạn hoàn thành';
  end if;

  if p_due_at <= now() then
    raise exception 'Hạn chót phải ở tương lai.';
  end if;

  if v_kind not in ('general', 'engagement', 'avatar') then
    raise exception 'Loại việc không hợp lệ';
  end if;

  if v_kind = 'engagement' and v_post_url is null then
    raise exception 'Việc tương tác phải có link bài viết';
  end if;

  if v_post_url is not null
     and v_post_url !~ '^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+' then
    raise exception 'Link bài viết phải là link Facebook (https://facebook.com/...)';
  end if;

  if p_frame_id is not null then
    if v_kind <> 'avatar' then
      raise exception 'Chỉ việc thay avatar mới có khung';
    end if;
    if not exists (
      select 1 from public.avatar_frames f
      where f.id = p_frame_id and f.club_id = p_club_id
    ) then
      raise exception 'Khung avatar không thuộc CLB này';
    end if;
  end if;

  if p_team_id is not null and not exists (
    select 1 from public.teams t where t.id = p_team_id and t.club_id = p_club_id
  ) then
    raise exception 'Ban không thuộc CLB này';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
  from unnest(coalesce(p_member_ids, '{}'::uuid[])) x
  where x is not null;

  if exists (
    select 1 from unnest(v_ids) x
    where not exists (
      select 1 from public.club_members m
      where m.id = x and m.club_id = p_club_id and m.is_active
    )
  ) then
    raise exception 'Người nhận phải là thành viên đang hoạt động của CLB này';
  end if;

  if p_team_id is not null then
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(v_ids || coalesce((
      select array_agg(m.id)
      from public.club_members m
      where m.club_id = p_club_id and m.team_id = p_team_id and m.is_active
    ), '{}'::uuid[])) x;
  end if;

  if coalesce(p_all_members, false) then
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(v_ids || coalesce((
      select array_agg(m.id)
      from public.club_members m
      where m.club_id = p_club_id and m.is_active
    ), '{}'::uuid[])) x;
  end if;

  if cardinality(v_ids) = 0 then
    raise exception 'Việc phải có ít nhất một người nhận';
  end if;

  select m.id into v_creator
  from public.club_members m
  where m.club_id = p_club_id and m.user_id = auth.uid() and m.is_active;

  insert into public.tasks (club_id, title, description, due_at, created_by, kind, post_url, frame_id)
  values (p_club_id, v_title, nullif(btrim(p_description), ''), p_due_at, v_creator,
          v_kind, v_post_url, p_frame_id)
  returning id into v_task_id;

  insert into public.task_assignees (task_id, member_id)
  select v_task_id, x from unnest(v_ids) x;

  return v_task_id;
end;
$$;

revoke all on function public.create_task(uuid, text, text, timestamptz, uuid[], uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.create_task(uuid, text, text, timestamptz, uuid[], uuid, text, text, uuid, boolean) to authenticated, service_role;

-- Đánh dấu xong hàng loạt sau khi đối chiếu. Chỉ đổi dòng đang 'pending'
-- (không đụng 'done'/'missed'); completed_at do trigger. Trả số dòng đã đổi.
create or replace function public.apply_task_scan(p_task_id uuid, p_member_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_status text;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để cập nhật việc';
  end if;

  select t.club_id, t.status into v_club_id, v_status
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    raise exception 'Không tìm thấy việc';
  end if;

  if not public.is_club_admin(v_club_id) then
    raise exception 'Bạn không có quyền cập nhật việc trong CLB này';
  end if;

  if v_status <> 'open' then
    raise exception 'Việc này đã đóng';
  end if;

  update public.task_assignees ta
  set status = 'done'
  where ta.task_id = p_task_id
    and ta.status = 'pending'
    and ta.member_id = any (coalesce(p_member_ids, '{}'::uuid[]));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.apply_task_scan(uuid, uuid[]) from public, anon;
grant execute on function public.apply_task_scan(uuid, uuid[]) to authenticated, service_role;

commit;
