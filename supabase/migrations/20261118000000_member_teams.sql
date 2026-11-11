-- Đợt 6: một thành viên thuộc nhiều ban. Xem docs/CONTRACT.md và docs/database.md (mục 6.8).
--   * Bảng club_member_teams (tập ban của thành viên). club_members.team_id giữ nguyên = "ban chính",
--     luôn nằm trong tập (hoặc null khi tập rỗng).
--   * Trigger: chặn ghép ban của CLB khác; đồng bộ ban chính -> tập (chỉ thêm); xóa dòng tập đúng
--     bằng ban chính thì đặt ban chính sang ban còn lại cũ nhất (hoặc null).
--   * set_member_teams(p_member_id, p_team_ids): chỉ service_role (API đã kiểm tra quyền).
--   * Sửa can_assign_task_member, create_task, club_contribution (+ cột team_ids), import_members
--     để hỏi "thuộc ban" qua tập ban. Phân quyền Ban chủ chốt vẫn theo ban chính (my_club_team).

begin;

-- ---------------------------------------------------------------------------
-- 1. Bảng club_member_teams
-- ---------------------------------------------------------------------------
create table public.club_member_teams (
  member_id uuid not null references public.club_members(id) on delete cascade,
  team_id   uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, team_id)
);
create index club_member_teams_team_idx on public.club_member_teams (team_id);

-- Backfill: mỗi ban chính hiện có thành một dòng trong tập.
insert into public.club_member_teams (member_id, team_id)
select id, team_id from public.club_members where team_id is not null;

-- Trigger chặn ghép thành viên với ban của CLB khác (giống enforce_task_assignee_club).
create or replace function public.enforce_member_team_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.club_members m
    join public.teams t on t.club_id = m.club_id
    where m.id = new.member_id and t.id = new.team_id
  ) then
    raise exception 'Ban phải thuộc cùng CLB với thành viên';
  end if;
  return new;
end;
$$;

create trigger club_member_teams_club_check
  before insert or update of member_id, team_id on public.club_member_teams
  for each row execute function public.enforce_member_team_club();

-- Ban chính (club_members.team_id) luôn nằm trong tập. Chỉ thêm, không xóa ban cũ.
create or replace function public.sync_member_primary_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.club_member_teams (member_id, team_id)
  values (new.id, new.team_id)
  on conflict do nothing;
  return null;
end;
$$;

create trigger club_members_sync_primary_team
  after insert or update of team_id on public.club_members
  for each row when (new.team_id is not null)
  execute function public.sync_member_primary_team();

-- Xóa dòng tập đúng bằng ban chính: đặt ban chính sang ban còn lại cũ nhất, hoặc null.
-- Không lặp vô hạn: UPDATE club_members chỉ kích trigger đồng bộ ở trên, trigger đó
-- chỉ INSERT ... on conflict do nothing (ban mới đã nằm trong tập) và không kích trigger xóa.
create or replace function public.reassign_primary_team_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.club_members m
  set team_id = (
    select mt.team_id
    from public.club_member_teams mt
    where mt.member_id = old.member_id
    order by mt.created_at, mt.team_id
    limit 1
  )
  where m.id = old.member_id
    and (
      m.team_id = old.team_id
      -- Xóa cả ban: FK set null của club_members.team_id có thể chạy trước và đã xóa ban chính.
      or (m.team_id is null and not exists (select 1 from public.teams t where t.id = old.team_id))
    );
  return null;
end;
$$;

create trigger club_member_teams_reassign_primary
  after delete on public.club_member_teams
  for each row execute function public.reassign_primary_team_on_delete();

-- Hàm trigger không gọi được qua API (như migration 20261113000000).
revoke all on function public.enforce_member_team_club() from public, anon, authenticated;
revoke all on function public.sync_member_primary_team() from public, anon, authenticated;
revoke all on function public.reassign_primary_team_on_delete() from public, anon, authenticated;
grant execute on function public.enforce_member_team_club() to service_role;
grant execute on function public.sync_member_primary_team() to service_role;
grant execute on function public.reassign_primary_team_on_delete() to service_role;

-- RLS: đọc cho Ban chủ chốt/chủ nhiệm của CLB và chính thành viên đó; không policy ghi
-- (chỉ service_role và hàm security definer ghi).
alter table public.club_member_teams enable row level security;

create policy "admins or self read member teams" on public.club_member_teams
  for select to authenticated using (
    exists (
      select 1 from public.club_members m
      where m.id = club_member_teams.member_id
        and (public.is_club_admin(m.club_id) or m.user_id = auth.uid())
    )
  );

revoke all on table public.club_member_teams from public, anon, authenticated;
grant select on table public.club_member_teams to authenticated;
grant all on table public.club_member_teams to service_role;

-- ---------------------------------------------------------------------------
-- 2. set_member_teams: thay toàn bộ tập ban của một thành viên (chỉ service_role)
-- ---------------------------------------------------------------------------
create or replace function public.set_member_teams(p_member_id uuid, p_team_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_ids uuid[];
begin
  if p_team_ids is null or array_position(p_team_ids, null) is not null then
    raise exception 'Danh sách ban không hợp lệ';
  end if;

  -- Khóa dòng thành viên để hai lần gọi cùng lúc không chen nhau.
  select m.club_id into v_club_id
  from public.club_members m
  where m.id = p_member_id
  for update;
  if v_club_id is null then
    raise exception 'Không tìm thấy thành viên';
  end if;

  -- Bỏ trùng, giữ thứ tự (phần tử đầu là ban chính).
  select coalesce(array_agg(d.x order by d.o), '{}'::uuid[]) into v_ids
  from (
    select u.x, min(u.o) as o from unnest(p_team_ids) with ordinality as u(x, o) group by u.x
  ) d;

  if exists (
    select 1 from unnest(v_ids) x
    where not exists (select 1 from public.teams t where t.id = x and t.club_id = v_club_id)
  ) then
    raise exception 'Có ban không thuộc CLB của thành viên này';
  end if;

  -- Đặt ban chính trước (trigger đồng bộ thêm nó vào tập), rồi xóa ban thừa, rồi thêm ban thiếu.
  update public.club_members set team_id = v_ids[1] where id = p_member_id;

  delete from public.club_member_teams
  where member_id = p_member_id and team_id <> all (v_ids);

  insert into public.club_member_teams (member_id, team_id, created_at)
  select p_member_id, u.x, clock_timestamp() + u.o * interval '1 microsecond'
  from unnest(v_ids) with ordinality as u(x, o)
  on conflict do nothing;
end;
$$;

revoke all on function public.set_member_teams(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.set_member_teams(uuid, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- 3. can_assign_task_member: người nhận thuộc ban (trong tập) của admin
-- ---------------------------------------------------------------------------
create or replace function public.can_assign_task_member(p_task_id uuid, p_member_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.can_manage_task_id(p_task_id)
    and exists (
      select 1
      from public.tasks t
      join public.club_members m on m.id = p_member_id and m.club_id = t.club_id
      where t.id = p_task_id
        and (
          public.is_club_owner(t.club_id)
          or (t.team_id is null and t.kind in ('engagement', 'avatar'))
          or exists (
            select 1 from public.club_member_teams mt
            where mt.member_id = m.id and mt.team_id = public.my_club_team(t.club_id)
          )
        )
    );
$$;

revoke all on function public.can_assign_task_member(uuid, uuid) from public, anon;
grant execute on function public.can_assign_task_member(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. create_task: kiểm tra và mở rộng "cả ban" theo tập ban
-- ---------------------------------------------------------------------------

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
  v_my_team uuid;
  v_task_team uuid;
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

  if public.is_club_owner(p_club_id) then
    v_task_team := p_team_id;
  else
    -- Ban chủ chốt: chỉ giao trong ban của mình.
    v_my_team := public.my_club_team(p_club_id);
    if v_my_team is null then
      raise exception 'Bạn chưa thuộc ban nào nên chưa giao việc được. Hãy nhờ Chủ nhiệm xếp bạn vào một ban.';
    end if;
    if p_team_id is not null and p_team_id <> v_my_team then
      raise exception 'Bạn chỉ được giao việc cho ban của mình';
    end if;
    if coalesce(p_all_members, false) then
      if v_kind not in ('engagement', 'avatar')
         or not public.has_club_permission(p_club_id, 'facebook') then
        raise exception 'Chỉ người có quyền Đối chiếu Facebook mới được giao việc tương tác hoặc avatar cho tất cả thành viên';
      end if;
      v_task_team := null;
    else
      if exists (
        select 1 from unnest(v_ids) x
        where not exists (
          select 1 from public.club_member_teams mt
          where mt.member_id = x and mt.team_id = v_my_team
        )
      ) then
        raise exception 'Bạn chỉ được giao việc cho thành viên trong ban của mình';
      end if;
      v_task_team := v_my_team;
    end if;
  end if;

  if p_team_id is not null then
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(v_ids || coalesce((
      select array_agg(m.id)
      from public.club_members m
      where m.club_id = p_club_id and m.is_active
        and exists (
          select 1 from public.club_member_teams mt
          where mt.member_id = m.id and mt.team_id = p_team_id
        )
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

  insert into public.tasks (club_id, title, description, due_at, created_by, kind, post_url, frame_id, team_id)
  values (p_club_id, v_title, nullif(btrim(p_description), ''), p_due_at, v_creator,
          v_kind, v_post_url, p_frame_id, v_task_team)
  returning id into v_task_id;

  insert into public.task_assignees (task_id, member_id)
  select v_task_id, x from unnest(v_ids) x;

  return v_task_id;
end;
$$;

revoke all on function public.create_task(uuid, text, text, timestamptz, uuid[], uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.create_task(uuid, text, text, timestamptz, uuid[], uuid, text, text, uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. club_contribution: lọc theo tập ban; thêm cột team_ids (ban chính đứng đầu)
-- ---------------------------------------------------------------------------

drop function public.club_contribution(uuid, timestamptz, timestamptz);

create or replace function public.club_contribution(
  p_club_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  member_id uuid,
  full_name text,
  team_id uuid,
  team_ids uuid[],
  role public.club_role,
  is_active boolean,
  assigned int,
  done_on_time int,
  done_late int,
  missed int,
  pending int
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_owner boolean;
  v_team uuid;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để xem đóng góp';
  end if;

  if p_club_id is null or not public.is_club_admin(p_club_id) then
    raise exception 'Bạn không có quyền xem đóng góp của CLB này';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Khoảng thời gian không hợp lệ';
  end if;

  v_owner := public.is_club_owner(p_club_id);
  v_team := public.my_club_team(p_club_id);

  return query
  select
    m.id,
    m.full_name,
    m.team_id,
    coalesce((
      select array_agg(mt.team_id order by (mt.team_id is not distinct from m.team_id) desc, mt.created_at, mt.team_id)
      from public.club_member_teams mt
      where mt.member_id = m.id
    ), '{}'::uuid[]),
    m.role,
    m.is_active,
    count(x.mid)::int,
    (count(x.mid) filter (where x.st = 'done' and x.completed_at <= x.due_at))::int,
    (count(x.mid) filter (where x.st = 'done'
      and (x.completed_at > x.due_at or x.completed_at is null)))::int,
    (count(x.mid) filter (where x.st = 'missed'
      or (x.st = 'pending' and x.due_at < now())))::int,
    (count(x.mid) filter (where x.st = 'pending' and x.due_at >= now()))::int
  from public.club_members m
  left join (
    select ta.member_id as mid, ta.status as st, ta.completed_at, t.due_at, t.status as tst
    from public.task_assignees ta
    join public.tasks t on t.id = ta.task_id
    where t.club_id = p_club_id
      and t.due_at >= p_from
      and t.due_at < p_to
      -- Việc đã đóng: dòng còn chờ không tính (không giao, không bỏ lỡ, không chờ).
      and not (ta.status = 'pending' and t.status = 'closed')
      -- Admin chỉ đếm việc của ban chính của mình hoặc việc toàn CLB (không thấy việc ban khác giao).
      and (v_owner or t.team_id is null or t.team_id = v_team)
  ) x on x.mid = m.id
  where m.club_id = p_club_id
    -- owner: cả CLB; admin: chỉ thành viên cùng ban (không có ban thì không có dòng nào).
    and (
      v_owner
      or (v_team is not null and exists (
        select 1 from public.club_member_teams mt
        where mt.member_id = m.id and mt.team_id = v_team
      ))
    )
  group by m.id, m.full_name, m.team_id, m.role, m.is_active
  order by m.full_name, m.id;
end;
$$;

revoke all on function public.club_contribution(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.club_contribution(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. import_members: THÊM ban vào tập (ban chính chỉ đặt khi đang null)
-- ---------------------------------------------------------------------------

create or replace function public.import_members(
  p_club_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_rows constant int := 1000;
  c_email_re constant text := '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$';  -- như submit_application
  c_fb_re constant text := '^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+';    -- như check của club_members
  c_keys constant text[] := array[
    'full_name', 'student_code', 'class_name', 'email', 'phone', 'facebook_url', 'team', 'title'
  ];

  v_is_head boolean;
  v_cur int;                 -- số dòng đang xử lý (cho tiền tố "Dòng N: ")
  v_total int;
  v_n int;
  v_row jsonb;
  v_f jsonb;
  v_k text;
  v_val jsonb;
  v_txt text;
  v_limit int;

  v_name text;
  v_code text;
  v_email text;
  v_team_name text;
  v_team_id uuid;

  v_seen_code jsonb := '{}';   -- MSSV -> số dòng đã dùng trong file
  v_seen_email jsonb := '{}';  -- email -> số dòng đã dùng trong file
  v_team_cache jsonb := '{}';  -- tên ban viết thường -> team_id
  v_prev int;

  v_code_id uuid;
  v_email_id uuid;
  v_m public.club_members%rowtype;

  v_class text;
  v_phone text;
  v_fb text;
  v_title text;
  v_new_email text;
  v_new_team uuid;
  v_staff boolean;
  v_add_team boolean;

  v_inserted int := 0;
  v_updated int := 0;
  v_unchanged int := 0;
  v_staff_skipped int := 0;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để import thành viên';
  end if;

  if p_club_id is null or not public.has_club_permission(p_club_id, 'members') then
    raise exception 'Bạn không có quyền import thành viên cho CLB này';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Dữ liệu import phải là một danh sách các dòng';
  end if;

  v_total := jsonb_array_length(p_rows);
  if v_total = 0 then
    raise exception 'Không có dòng nào để import';
  end if;
  if v_total > c_max_rows then
    raise exception 'Tối đa % dòng mỗi lần import (file có % dòng)', c_max_rows, v_total;
  end if;

  v_is_head := public.is_club_head(p_club_id);

  -- Hai lần import cùng CLB không chạy đồng thời (tránh ghép trùng thành viên).
  perform pg_advisory_xact_lock(hashtextextended('import_members:' || p_club_id::text, 0));

  begin
    for v_n in 1..v_total loop
      v_cur := v_n;
      v_row := p_rows -> (v_n - 1);

      -- ---- Kiểm tra dữ liệu dòng ----
      if jsonb_typeof(v_row) <> 'object' then
        raise exception 'Dòng %: dữ liệu dòng không hợp lệ', v_n;
      end if;

      v_f := '{}';
      foreach v_k in array c_keys loop
        v_val := v_row -> v_k;
        v_txt := null;
        if v_val is not null and jsonb_typeof(v_val) <> 'null' then
          if jsonb_typeof(v_val) <> 'string' then
            raise exception 'Dòng %: trường "%" phải là chuỗi', v_n, v_k;
          end if;
          v_txt := nullif(btrim(v_val #>> '{}'), '');
        end if;
        v_limit := case v_k
          when 'full_name' then 200
          when 'team' then 200
          when 'email' then 254
          when 'facebook_url' then 500
          else 100
        end;
        if char_length(v_txt) > v_limit then
          raise exception 'Dòng %: trường "%" tối đa % ký tự', v_n, v_k, v_limit;
        end if;
        if v_k = 'email' then
          v_txt := lower(v_txt);
          if v_txt is not null and v_txt !~ c_email_re then
            raise exception 'Dòng %: email không hợp lệ', v_n;
          end if;
        end if;
        if v_k = 'facebook_url' and v_txt is not null and v_txt !~ c_fb_re then
          raise exception 'Dòng %: link Facebook không hợp lệ', v_n;
        end if;
        v_f := v_f || jsonb_build_object(v_k, v_txt);
      end loop;

      v_name := v_f ->> 'full_name';
      v_code := v_f ->> 'student_code';
      v_email := v_f ->> 'email';
      v_class := v_f ->> 'class_name';
      v_phone := v_f ->> 'phone';
      v_fb := v_f ->> 'facebook_url';
      v_title := v_f ->> 'title';
      v_team_name := v_f ->> 'team';

      if v_name is null then
        raise exception 'Dòng %: thiếu họ tên', v_n;
      end if;

      -- ---- Trùng trong chính file ----
      if v_code is not null then
        v_prev := (v_seen_code ->> v_code)::int;
        if v_prev is not null then
          raise exception 'Dòng % trùng với dòng % (MSSV %)', v_n, v_prev, v_code;
        end if;
        v_seen_code := v_seen_code || jsonb_build_object(v_code, v_n);
      end if;
      if v_email is not null then
        v_prev := (v_seen_email ->> v_email)::int;
        if v_prev is not null then
          raise exception 'Dòng % trùng với dòng % (email %)', v_n, v_prev, v_email;
        end if;
        v_seen_email := v_seen_email || jsonb_build_object(v_email, v_n);
      end if;

      -- ---- Ban ----
      v_team_id := null;
      if v_team_name is not null then
        v_team_id := (v_team_cache ->> lower(v_team_name))::uuid;
        if v_team_id is null then
          select t.id into v_team_id
          from public.teams t
          where t.club_id = p_club_id and lower(btrim(t.name)) = lower(v_team_name)
          order by t.created_at, t.id
          limit 1;

          if v_team_id is null then
            raise exception 'Dòng %: ban "%" chưa có trên web. Hãy tạo ban ở mục Quản lí ban hoặc sửa tên trong file.',
              v_n, v_team_name;
          end if;
          v_team_cache := v_team_cache || jsonb_build_object(lower(v_team_name), v_team_id);
        end if;
      end if;

      -- ---- Ghép với thành viên đã có: MSSV trước, rồi email ----
      v_code_id := null;
      v_email_id := null;
      if v_code is not null then
        select m.id into v_code_id
        from public.club_members m
        where m.club_id = p_club_id and m.student_code = v_code;
      end if;
      if v_email is not null then
        select m.id into v_email_id
        from public.club_members m
        where m.club_id = p_club_id and lower(m.email) = v_email;
      end if;

      if v_code_id is not null and v_email_id is not null and v_code_id <> v_email_id then
        raise exception 'Dòng %: MSSV và email thuộc hai thành viên khác nhau trên web', v_n;
      end if;

      if coalesce(v_code_id, v_email_id) is null then
        -- Thêm mới
        insert into public.club_members (
          club_id, team_id, role, is_active, student_code, full_name, class_name,
          email, phone, facebook_url, title
        )
        values (
          p_club_id, v_team_id, 'member', true, v_code, v_name, v_class,
          v_email, v_phone, v_fb, v_title
        );
        v_inserted := v_inserted + 1;
        continue;
      end if;

      -- Cập nhật: chỉ ghi các trường file có giá trị. Không đụng role,
      -- permissions, is_head, user_id, is_active.
      select * into v_m from public.club_members m where m.id = coalesce(v_code_id, v_email_id);

      v_new_email := coalesce(v_email, v_m.email);
      if v_email is not null and lower(v_m.email) = v_email then
        v_new_email := v_m.email;  -- chỉ khác hoa/thường: coi như không đổi
      end if;

      -- Ban: THÊM vào tập, không đổi/gỡ ban cũ. Ban chính chỉ đặt khi đang null.
      -- Ban của Ban chủ nhiệm/Ban chủ chốt: chỉ Chủ nhiệm được thêm; người khác bị bỏ qua.
      v_new_team := coalesce(v_m.team_id, v_team_id);
      v_add_team := v_team_id is not null and not exists (
        select 1 from public.club_member_teams mt
        where mt.member_id = v_m.id and mt.team_id = v_team_id
      );
      v_staff := v_m.role in ('owner', 'admin');
      if v_add_team and v_staff and not v_is_head then
        v_new_team := v_m.team_id;
        v_add_team := false;
        v_staff_skipped := v_staff_skipped + 1;
      end if;

      if not v_add_team
         and (v_name, coalesce(v_code, v_m.student_code), coalesce(v_class, v_m.class_name), v_new_email,
          coalesce(v_phone, v_m.phone), coalesce(v_fb, v_m.facebook_url), coalesce(v_title, v_m.title))
         is not distinct from
         (v_m.full_name, v_m.student_code, v_m.class_name, v_m.email,
          v_m.phone, v_m.facebook_url, v_m.title) then
        v_unchanged := v_unchanged + 1;
        continue;
      end if;

      update public.club_members m
      set full_name = v_name,
          student_code = coalesce(v_code, m.student_code),
          class_name = coalesce(v_class, m.class_name),
          email = v_new_email,
          phone = coalesce(v_phone, m.phone),
          facebook_url = coalesce(v_fb, m.facebook_url),
          title = coalesce(v_title, m.title),
          team_id = v_new_team
      where m.id = v_m.id;
      if v_add_team then
        insert into public.club_member_teams (member_id, team_id)
        values (v_m.id, v_team_id)
        on conflict do nothing;
      end if;
      v_updated := v_updated + 1;
    end loop;
  exception
    when others then
      -- Một khối bắt lỗi cho cả vòng lặp (không savepoint mỗi dòng). Lỗi đã có
      -- số dòng thì giữ nguyên; lỗi từ DB/trigger thì thêm tiền tố "Dòng N: ".
      if v_cur is null or sqlerrm like 'Dòng %' then
        raise;
      end if;
      raise exception 'Dòng %: %', v_cur, sqlerrm;
  end;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'staff_team_skipped', v_staff_skipped
  );
end;
$$;

revoke all on function public.import_members(uuid, jsonb) from public, anon;
grant execute on function public.import_members(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. admit_applications: kết nạp THÊM ban vào tập (kể cả thành viên sẵn có)
-- ---------------------------------------------------------------------------

create or replace function public.admit_applications(p_application_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_app record;
  v_student_code text;
  v_email text;
  v_member_id uuid;
  v_admitted int := 0;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để kết nạp ứng viên';
  end if;

  if p_application_ids is null then
    raise exception 'Danh sách đơn ứng tuyển không hợp lệ';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
  from unnest(p_application_ids) x
  where x is not null;

  if exists (
    select 1
    from public.applications a
    join public.recruitment_campaigns c on c.id = a.campaign_id
    where a.id = any (v_ids)
      and not public.has_club_permission(c.club_id, 'recruitment')
  ) then
    raise exception 'Bạn không có quyền kết nạp ứng viên của CLB này';
  end if;

  for v_app in
    select a.id, a.full_name, a.email, a.phone, a.student_code, a.class_name, a.facebook_url,
           c.club_id, p.team_id
    from public.applications a
    join public.recruitment_campaigns c on c.id = a.campaign_id
    join public.recruitment_positions p on p.id = a.position_id
    where a.id = any (v_ids)
      and a.status = 'passed'
      and a.admitted_member_id is null
    order by a.submitted_at, a.id
    for update of a
  loop
    v_student_code := nullif(btrim(v_app.student_code), '');
    v_email := lower(nullif(btrim(v_app.email), ''));
    v_member_id := null;

    -- Trùng mã sinh viên hoặc email trong CLB thì gắn vào thành viên sẵn có.
    select m.id into v_member_id
    from public.club_members m
    where m.club_id = v_app.club_id
      and ((v_student_code is not null and m.student_code = v_student_code)
        or (v_email is not null and lower(m.email) = v_email))
    order by (m.student_code = v_student_code) desc nulls last, m.created_at
    limit 1;

    if v_member_id is null then
      begin
        insert into public.club_members (
          club_id, team_id, role, student_code, full_name, class_name, email, phone, facebook_url
        )
        values (
          v_app.club_id,
          v_app.team_id,
          'member',
          v_student_code,
          coalesce(nullif(btrim(v_app.full_name), ''), 'Chưa rõ họ tên'),
          nullif(btrim(v_app.class_name), ''),
          v_email,
          nullif(btrim(v_app.phone), ''),
          case when v_app.facebook_url ~ '^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+'
            then v_app.facebook_url end
        )
        returning id into v_member_id;
      exception when unique_violation then
        -- Có phiên khác vừa tạo cùng thành viên: dùng lại.
        select m.id into v_member_id
        from public.club_members m
        where m.club_id = v_app.club_id
          and ((v_student_code is not null and m.student_code = v_student_code)
            or (v_email is not null and lower(m.email) = v_email))
        order by (m.student_code = v_student_code) desc nulls last, m.created_at
        limit 1;
      end;
    end if;

    if v_member_id is null then
      raise exception 'Không thể kết nạp ứng viên: dữ liệu thành viên bị trùng';
    end if;

    -- Đợt 6: ứng viên vào vị trí của một ban thì ban đó được THÊM vào tập ban của thành viên
    -- (kể cả thành viên sẵn có). Ban chính chỉ đặt khi đang null.
    if v_app.team_id is not null then
      insert into public.club_member_teams (member_id, team_id)
      values (v_member_id, v_app.team_id)
      on conflict do nothing;
      update public.club_members m
      set team_id = v_app.team_id
      where m.id = v_member_id and m.team_id is null;
    end if;

    update public.applications a
    set admitted_member_id = v_member_id
    where a.id = v_app.id;

    v_admitted := v_admitted + 1;
  end loop;

  return jsonb_build_object(
    'admitted', v_admitted,
    'skipped', cardinality(v_ids) - v_admitted
  );
end;
$$;

revoke all on function public.admit_applications(uuid[]) from public, anon;
grant execute on function public.admit_applications(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. activate_term: đổi ban theo nhiệm kỳ = chuyển ban (gỡ ban chính cũ khỏi tập)
-- ---------------------------------------------------------------------------

create or replace function public.activate_term(p_term_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term public.club_terms%rowtype;
  v_heads int;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để kích hoạt nhiệm kỳ';
  end if;

  select * into v_term from public.club_terms t where t.id = p_term_id for update;

  if not found or not public.is_club_head(v_term.club_id) then
    raise exception 'Chỉ Chủ nhiệm mới được kích hoạt nhiệm kỳ này';
  end if;

  if v_term.status <> 'draft' then
    raise exception 'Chỉ có thể kích hoạt nhiệm kỳ đang ở trạng thái nháp';
  end if;

  select count(*) into v_heads
  from public.club_term_roles r
  where r.term_id = p_term_id and r.is_head;

  if v_heads <> 1 then
    raise exception 'Nhiệm kỳ phải có đúng một Chủ nhiệm';
  end if;

  if not exists (
    select 1
    from public.club_term_roles r
    join public.club_members m on m.id = r.member_id
    where r.term_id = p_term_id
      and r.is_head
      and r.role = 'owner'
      and m.club_id = v_term.club_id
      and m.is_active
      and m.user_id is not null
  ) then
    raise exception 'Chủ nhiệm phải thuộc Ban chủ nhiệm, đang hoạt động và có tài khoản';
  end if;

  -- 1. Nhiệm kỳ đang hoạt động cũ kết thúc.
  update public.club_terms t
  set status = 'ended',
      end_date = coalesce(t.end_date, current_date)
  where t.club_id = v_term.club_id and t.status = 'active';

  -- 2. Gỡ cờ Chủ nhiệm cũ trước (unique index kiểm tra từng dòng), rồi đưa mọi
  --    thành viên không có trong danh sách về vai trò thành viên, không quyền.
  update public.club_members m
  set is_head = false
  where m.club_id = v_term.club_id and m.is_head;

  update public.club_members m
  set role = 'member', title = null, permissions = '{}', is_head = false
  where m.club_id = v_term.club_id
    and (m.role <> 'member' or m.title is not null or m.permissions <> '{}')
    and not exists (
      select 1 from public.club_term_roles r
      where r.term_id = p_term_id and r.member_id = m.id
    );

  -- 2b. Đợt 6: nhiệm kỳ đổi ban = chuyển ban. Ban chính cũ bị gỡ khỏi tập khi dòng nhiệm kỳ
  --     có ban khác; các ban phụ khác giữ nguyên (ban mới được trigger đồng bộ thêm vào tập).
  delete from public.club_member_teams mt
  using public.club_term_roles r, public.club_members m
  where r.term_id = p_term_id
    and r.member_id = m.id
    and m.club_id = v_term.club_id
    and r.team_id is not null
    and m.team_id is not null
    and r.team_id <> m.team_id
    and mt.member_id = m.id
    and mt.team_id = m.team_id;

  -- 3. Thành viên trong danh sách nhận vai trò, chức danh, ban, quyền, cờ Chủ nhiệm.
  --    Owner có mọi quyền nên không lưu permissions.
  update public.club_members m
  set role = r.role,
      title = r.title,
      team_id = coalesce(r.team_id, m.team_id),
      is_active = true,
      permissions = case when r.role = 'admin' then r.permissions else '{}' end,
      is_head = (r.is_head and r.role = 'owner')
  from public.club_term_roles r
  where r.term_id = p_term_id
    and r.member_id = m.id
    and m.club_id = v_term.club_id;

  -- 4. Kích hoạt nhiệm kỳ mới.
  update public.club_terms t
  set status = 'active',
      activated_at = now(),
      activated_by = auth.uid()
  where t.id = p_term_id;
end;
$$;

revoke all on function public.activate_term(uuid) from public, anon;
grant execute on function public.activate_term(uuid) to authenticated, service_role;

commit;
