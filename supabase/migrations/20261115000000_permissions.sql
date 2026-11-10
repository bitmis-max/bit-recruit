-- Đợt 4: phân quyền theo chức năng + Chủ nhiệm.
-- Xem docs/CONTRACT.md (mục 0, 1) và docs/database.md (mục 5.4).
--   * club_members / club_term_roles: permissions text[], is_head boolean
--   * tasks.team_id (ban sở hữu việc)
--   * is_club_head, has_club_permission, my_club_team (+ can_manage_task, can_manage_task_id)
--   * RLS / storage policy / RPC đổi từ is_club_admin sang quyền chức năng
--   * activate_term, trigger "đúng một Chủ nhiệm", create_task theo ban, club_contribution theo ban
--   * migration dữ liệu: owner sớm nhất -> Chủ nhiệm, admin cũ -> đủ 5 quyền
-- Mã quyền: events, recruitment, members, mail, facebook.

begin;

-- ---------------------------------------------------------------------------
-- 1. Cột, ràng buộc, index
-- ---------------------------------------------------------------------------

alter table public.club_members
  add column permissions text[] not null default '{}',
  add column is_head boolean not null default false;

alter table public.club_members
  add constraint club_members_permissions_valid
  check (permissions <@ array['events', 'recruitment', 'members', 'mail', 'facebook']::text[]);

-- Mỗi CLB có tối đa một Chủ nhiệm.
create unique index club_members_one_head_idx
  on public.club_members (club_id) where is_head;

alter table public.club_term_roles
  add column permissions text[] not null default '{}',
  add column is_head boolean not null default false;

alter table public.club_term_roles
  add constraint club_term_roles_permissions_valid
  check (permissions <@ array['events', 'recruitment', 'members', 'mail', 'facebook']::text[]);

-- Mỗi nhiệm kỳ có tối đa một Chủ nhiệm trong danh sách.
create unique index club_term_roles_one_head_idx
  on public.club_term_roles (term_id) where is_head;

alter table public.tasks
  add column team_id uuid references public.teams(id) on delete set null;

create index tasks_team_idx on public.tasks (team_id) where team_id is not null;
-- Không grant insert/update cột team_id: chỉ create_task ghi.

-- club_term_roles: cấp thêm 2 cột (RLS vẫn chỉ cho Chủ nhiệm ghi, xem mục 4).
grant insert (permissions, is_head) on public.club_term_roles to authenticated;
grant update (permissions, is_head) on public.club_term_roles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Hàm phụ phân quyền
-- ---------------------------------------------------------------------------

create or replace function public.is_club_head(p_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.club_members m
    where m.user_id = auth.uid()
      and m.club_id = p_club_id
      and m.is_active
      and m.role = 'owner'
      and m.is_head
  );
$$;

create or replace function public.has_club_permission(p_club_id uuid, p_permission text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.club_members m
    where m.user_id = auth.uid()
      and m.club_id = p_club_id
      and m.is_active
      and (
        m.role = 'owner'
        or (m.role = 'admin' and p_permission = any (m.permissions))
      )
  );
$$;

create or replace function public.my_club_team(p_club_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select m.team_id
  from public.club_members m
  where m.user_id = auth.uid()
    and m.club_id = p_club_id
    and m.is_active
  limit 1;
$$;

-- Người gọi có được quản lý (đọc, sửa, đóng, xóa) việc này không?
-- owner: mọi việc của CLB. admin: việc của ban mình, cộng việc toàn CLB
-- (team_id null) loại engagement/avatar nếu có quyền 'facebook'.
create or replace function public.can_manage_task(p_club_id uuid, p_team_id uuid, p_kind text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_club_owner(p_club_id)
    or (
      public.is_club_admin(p_club_id)
      and (
        (p_team_id is not null and p_team_id = public.my_club_team(p_club_id))
        or (
          p_team_id is null
          and p_kind in ('engagement', 'avatar')
          and public.has_club_permission(p_club_id, 'facebook')
        )
      )
    );
$$;

create or replace function public.can_manage_task_id(p_task_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select public.can_manage_task(t.club_id, t.team_id, t.kind)
    from public.tasks t
    where t.id = p_task_id
  ), false);
$$;

revoke all on function public.is_club_head(uuid) from public, anon;
revoke all on function public.has_club_permission(uuid, text) from public, anon;
revoke all on function public.my_club_team(uuid) from public, anon;
revoke all on function public.can_manage_task(uuid, uuid, text) from public, anon;
revoke all on function public.can_manage_task_id(uuid) from public, anon;
grant execute on function public.is_club_head(uuid) to authenticated, service_role;
grant execute on function public.has_club_permission(uuid, text) to authenticated, service_role;
grant execute on function public.my_club_team(uuid) to authenticated, service_role;
grant execute on function public.can_manage_task(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.can_manage_task_id(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Trigger "CLB phải còn đúng một Chủ nhiệm"
-- ---------------------------------------------------------------------------
-- Thay trigger cũ "còn ít nhất một owner có tài khoản". Tối đa một Chủ nhiệm đã
-- do unique index lo; trigger (deferred, kiểm tra lúc commit) đảm bảo còn ít
-- nhất một. Đặt trước migration dữ liệu để không có sự kiện trigger chờ khi
-- sửa bảng.

drop trigger club_members_keep_owner on public.club_members;

create or replace function public.enforce_club_has_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- CLB đã bị xóa (xóa cascade) thì không cần kiểm tra.
  if exists (select 1 from public.clubs c where c.id = old.club_id)
    and not exists (
      select 1 from public.club_members m
      where m.club_id = old.club_id
        and m.is_head
        and m.role = 'owner'
        and m.is_active
        and m.user_id is not null
    ) then
    raise exception 'CLB phải còn đúng một Chủ nhiệm (thuộc Ban chủ nhiệm) đang hoạt động và có tài khoản.';
  end if;
  return null;
end;
$$;

-- Chỉ xếp lịch kiểm tra khi dòng cũ là Chủ nhiệm đang hoạt động có tài khoản.
create constraint trigger club_members_keep_owner
  after update or delete on public.club_members
  deferrable initially deferred
  for each row
  when (old.is_head and old.is_active and old.user_id is not null)
  execute function public.enforce_club_has_owner();

revoke all on function public.enforce_club_has_owner() from public, anon, authenticated;
grant execute on function public.enforce_club_has_owner() to service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS: nhiệm kỳ (ghi chỉ Chủ nhiệm)
-- ---------------------------------------------------------------------------

drop policy "owners insert draft club terms" on public.club_terms;
drop policy "owners update draft club terms" on public.club_terms;
drop policy "owners delete draft club terms" on public.club_terms;
create policy "owners insert draft club terms" on public.club_terms
  for insert to authenticated
  with check (status = 'draft' and public.is_club_head(club_id));
create policy "owners update draft club terms" on public.club_terms
  for update to authenticated
  using (status = 'draft' and public.is_club_head(club_id))
  with check (status = 'draft' and public.is_club_head(club_id));
create policy "owners delete draft club terms" on public.club_terms
  for delete to authenticated
  using (status = 'draft' and public.is_club_head(club_id));

drop policy "owners insert draft club term roles" on public.club_term_roles;
drop policy "owners update draft club term roles" on public.club_term_roles;
drop policy "owners delete draft club term roles" on public.club_term_roles;
create policy "owners insert draft club term roles" on public.club_term_roles
  for insert to authenticated with check (
    exists (
      select 1 from public.club_terms t
      where t.id = club_term_roles.term_id
        and t.status = 'draft'
        and public.is_club_head(t.club_id)
    )
  );
create policy "owners update draft club term roles" on public.club_term_roles
  for update to authenticated
  using (
    exists (
      select 1 from public.club_terms t
      where t.id = club_term_roles.term_id
        and t.status = 'draft'
        and public.is_club_head(t.club_id)
    )
  )
  with check (
    exists (
      select 1 from public.club_terms t
      where t.id = club_term_roles.term_id
        and t.status = 'draft'
        and public.is_club_head(t.club_id)
    )
  );
create policy "owners delete draft club term roles" on public.club_term_roles
  for delete to authenticated using (
    exists (
      select 1 from public.club_terms t
      where t.id = club_term_roles.term_id
        and t.status = 'draft'
        and public.is_club_head(t.club_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 5. RLS: ban (members), tuyển thành viên (recruitment)
-- ---------------------------------------------------------------------------

drop policy "admin manage teams" on public.teams;
create policy "admin manage teams" on public.teams
  for all to authenticated
  using (public.has_club_permission(club_id, 'members'))
  with check (public.has_club_permission(club_id, 'members'));

drop policy "admin write campaigns" on public.recruitment_campaigns;
create policy "admin write campaigns" on public.recruitment_campaigns
  for all to authenticated
  using (public.has_club_permission(club_id, 'recruitment'))
  with check (public.has_club_permission(club_id, 'recruitment'));

drop policy "admin write positions" on public.recruitment_positions;
create policy "admin write positions" on public.recruitment_positions
  for all to authenticated
  using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = recruitment_positions.campaign_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  ) with check (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = recruitment_positions.campaign_id
        and public.has_club_permission(c.club_id, 'recruitment')
        and public.team_belongs_to_club(recruitment_positions.team_id, c.club_id)
    )
  );

-- Mẫu biểu mẫu dùng chung toàn hệ thống: owner, hoặc admin có quyền
-- 'recruitment' ở ít nhất một CLB.
drop policy "admins read form templates" on public.form_templates;
drop policy "admins manage form templates" on public.form_templates;
drop policy "admins read form template questions" on public.form_template_questions;
drop policy "admins manage form template questions" on public.form_template_questions;

create policy "admins read form templates" on public.form_templates
  for select to authenticated using (
    exists (
      select 1 from public.club_members m
      where m.user_id = auth.uid() and m.is_active
        and (m.role = 'owner' or (m.role = 'admin' and 'recruitment' = any (m.permissions)))
    )
  );
create policy "admins manage form templates" on public.form_templates
  for all to authenticated
  using (exists (
    select 1 from public.club_members m
    where m.user_id = auth.uid() and m.is_active
      and (m.role = 'owner' or (m.role = 'admin' and 'recruitment' = any (m.permissions)))
  ))
  with check (exists (
    select 1 from public.club_members m
    where m.user_id = auth.uid() and m.is_active
      and (m.role = 'owner' or (m.role = 'admin' and 'recruitment' = any (m.permissions)))
  ));
create policy "admins read form template questions" on public.form_template_questions
  for select to authenticated using (
    exists (
      select 1 from public.form_templates t
      where t.id = template_id
        and exists (
          select 1 from public.club_members m
          where m.user_id = auth.uid() and m.is_active
            and (m.role = 'owner' or (m.role = 'admin' and 'recruitment' = any (m.permissions)))
        )
    )
  );
create policy "admins manage form template questions" on public.form_template_questions
  for all to authenticated
  using (
    exists (
      select 1 from public.form_templates t
      where t.id = template_id
        and exists (
          select 1 from public.club_members m
          where m.user_id = auth.uid() and m.is_active
            and (m.role = 'owner' or (m.role = 'admin' and 'recruitment' = any (m.permissions)))
        )
    )
  )
  with check (
    exists (
      select 1 from public.form_templates t
      where t.id = template_id
        and exists (
          select 1 from public.club_members m
          where m.user_id = auth.uid() and m.is_active
            and (m.role = 'owner' or (m.role = 'admin' and 'recruitment' = any (m.permissions)))
        )
    )
  );

drop policy "admin write application forms" on public.application_forms;
create policy "admin write application forms" on public.application_forms
  for all to authenticated
  using (
    exists (
      select 1 from public.recruitment_positions p
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  )
  with check (
    exists (
      select 1 from public.recruitment_positions p
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  );

drop policy "admin write form questions" on public.form_questions;
create policy "admin write form questions" on public.form_questions
  for all to authenticated
  using (
    exists (
      select 1 from public.application_forms f
      join public.recruitment_positions p on p.id = f.position_id
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  )
  with check (
    exists (
      select 1 from public.application_forms f
      join public.recruitment_positions p on p.id = f.position_id
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  );

drop policy "admins read applications" on public.applications;
drop policy "admin update applications" on public.applications;
create policy "admins read applications" on public.applications
  for select to authenticated using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = applications.campaign_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  );
create policy "admin update applications" on public.applications
  for update to authenticated
  using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = applications.campaign_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  )
  with check (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = applications.campaign_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  );

drop policy "admins read application answers" on public.application_answers;
create policy "admins read application answers" on public.application_answers
  for select to authenticated using (
    exists (
      select 1 from public.applications a
      join public.recruitment_campaigns c on c.id = a.campaign_id
      where a.id = application_answers.application_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  );

drop policy "admin insert interview sessions" on public.interview_sessions;
drop policy "admin update interview sessions" on public.interview_sessions;
create policy "admin insert interview sessions" on public.interview_sessions
  for insert to authenticated with check (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = interview_sessions.campaign_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  );
create policy "admin update interview sessions" on public.interview_sessions
  for update to authenticated
  using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = interview_sessions.campaign_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  )
  with check (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = interview_sessions.campaign_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  );
-- "admin delete empty interview sessions" gọi can_delete_empty_interview_session (đổi ở mục 9).

drop policy "admins read interview assignments" on public.interview_assignments;
drop policy "admin manage interview assignments" on public.interview_assignments;
create policy "admins read interview assignments" on public.interview_assignments
  for select to authenticated using (
    exists (
      select 1 from public.interview_sessions s
      join public.recruitment_campaigns c on c.id = s.campaign_id
      where s.id = interview_assignments.session_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  );
create policy "admin manage interview assignments" on public.interview_assignments
  for all to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      join public.recruitment_campaigns c on c.id = s.campaign_id
      where s.id = interview_assignments.session_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  )
  with check (
    exists (
      select 1 from public.interview_sessions s
      join public.recruitment_campaigns c on c.id = s.campaign_id
      where s.id = interview_assignments.session_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  );

drop policy "admin manage interview session members" on public.interview_session_members;
create policy "admin manage interview session members" on public.interview_session_members
  for all to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      join public.recruitment_campaigns c on c.id = s.campaign_id
      where s.id = interview_session_members.session_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  )
  with check (
    exists (
      select 1 from public.interview_sessions s
      join public.recruitment_campaigns c on c.id = s.campaign_id
      where s.id = interview_session_members.session_id
        and public.has_club_permission(c.club_id, 'recruitment')
    )
  );

-- ---------------------------------------------------------------------------
-- 6. RLS: Facebook (facebook)
-- ---------------------------------------------------------------------------

drop policy "admins read facebook aliases" on public.member_facebook_aliases;
drop policy "admins insert facebook aliases" on public.member_facebook_aliases;
drop policy "admins delete facebook aliases" on public.member_facebook_aliases;
create policy "admins read facebook aliases" on public.member_facebook_aliases
  for select to authenticated using (public.has_club_permission(club_id, 'facebook'));
create policy "admins insert facebook aliases" on public.member_facebook_aliases
  for insert to authenticated with check (public.has_club_permission(club_id, 'facebook'));
create policy "admins delete facebook aliases" on public.member_facebook_aliases
  for delete to authenticated using (public.has_club_permission(club_id, 'facebook'));

-- ---------------------------------------------------------------------------
-- 7. RLS: giao việc theo ban
-- ---------------------------------------------------------------------------

-- Được thêm người này làm người nhận của việc không? owner: bất kỳ; admin: người nhận
-- phải thuộc ban của mình, trừ việc toàn CLB loại engagement/avatar (chỉ cần cùng CLB,
-- đã có trigger enforce_task_assignee_club).
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
          or m.team_id = public.my_club_team(t.club_id)
        )
    );
$$;

revoke all on function public.can_assign_task_member(uuid, uuid) from public, anon;
grant execute on function public.can_assign_task_member(uuid, uuid) to authenticated, service_role;

drop policy "admins or assignees read tasks" on public.tasks;
drop policy "admins insert tasks" on public.tasks;
drop policy "admins update tasks" on public.tasks;
drop policy "admins delete tasks" on public.tasks;
create policy "admins or assignees read tasks" on public.tasks
  for select to authenticated using (
    public.can_manage_task(club_id, team_id, kind) or public.is_task_assignee(id)
  );
create policy "admins insert tasks" on public.tasks
  for insert to authenticated with check (public.can_manage_task(club_id, team_id, kind));
create policy "admins update tasks" on public.tasks
  for update to authenticated
  using (public.can_manage_task(club_id, team_id, kind))
  with check (public.can_manage_task(club_id, team_id, kind));
create policy "admins delete tasks" on public.tasks
  for delete to authenticated using (public.can_manage_task(club_id, team_id, kind));

drop policy "admins or self read task assignees" on public.task_assignees;
drop policy "admins insert task assignees" on public.task_assignees;
drop policy "admins update task assignees" on public.task_assignees;
drop policy "admins delete task assignees" on public.task_assignees;
create policy "admins or self read task assignees" on public.task_assignees
  for select to authenticated using (
    public.can_manage_task_id(task_id)
    or exists (
      select 1 from public.club_members m
      where m.id = task_assignees.member_id and m.user_id = auth.uid()
    )
  );
create policy "admins insert task assignees" on public.task_assignees
  for insert to authenticated
  with check (public.can_assign_task_member(task_id, member_id));
create policy "admins update task assignees" on public.task_assignees
  for update to authenticated
  using (public.can_manage_task_id(task_id))
  with check (public.can_manage_task_id(task_id));
create policy "admins delete task assignees" on public.task_assignees
  for delete to authenticated
  using (public.can_manage_task_id(task_id));

-- ---------------------------------------------------------------------------
-- 8. Storage: ảnh sự kiện (events), ảnh ban (members). Lưu ý: trong subquery
--    trên clubs, "name" trần là clubs.name nên phải viết objects.name (lỗi của policy cũ).
-- ---------------------------------------------------------------------------

drop policy "club admins upload team images" on storage.objects;
drop policy "club admins update team images" on storage.objects;
drop policy "club admins delete team images" on storage.objects;
create policy "club admins upload team images" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'team-images'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(objects.name))[1]
        and public.has_club_permission(c.id, 'members')
    )
  );
create policy "club admins update team images" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'team-images'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(objects.name))[1]
        and public.has_club_permission(c.id, 'members')
    )
  )
  with check (
    bucket_id = 'team-images'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(objects.name))[1]
        and public.has_club_permission(c.id, 'members')
    )
  );
create policy "club admins delete team images" on storage.objects
  for delete to authenticated using (
    bucket_id = 'team-images'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(objects.name))[1]
        and public.has_club_permission(c.id, 'members')
    )
  );

drop policy "club admins upload event images" on storage.objects;
drop policy "club admins delete event images" on storage.objects;
create policy "club admins upload event images" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'event-images'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(objects.name))[1]
        and public.has_club_permission(c.id, 'events')
    )
  );
create policy "club admins delete event images" on storage.objects
  for delete to authenticated using (
    bucket_id = 'event-images'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(objects.name))[1]
        and public.has_club_permission(c.id, 'events')
    )
  );

-- ---------------------------------------------------------------------------
-- 9. Hàm nghiệp vụ đổi sang quyền chức năng (thân hàm copy từ migration gần
--    nhất, chỉ đổi dòng kiểm tra quyền)
-- ---------------------------------------------------------------------------

create or replace function public.create_application_form_from_template(
  p_position_id uuid,
  p_template_id uuid,
  p_name text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_form_id uuid;
  v_form jsonb;
  v_questions jsonb;
  v_next_order int;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để tạo biểu mẫu';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Tên biểu mẫu không được để trống';
  end if;

  select c.club_id into v_club_id
  from public.recruitment_positions p
  join public.recruitment_campaigns c on c.id = p.campaign_id
  where p.id = p_position_id;

  if v_club_id is null or not public.has_club_permission(v_club_id, 'recruitment') then
    raise exception 'Bạn không có quyền tạo biểu mẫu cho vị trí này';
  end if;

  if not exists (select 1 from public.form_templates t where t.id = p_template_id) then
    raise exception 'Template không tồn tại hoặc bạn không có quyền truy cập';
  end if;

  insert into public.application_forms (position_id, source_template_id, name, description)
  values (p_position_id, p_template_id, btrim(p_name), nullif(btrim(p_description), ''))
  returning id into v_form_id;

  insert into public.form_questions (
    form_id, question_text, question_type, field_key, options, is_required, order_index
  )
  select
    v_form_id, q.question_text, q.question_type, q.field_key, q.options, q.is_required,
    row_number() over (order by q.order_index, q.created_at, q.id)::int - 1
  from public.form_template_questions q
  where q.template_id = p_template_id
    and lower(btrim(q.question_text)) <> lower('Thời gian có thể tham gia phỏng vấn')
  order by q.order_index, q.created_at, q.id;

  select coalesce(max(q.order_index) + 1, 0) into v_next_order
  from public.form_questions q where q.form_id = v_form_id;

  insert into public.form_questions (
    form_id, question_text, question_type, field_key, is_required, order_index
  )
  values (
    v_form_id, 'Thời gian có thể tham gia phỏng vấn', 'long_text', null, true, v_next_order
  );

  select to_jsonb(f) into v_form
  from public.application_forms f where f.id = v_form_id;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.order_index, q.id), '[]'::jsonb)
  into v_questions
  from public.form_questions q where q.form_id = v_form_id;

  return jsonb_build_object('form', v_form, 'questions', v_questions);
end;
$$;

create or replace function public.save_application_form_questions(
  p_form_id uuid,
  p_questions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_question_count bigint;
  v_payload_count bigint;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để lưu biểu mẫu';
  end if;

  select c.club_id into v_club_id
  from public.application_forms f
  join public.recruitment_positions p on p.id = f.position_id
  join public.recruitment_campaigns c on c.id = p.campaign_id
  where f.id = p_form_id;

  if v_club_id is null or not public.has_club_permission(v_club_id, 'recruitment') then
    raise exception 'Bạn không có quyền chỉnh sửa biểu mẫu này';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'Danh sách câu hỏi không hợp lệ';
  end if;

  select count(*) into v_question_count
  from public.form_questions q where q.form_id = p_form_id;
  select count(*) into v_payload_count from jsonb_array_elements(p_questions);

  if v_payload_count <> v_question_count then
    raise exception 'Danh sách câu hỏi đã thay đổi. Hãy tải lại biểu mẫu rồi thử lại';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_questions) as item(
      id uuid, question_text text, question_type public.question_type,
      options jsonb, is_required boolean, order_index integer
    )
    group by item.id having count(*) > 1
  ) then
    raise exception 'Danh sách có câu hỏi trùng lặp';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_questions) as item(
      id uuid, question_text text, question_type public.question_type,
      options jsonb, is_required boolean, order_index integer
    )
    group by item.order_index having count(*) > 1
  ) then
    raise exception 'Thứ tự câu hỏi không hợp lệ';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_questions) as item(
      id uuid, question_text text, question_type public.question_type,
      options jsonb, is_required boolean, order_index integer
    )
    left join public.form_questions q on q.id = item.id and q.form_id = p_form_id
    where q.id is null
       or nullif(btrim(item.question_text), '') is null
       or item.order_index < 0
       or (item.question_type in ('single_choice', 'multi_choice')
           and (coalesce(jsonb_typeof(item.options), 'null') <> 'array' or jsonb_array_length(coalesce(item.options, '[]'::jsonb)) < 2))
  ) then
    raise exception 'Một hoặc nhiều câu hỏi không hợp lệ';
  end if;

  update public.form_questions q
  set question_text = btrim(item.question_text),
      question_type = item.question_type,
      options = case when item.question_type in ('single_choice', 'multi_choice') then item.options else null end,
      is_required = item.is_required,
      order_index = item.order_index
  from jsonb_to_recordset(p_questions) as item(
    id uuid, question_text text, question_type public.question_type,
    options jsonb, is_required boolean, order_index integer
  )
  where q.id = item.id and q.form_id = p_form_id;
end;
$$;

create or replace function public.can_delete_empty_interview_session(p_session_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.interview_sessions s
    join public.recruitment_campaigns c on c.id = s.campaign_id
    where s.id = p_session_id
      and public.has_club_permission(c.club_id, 'recruitment')
      and not exists (
        select 1 from public.interview_assignments a where a.session_id = s.id
      )
      and not exists (
        select 1 from public.interview_session_members m where m.session_id = s.id
      )
  );
$$;

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

create or replace function public.import_applications(
  p_campaign_id uuid,
  p_form_name text,
  p_form_description text,
  p_questions text[],
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_rows constant int := 2000;
  c_max_questions constant int := 100;
  c_max_cells constant int := 20000;     -- số dòng x số câu hỏi riêng
  c_avail constant text := 'Thời gian có thể tham gia phỏng vấn';
  c_email_re constant text := '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$';  -- như submit_application
  c_keys constant text[] := array[
    'position', 'session', 'full_name', 'email', 'phone', 'student_code', 'class_name'
  ];

  v_club_id uuid;
  v_status public.campaign_status;
  v_template_id uuid;
  v_form_is_new boolean;
  v_next_order int;
  v_cur int;                 -- số dòng đang xử lý (cho tiền tố "Dòng N: ")
  v_form_name text := coalesce(nullif(btrim(p_form_name), ''), 'Biểu mẫu import');
  v_form_desc text := nullif(btrim(p_form_description), '');

  v_qs text[] := '{}';       -- tiêu đề câu hỏi (đã trim)
  v_qlow text[] := '{}';     -- bản viết thường để so khớp
  v_q text;
  v_i int;

  v_total int;
  v_n int;
  v_row jsonb;
  v_f jsonb;
  v_k text;
  v_val jsonb;
  v_txt text;
  v_limit int;

  v_pos_name text;
  v_sess_name text;
  v_email text;
  v_pos_id uuid;
  v_form_id uuid;
  v_sess_id uuid;
  v_app_id uuid;
  v_qid uuid;

  v_answers jsonb;
  v_ans_key text;
  v_ans_val jsonb;
  v_ans_text text;

  -- cache trong một lần gọi
  v_pos_cache jsonb := '{}';    -- tên vị trí -> position_id
  v_form_cache jsonb := '{}';   -- position_id -> form_id
  v_qmap jsonb := '{}';         -- form_id -> { câu hỏi viết thường -> question_id }
  v_sess_cache jsonb := '{}';   -- position_id|ca -> session_id
  v_fmap jsonb;

  v_imported int := 0;
  v_skipped int := 0;
  v_pos_created int := 0;
  v_form_created int := 0;
  v_sess_created int := 0;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để import ứng viên';
  end if;

  if p_campaign_id is null then
    raise exception 'Vui lòng chọn đợt tuyển để import';
  end if;

  select c.club_id, c.status into v_club_id, v_status
  from public.recruitment_campaigns c
  where c.id = p_campaign_id;

  if v_club_id is null then
    raise exception 'Không tìm thấy đợt tuyển';
  end if;

  if not public.has_club_permission(v_club_id, 'recruitment') then
    raise exception 'Bạn không có quyền import ứng viên cho đợt tuyển này';
  end if;

  if char_length(v_form_name) > 200 then
    raise exception 'Tên biểu mẫu tối đa 200 ký tự';
  end if;
  if char_length(v_form_desc) > 2000 then
    raise exception 'Mô tả biểu mẫu tối đa 2000 ký tự';
  end if;

  -- Câu hỏi riêng: trim, bỏ rỗng, không trùng (không phân biệt hoa thường).
  foreach v_q in array coalesce(p_questions, '{}') loop
    v_q := nullif(btrim(v_q), '');
    if v_q is null then
      continue;
    end if;
    if char_length(v_q) > 500 then
      raise exception 'Mỗi câu hỏi tối đa 500 ký tự';
    end if;
    if lower(v_q) = lower(c_avail) then
      raise exception 'Không thể dùng "%" làm câu hỏi riêng vì biểu mẫu đã có sẵn câu hỏi này', c_avail;
    end if;
    if lower(v_q) = any (v_qlow) then
      raise exception 'Câu hỏi bị trùng: %', v_q;
    end if;
    v_qs := v_qs || v_q;
    v_qlow := v_qlow || lower(v_q);
  end loop;

  if coalesce(array_length(v_qs, 1), 0) > c_max_questions then
    raise exception 'Tối đa % câu hỏi riêng mỗi lần import', c_max_questions;
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

  if v_total * coalesce(array_length(v_qs, 1), 0) > c_max_cells then
    raise exception 'Quá nhiều dữ liệu: số dòng x số câu hỏi riêng không được vượt quá % (hiện là % x %)',
      c_max_cells, v_total, coalesce(array_length(v_qs, 1), 0);
  end if;

  -- Hai lần import cùng đợt tuyển không chạy đồng thời (tránh tạo trùng vị trí/form/ca).
  perform pg_advisory_xact_lock(hashtextextended('import_applications:' || p_campaign_id::text, 0));

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
      v_limit := case when v_k in ('position', 'session') then 200 else 500 end;
      if char_length(v_txt) > v_limit then
        raise exception 'Dòng %: trường "%" tối đa % ký tự', v_n, v_k, v_limit;
      end if;
      if v_k = 'email' then
        v_txt := lower(v_txt);
        if v_txt is not null and v_txt !~ c_email_re then
          raise exception 'Dòng %: email không hợp lệ', v_n;
        end if;
      end if;
      v_f := v_f || jsonb_build_object(v_k, v_txt);
    end loop;

    v_pos_name := v_f ->> 'position';
    v_sess_name := v_f ->> 'session';
    v_email := v_f ->> 'email';

    if v_pos_name is null then
      raise exception 'Dòng %: thiếu vị trí tuyển', v_n;
    end if;

    v_answers := v_row -> 'answers';
    if v_answers is not null and jsonb_typeof(v_answers) not in ('object', 'null') then
      raise exception 'Dòng %: câu trả lời phải là một đối tượng', v_n;
    end if;
    if v_answers is not null and jsonb_typeof(v_answers) = 'object' then
      for v_ans_key, v_ans_val in select * from jsonb_each(v_answers) loop
        if array_position(v_qlow, lower(btrim(v_ans_key))) is null then
          raise exception 'Dòng %: câu hỏi "%" không có trong danh sách câu hỏi riêng', v_n, v_ans_key;
        end if;
        if jsonb_typeof(v_ans_val) not in ('string', 'null') then
          raise exception 'Dòng %: câu trả lời cho "%" phải là chuỗi', v_n, v_ans_key;
        end if;
        if char_length(v_ans_val #>> '{}') > 10000 then
          raise exception 'Dòng %: câu trả lời cho "%" tối đa 10000 ký tự', v_n, v_ans_key;
        end if;
      end loop;
    else
      v_answers := '{}';
    end if;

    -- ---- Ghi dữ liệu dòng ----
      -- Vị trí
      v_pos_id := (v_pos_cache ->> lower(v_pos_name))::uuid;
      if v_pos_id is null then
        select p.id into v_pos_id
        from public.recruitment_positions p
        where p.campaign_id = p_campaign_id and lower(btrim(p.name)) = lower(v_pos_name)
        order by p.created_at, p.id
        limit 1;

        if v_pos_id is null then
          insert into public.recruitment_positions (campaign_id, name)
          values (p_campaign_id, v_pos_name)
          returning id into v_pos_id;
          v_pos_created := v_pos_created + 1;
        end if;
        v_pos_cache := v_pos_cache || jsonb_build_object(lower(v_pos_name), v_pos_id);
      end if;

      -- Đơn trùng (position_id, email): bỏ qua cả dòng (trùng trong file cũng
      -- bị bắt ở đây vì dòng trước đã được thêm).
      if v_email is not null and exists (
        select 1 from public.applications a
        where a.position_id = v_pos_id and a.email = v_email
      ) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      -- Form của vị trí + các câu hỏi riêng (chỉ làm một lần cho mỗi vị trí)
      v_form_id := (v_form_cache ->> v_pos_id::text)::uuid;
      if v_form_id is null then
        select f.id into v_form_id
        from public.application_forms f
        where f.position_id = v_pos_id;

        v_form_is_new := v_form_id is null;
        if v_form_is_new then
          -- Form mới: chép mẫu mặc định như create_application_form_from_template
          -- (câu hỏi mẫu kể cả field_key, rồi câu hỏi chọn ca). Không có mẫu mặc
          -- định thì form trống.
          select t.id into v_template_id from public.form_templates t where t.is_default limit 1;

          insert into public.application_forms (position_id, source_template_id, name, description)
          values (v_pos_id, v_template_id, v_form_name, v_form_desc)
          returning id into v_form_id;
          v_form_created := v_form_created + 1;

          if v_template_id is not null then
            insert into public.form_questions (
              form_id, question_text, question_type, field_key, options, is_required, order_index
            )
            select
              v_form_id, q.question_text, q.question_type, q.field_key, q.options, q.is_required,
              row_number() over (order by q.order_index, q.created_at, q.id)::int - 1
            from public.form_template_questions q
            where q.template_id = v_template_id
              and lower(btrim(q.question_text)) <> lower(c_avail);

            select coalesce(max(q.order_index) + 1, 0) into v_next_order
            from public.form_questions q where q.form_id = v_form_id;

            insert into public.form_questions (
              form_id, question_text, question_type, field_key, is_required, order_index
            )
            values (v_form_id, c_avail, 'long_text', null, true, v_next_order);
          end if;
        end if;
        v_form_cache := v_form_cache || jsonb_build_object(v_pos_id::text, v_form_id);

        v_fmap := '{}';
        for v_i in 1..coalesce(array_length(v_qs, 1), 0) loop
          select q.id into v_qid
          from public.form_questions q
          where q.form_id = v_form_id
            and q.field_key is null
            and lower(btrim(q.question_text)) = v_qlow[v_i]
          order by q.order_index, q.created_at, q.id
          limit 1;

          if v_qid is null then
            if not v_form_is_new and v_status = 'open' then
              raise exception 'Đợt tuyển đang mở: không thể thêm câu hỏi mới vào biểu mẫu đang nhận đơn của vị trí "%". Hãy đóng đợt tuyển trước hoặc bỏ các cột câu hỏi riêng chưa có trong biểu mẫu.', v_pos_name;
            end if;
            insert into public.form_questions (form_id, question_text, question_type, is_required, order_index)
            select v_form_id, v_qs[v_i], 'text', false, coalesce(max(q.order_index) + 1, 0)
            from public.form_questions q
            where q.form_id = v_form_id
            returning id into v_qid;
          end if;
          v_fmap := v_fmap || jsonb_build_object(v_qlow[v_i], v_qid);
        end loop;
        v_qmap := v_qmap || jsonb_build_object(v_form_id::text, v_fmap);
      end if;

      -- Đơn ứng tuyển
      insert into public.applications (
        campaign_id, position_id, full_name, email, phone, student_code, class_name
      )
      values (
        p_campaign_id, v_pos_id,
        v_f ->> 'full_name', v_email, v_f ->> 'phone', v_f ->> 'student_code', v_f ->> 'class_name'
      )
      returning id into v_app_id;

      -- Câu trả lời
      for v_ans_key, v_ans_val in select * from jsonb_each(v_answers) loop
        v_ans_text := nullif(btrim(v_ans_val #>> '{}'), '');
        if v_ans_text is null then
          continue;
        end if;
        v_qid := ((v_qmap -> v_form_id::text) ->> lower(btrim(v_ans_key)))::uuid;
        insert into public.application_answers (application_id, question_id, answer_text)
        values (v_app_id, v_qid, v_ans_text)
        on conflict (application_id, question_id) do nothing;
      end loop;

      -- Ca phỏng vấn + gán ca
      if v_sess_name is not null then
        v_sess_id := (v_sess_cache ->> (v_pos_id::text || '|' || v_sess_name))::uuid;
        if v_sess_id is null then
          select s.id into v_sess_id
          from public.interview_sessions s
          where s.campaign_id = p_campaign_id
            and s.position_id = v_pos_id
            and s.note = v_sess_name
          order by s.created_at, s.id
          limit 1;

          if v_sess_id is null then
            insert into public.interview_sessions (campaign_id, position_id, round, start_time, end_time, note)
            values (p_campaign_id, v_pos_id, 1, now(), now() + interval '1 hour', v_sess_name)
            returning id into v_sess_id;
            v_sess_created := v_sess_created + 1;
          end if;
          v_sess_cache := v_sess_cache || jsonb_build_object(v_pos_id::text || '|' || v_sess_name, v_sess_id);
        end if;

        insert into public.interview_assignments (application_id, session_id)
        values (v_app_id, v_sess_id);
      end if;

      v_imported := v_imported + 1;
  end loop;
  exception
    when others then
      -- Một khối bắt lỗi cho cả vòng lặp (không savepoint mỗi dòng). Lỗi đã có
      -- số dòng hoặc là lỗi đợt đang mở thì giữ nguyên; lỗi từ DB/trigger thì
      -- thêm tiền tố "Dòng N: ".
      if v_cur is null or sqlerrm like 'Dòng %' or sqlerrm like 'Đợt tuyển đang mở%' then
        raise;
      end if;
      raise exception 'Dòng %: %', v_cur, sqlerrm;
  end;

  return jsonb_build_object(
    'imported', v_imported,
    'skipped_duplicates', v_skipped,
    'positions_created', v_pos_created,
    'forms_created', v_form_created,
    'sessions_created', v_sess_created
  );
end;
$$;

create or replace function public.apply_task_scan(p_task_id uuid, p_member_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_status text;
  v_team_id uuid;
  v_kind text;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để cập nhật việc';
  end if;

  select t.club_id, t.status, t.team_id, t.kind into v_club_id, v_status, v_team_id, v_kind
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    raise exception 'Không tìm thấy việc';
  end if;

  -- Cần quyền 'facebook' VÀ được quản lý việc này (admin: việc của ban mình hoặc
  -- việc engagement/avatar toàn CLB; không đụng việc ban khác / việc general toàn CLB).
  if not public.has_club_permission(v_club_id, 'facebook')
     or not public.can_manage_task(v_club_id, v_team_id, v_kind) then
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


-- ---------------------------------------------------------------------------
-- 10. activate_term: chỉ Chủ nhiệm; đúng một Chủ nhiệm; chép quyền chức năng
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

-- ---------------------------------------------------------------------------
-- 11. create_task: giao việc theo ban
-- ---------------------------------------------------------------------------
-- owner: như cũ (tasks.team_id = p_team_id). admin: chỉ giao trong ban của mình;
-- p_all_members chỉ khi p_kind là engagement/avatar và có quyền 'facebook'.

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
          select 1 from public.club_members m
          where m.id = x and m.team_id = v_my_team
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

  insert into public.tasks (club_id, title, description, due_at, created_by, kind, post_url, frame_id, team_id)
  values (p_club_id, v_title, nullif(btrim(p_description), ''), p_due_at, v_creator,
          v_kind, v_post_url, p_frame_id, v_task_team)
  returning id into v_task_id;

  insert into public.task_assignees (task_id, member_id)
  select v_task_id, x from unnest(v_ids) x;

  return v_task_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. club_contribution: Ban chủ chốt chỉ xem thành viên trong ban mình
-- ---------------------------------------------------------------------------

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
    -- owner: cả CLB; admin: chỉ thành viên cùng ban (không có ban thì không có dòng nào).
    and (v_owner or (v_team is not null and m.team_id = v_team))
  group by m.id, m.full_name, m.team_id, m.role, m.is_active
  order by m.full_name, m.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Migration dữ liệu
-- ---------------------------------------------------------------------------

-- Owner đang hoạt động có tài khoản, tạo sớm nhất mỗi CLB, thành Chủ nhiệm.
update public.club_members m
set is_head = true
from (
  select distinct on (o.club_id) o.id
  from public.club_members o
  where o.role = 'owner' and o.is_active and o.user_id is not null
  order by o.club_id, o.created_at, o.id
) h
where m.id = h.id;

-- Mọi admin hiện có nhận đủ 5 quyền (giữ hành vi cũ).
update public.club_members
set permissions = array['events', 'recruitment', 'members', 'mail', 'facebook']
where role = 'admin';

-- Danh sách nhiệm kỳ cũ: admin nhận đủ 5 quyền; owner là Chủ nhiệm hiện tại của
-- CLB (nhiệm kỳ đang hoạt động và các bản nháp) được đánh dấu Chủ nhiệm, để bản
-- nháp cũ kích hoạt được mà không phải sửa tay.
update public.club_term_roles
set permissions = array['events', 'recruitment', 'members', 'mail', 'facebook']
where role = 'admin';

update public.club_term_roles r
set is_head = true
from public.club_terms t, public.club_members m
where t.id = r.term_id
  and t.status in ('active', 'draft')
  and r.role = 'owner'
  and m.id = r.member_id
  and m.club_id = t.club_id
  and m.is_head;

-- Không áp migration lên DB còn CLB không có Chủ nhiệm: lỗi thì rollback toàn bộ,
-- không im lặng khóa CLB (không ai kích hoạt được nhiệm kỳ).
do $$
declare
  v_missing text;
begin
  select string_agg(c.name || ' (' || c.id || ')', ', ' order by c.name) into v_missing
  from public.clubs c
  -- CLB chưa có thành viên nào (vd. CLB seed trên DB mới) chưa bị khóa: bootstrap owner sau (README).
  where exists (select 1 from public.club_members x where x.club_id = c.id)
    and not exists (
      select 1 from public.club_members m
      where m.club_id = c.id and m.is_head
    );

  if v_missing is not null then
    raise exception 'Không thể áp migration phân quyền: CLB sau chưa có Chủ nhiệm: %. Hãy gắn tài khoản (user_id) cho một thành viên Ban chủ nhiệm (role owner, đang hoạt động) của mỗi CLB trước khi áp migration.', v_missing;
  end if;
end $$;

commit;
