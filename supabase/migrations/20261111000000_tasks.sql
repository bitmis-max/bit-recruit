-- Giao việc, nhắc hạn và đóng góp của thành viên.
-- Xem docs/CONTRACT.md (mục 1) và docs/database.md.
--   * clubs.mail_sender_user_id (Gmail dùng để gửi mail nhắc việc; chỉ service-role ghi)
--   * tasks, task_assignees (+ trigger, index, RLS, grant theo cột)
--   * is_task_assignee, task_club_id (hàm phụ chống đệ quy RLS)
--   * create_task, set_my_task_done, club_contribution

begin;

-- ---------------------------------------------------------------------------
-- 1. clubs.mail_sender_user_id
-- ---------------------------------------------------------------------------

alter table public.clubs
  add column mail_sender_user_id uuid references auth.users(id) on delete set null;

-- anon đọc được clubs (policy "public read club overview"), nên cột này (uuid của
-- tài khoản) không được lộ: chỉ cấp select theo cột cho anon/authenticated.
-- Không ai ngoài service_role ghi được clubs.
-- Lưu ý: không dùng select("*") trên clubs ở phía client (sẽ báo thiếu quyền).
revoke all on public.clubs from public, anon, authenticated;
grant select (id, name, description, created_at) on public.clubs to anon, authenticated;
grant all on public.clubs to service_role;

-- ---------------------------------------------------------------------------
-- 2. Bảng
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  description text,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references public.club_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_club_due_idx on public.tasks (club_id, due_at);

create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_id uuid not null references public.club_members(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'missed')),
  completed_at timestamptz,
  note text,
  reminded_before_at timestamptz,
  reminded_overdue_at timestamptz,
  primary key (task_id, member_id)
);

create index task_assignees_member_idx on public.task_assignees (member_id);

-- ---------------------------------------------------------------------------
-- 3. Trigger
-- ---------------------------------------------------------------------------

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- Người nhận phải cùng CLB với việc.
create or replace function public.enforce_task_assignee_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tasks t
    join public.club_members m on m.club_id = t.club_id
    where t.id = new.task_id and m.id = new.member_id
  ) then
    raise exception 'Người nhận phải là thành viên cùng CLB với việc';
  end if;
  return new;
end;
$$;

create trigger task_assignees_club_check
  before insert or update of task_id, member_id on public.task_assignees
  for each row execute function public.enforce_task_assignee_club();

-- completed_at: đặt now() khi chuyển sang 'done', null khi rời 'done'.
-- Khi vẫn ở 'done' thì giữ nguyên giá trị (authenticated không có quyền ghi cột này).
create or replace function public.set_task_assignee_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger task_assignees_completed_at
  before insert or update of status, completed_at on public.task_assignees
  for each row execute function public.set_task_assignee_completed_at();

-- ---------------------------------------------------------------------------
-- 4. Hàm phụ cho RLS (security definer để tránh đệ quy giữa hai bảng)
-- ---------------------------------------------------------------------------

create or replace function public.task_club_id(p_task_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select t.club_id from public.tasks t where t.id = p_task_id;
$$;

-- Người gọi có phải người nhận của việc này không?
create or replace function public.is_task_assignee(p_task_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.task_assignees ta
    join public.club_members m on m.id = ta.member_id
    where ta.task_id = p_task_id
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.task_club_id(uuid) from public, anon;
revoke all on function public.is_task_assignee(uuid) from public, anon;
grant execute on function public.task_club_id(uuid) to authenticated, service_role;
grant execute on function public.is_task_assignee(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS và grant
-- ---------------------------------------------------------------------------

alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;

-- Supabase có thể tự cấp quyền mặc định cho bảng mới: thu hồi rồi cấp lại đúng cột.
revoke all on public.tasks from public, anon, authenticated;
revoke all on public.task_assignees from public, anon, authenticated;

grant select, delete on public.tasks to authenticated;
-- created_by chỉ do create_task ghi.
grant insert (club_id, title, description, due_at) on public.tasks to authenticated;
grant update (title, description, due_at, status) on public.tasks to authenticated;

grant select, delete on public.task_assignees to authenticated;
grant insert (task_id, member_id) on public.task_assignees to authenticated;
-- completed_at do trigger; reminded_* chỉ service-role ghi.
grant update (status, note) on public.task_assignees to authenticated;

grant all on public.tasks to service_role;
grant all on public.task_assignees to service_role;

create policy "admins or assignees read tasks" on public.tasks
  for select to authenticated using (
    public.is_club_admin(club_id) or public.is_task_assignee(id)
  );
create policy "admins insert tasks" on public.tasks
  for insert to authenticated with check (public.is_club_admin(club_id));
create policy "admins update tasks" on public.tasks
  for update to authenticated
  using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));
create policy "admins delete tasks" on public.tasks
  for delete to authenticated using (public.is_club_admin(club_id));

create policy "admins or self read task assignees" on public.task_assignees
  for select to authenticated using (
    public.is_club_admin(public.task_club_id(task_id))
    or exists (
      select 1 from public.club_members m
      where m.id = task_assignees.member_id and m.user_id = auth.uid()
    )
  );
create policy "admins insert task assignees" on public.task_assignees
  for insert to authenticated
  with check (public.is_club_admin(public.task_club_id(task_id)));
create policy "admins update task assignees" on public.task_assignees
  for update to authenticated
  using (public.is_club_admin(public.task_club_id(task_id)))
  with check (public.is_club_admin(public.task_club_id(task_id)));
create policy "admins delete task assignees" on public.task_assignees
  for delete to authenticated
  using (public.is_club_admin(public.task_club_id(task_id)));

-- ---------------------------------------------------------------------------
-- 6. Hàm nghiệp vụ
-- ---------------------------------------------------------------------------

create or replace function public.create_task(
  p_club_id uuid,
  p_title text,
  p_description text,
  p_due_at timestamptz,
  p_member_ids uuid[],
  p_team_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(p_title);
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

  if cardinality(v_ids) = 0 then
    raise exception 'Việc phải có ít nhất một người nhận';
  end if;

  select m.id into v_creator
  from public.club_members m
  where m.club_id = p_club_id and m.user_id = auth.uid() and m.is_active;

  insert into public.tasks (club_id, title, description, due_at, created_by)
  values (p_club_id, v_title, nullif(btrim(p_description), ''), p_due_at, v_creator)
  returning id into v_task_id;

  insert into public.task_assignees (task_id, member_id)
  select v_task_id, x from unnest(v_ids) x;

  return v_task_id;
end;
$$;

revoke all on function public.create_task(uuid, text, text, timestamptz, uuid[], uuid) from public, anon;
grant execute on function public.create_task(uuid, text, text, timestamptz, uuid[], uuid) to authenticated, service_role;

create or replace function public.set_my_task_done(p_task_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_task_status text;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để cập nhật việc';
  end if;

  if p_done is null then
    raise exception 'Trạng thái không hợp lệ';
  end if;

  select ta.status, t.status into v_status, v_task_status
  from public.task_assignees ta
  join public.tasks t on t.id = ta.task_id
  join public.club_members m on m.id = ta.member_id
  where ta.task_id = p_task_id and m.user_id = auth.uid() and m.is_active
  for update of ta;

  if not found then
    raise exception 'Bạn không phải người nhận của việc này';
  end if;

  if v_task_status <> 'open' then
    raise exception 'Việc này đã đóng';
  end if;

  if v_status = 'missed' then
    raise exception 'Việc này đã bị đánh dấu chưa hoàn thành, hãy liên hệ Ban chủ chốt.';
  end if;

  update public.task_assignees ta
  set status = case when p_done then 'done' else 'pending' end
  from public.club_members m
  where ta.task_id = p_task_id
    and m.id = ta.member_id
    and m.user_id = auth.uid()
    and m.is_active;
end;
$$;

revoke all on function public.set_my_task_done(uuid, boolean) from public, anon;
grant execute on function public.set_my_task_done(uuid, boolean) to authenticated, service_role;

create or replace function public.club_contribution(
  p_club_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  member_id uuid,
  full_name text,
  team_id uuid,
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

  return query
  select
    m.id,
    m.full_name,
    m.team_id,
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
  ) x on x.mid = m.id
  where m.club_id = p_club_id
  group by m.id, m.full_name, m.team_id, m.role, m.is_active
  order by m.full_name, m.id;
end;
$$;

revoke all on function public.club_contribution(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.club_contribution(uuid, timestamptz, timestamptz) to authenticated, service_role;

commit;
