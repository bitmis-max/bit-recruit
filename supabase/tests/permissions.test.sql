-- pgTAP: phân quyền theo chức năng + Chủ nhiệm (Đợt 4). Theo docs/CONTRACT.md mục 1 và 4.
-- Chạy: npx supabase test db   (cần npx supabase db reset để áp migration 20261115000000_permissions.sql)
begin;
select plan(317);

-- ---------------------------------------------------------------------------
-- Helper (mất khi rollback)
-- ---------------------------------------------------------------------------
create function public.tap_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

-- u('e3') = 00000000-0000-0000-0000-0000000000e3 (id rút gọn cho dễ đọc)
create function public.u(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid
$$;
grant execute on function public.u(text) to authenticated, anon;

-- Chạy một câu lệnh ghi và trả số dòng bị tác động (RLS ẩn dòng thì trả 0, không lỗi)
create function public.tap_rows(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.tap_rows(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Dữ liệu nền (quyền postgres)
-- ---------------------------------------------------------------------------
-- a1 Chủ nhiệm, a2 Phó chủ nhiệm (owner không is_head), a3 admin{events} ban d1, a4 admin{recruitment} d1,
-- a5 admin{members} d2, a6 admin{mail} không ban, a7 admin{facebook} d1, a8 admin{} d1, a9 member d1,
-- a10 admin đủ quyền nhưng ĐÃ NGHỈ, a11 owner đã nghỉ. b1 Chủ nhiệm CLB B, b2 member CLB B.
insert into auth.users (id, email, aud, role)
select public.u(x), x || '@bit.test', 'authenticated', 'authenticated'
from unnest(array['a1','a2','a3','a4','a5','a6','a7','a8','a9','a10','a11','b1','b2']) x;

insert into public.clubs (id, name) values (public.u('c1'), 'CLB A'), (public.u('c2'), 'CLB B');
insert into public.teams (id, club_id, name) values
  (public.u('d1'), public.u('c1'), 'Ban Truyền thông'),
  (public.u('d2'), public.u('c1'), 'Ban Chuyên môn'),
  (public.u('d3'), public.u('c2'), 'Ban của CLB B');

insert into public.club_members (id, club_id, user_id, team_id, role, full_name, is_active, student_code, permissions, is_head) values
  (public.u('e1'),  public.u('c1'), public.u('a1'),  null,          'owner',  'Chủ nhiệm',      true,  'E1',  '{}', true),
  (public.u('e2'),  public.u('c1'), public.u('a2'),  null,          'owner',  'Phó chủ nhiệm',  true,  'E2',  '{}', false),
  (public.u('e3'),  public.u('c1'), public.u('a3'),  public.u('d1'), 'admin', 'Admin events',  true,  'E3',  array['events'], false),
  (public.u('e4'),  public.u('c1'), public.u('a4'),  public.u('d1'), 'admin', 'Admin recruit', true,  'E4',  array['recruitment'], false),
  (public.u('e5'),  public.u('c1'), public.u('a5'),  public.u('d2'), 'admin', 'Admin members', true,  'E5',  array['members'], false),
  (public.u('e6'),  public.u('c1'), public.u('a6'),  null,          'admin',  'Admin mail',     true,  'E6',  array['mail'], false),
  (public.u('e7'),  public.u('c1'), public.u('a7'),  public.u('d1'), 'admin', 'Admin facebook', true,  'E7',  array['facebook'], false),
  (public.u('e8'),  public.u('c1'), public.u('a8'),  public.u('d1'), 'admin', 'Admin trống',   true,  'E8',  '{}', false),
  (public.u('e9'),  public.u('c1'), public.u('a9'),  public.u('d1'), 'member', 'Member',        true,  'E9',  '{}', false),
  (public.u('ea'),  public.u('c1'), public.u('a10'), null,          'admin',  'Admin đã nghỉ',  false, 'E10', array['events','recruitment','members','mail','facebook'], false),
  (public.u('aa01'), public.u('c1'), null, public.u('d1'), 'member', 'Ban viên d1 A', true, 'G1', '{}', false),
  (public.u('aa02'), public.u('c1'), null, public.u('d1'), 'member', 'Ban viên d1 B', true, 'G2', '{}', false),
  (public.u('aa03'), public.u('c1'), null, public.u('d2'), 'member', 'Ban viên d2',   true, 'G3', '{}', false),
  (public.u('aa04'), public.u('c1'), null, null,          'member', 'Không ban',      true, 'G4', '{}', false),
  (public.u('aa05'), public.u('c1'), null, null,          'owner',  'Owner không TK', true, 'G5', '{}', false),
  (public.u('aa06'), public.u('c1'), public.u('a11'), null, 'owner', 'Owner đã nghỉ', false, 'G6', '{}', false),
  (public.u('f1'),  public.u('c2'), public.u('b1'),  null,          'owner',  'Chủ nhiệm B',    true,  'F1',  '{}', true),
  (public.u('f2'),  public.u('c2'), public.u('b2'),  public.u('d3'), 'member', 'Member B',      true,  'F2',  '{}', false);

-- ===========================================================================
-- 0. Cột, ràng buộc, hàm phụ
-- ===========================================================================
select is((select permissions from public.club_members where id = public.u('e9')), '{}'::text[], 'club_members.permissions mặc định rỗng');
select is(
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'club_members' and column_name = 'is_head'),
  'false', 'club_members.is_head mặc định false');
select throws_ok(
  $$update public.club_members set permissions = array['events', 'bogus'] where id = public.u('e3')$$,
  '23514', null, 'club_members.permissions chứa mã lạ bị chặn (check)');
select lives_ok(
  $$update public.club_members set permissions = array['events', 'recruitment', 'members', 'mail', 'facebook'] where id = public.u('e8')$$,
  'club_members.permissions nhận đủ 5 mã');
update public.club_members set permissions = '{}' where id = public.u('e8');
select throws_ok(
  $$update public.club_members set is_head = true where id = public.u('e2')$$,
  '23505', null, 'unique một phần: CLB không thể có 2 Chủ nhiệm');
select throws_ok(
  $$update public.club_members set is_head = true where id = public.u('f2')$$,
  '23505', null, 'unique một phần: CLB B (đã có f1 là Chủ nhiệm) cũng không thể có 2 Chủ nhiệm');

select is((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'team_id')::int, 1, 'tasks.team_id tồn tại');

-- is_club_head
select public.tap_as(public.u('a1'));
select is(public.is_club_head(public.u('c1')), true, 'is_club_head: Chủ nhiệm = true');
select is(public.is_club_head(public.u('c2')), false, 'is_club_head: CLB khác = false');
reset role;
select public.tap_as(public.u('a2'));
select is(public.is_club_head(public.u('c1')), false, 'is_club_head: Phó chủ nhiệm (owner không is_head) = false');
select is(public.has_club_permission(public.u('c1'), 'recruitment'), true, 'has_club_permission: owner có mọi quyền (recruitment)');
select is(public.has_club_permission(public.u('c1'), 'facebook'), true, 'has_club_permission: owner có mọi quyền (facebook)');
reset role;
select public.tap_as(public.u('a3'));
select is(public.is_club_head(public.u('c1')), false, 'is_club_head: admin = false');
select is(public.has_club_permission(public.u('c1'), 'events'), true, 'has_club_permission: admin có events');
select is(public.has_club_permission(public.u('c1'), 'recruitment'), false, 'has_club_permission: admin events không có recruitment');
select is(public.has_club_permission(public.u('c2'), 'events'), false, 'has_club_permission: CLB khác = false');
select is(public.is_club_admin(public.u('c1')), true, 'is_club_admin vẫn true với admin');
select is(public.my_club_team(public.u('c1')), public.u('d1'), 'my_club_team: trả ban của mình');
select is(public.my_club_team(public.u('c2')), null, 'my_club_team: CLB khác = null');
reset role;
select public.tap_as(public.u('a8'));
select is(public.has_club_permission(public.u('c1'), 'events'), false, 'has_club_permission: admin không quyền nào = false');
select is(public.is_club_admin(public.u('c1')), true, 'is_club_admin: admin không quyền vẫn true (đọc chung)');
reset role;
select public.tap_as(public.u('a6'));
select is(public.my_club_team(public.u('c1')), null, 'my_club_team: admin không ban = null');
reset role;
select public.tap_as(public.u('a9'));
select is(public.has_club_permission(public.u('c1'), 'events'), false, 'has_club_permission: member = false');
select is(public.is_club_head(public.u('c1')), false, 'is_club_head: member = false');
select is(public.is_club_admin(public.u('c1')), false, 'is_club_admin: member = false');
reset role;
select public.tap_as(public.u('a10'));
select is(public.has_club_permission(public.u('c1'), 'events'), false, 'has_club_permission: admin đã nghỉ (is_active=false) = false');
reset role;
select public.tap_as(public.u('a11'));
select is(public.has_club_permission(public.u('c1'), 'events'), false, 'has_club_permission: owner đã nghỉ = false');
reset role;
select public.tap_as(public.u('b1'));
select is(public.has_club_permission(public.u('c1'), 'events'), false, 'has_club_permission: owner CLB khác không có quyền ở CLB A');
select is(public.is_club_head(public.u('c1')), false, 'is_club_head: Chủ nhiệm CLB khác không phải Chủ nhiệm CLB A');
reset role;

set local role anon;
select throws_ok($$select public.is_club_head(public.u('c1'))$$, '42501', null, 'anon không execute được is_club_head');
select throws_ok($$select public.has_club_permission(public.u('c1'), 'events')$$, '42501', null, 'anon không execute được has_club_permission');
select throws_ok($$select public.my_club_team(public.u('c1'))$$, '42501', null, 'anon không execute được my_club_team');
reset role;

-- ===========================================================================
-- 1. recruitment: đọc / ghi đơn, vị trí, biểu mẫu, ca
-- ===========================================================================
insert into public.recruitment_campaigns (id, club_id, name, status) values
  (public.u('c91'), public.u('c1'), 'Gen 17', 'open'),
  (public.u('c92'), public.u('c1'), 'Gen 18 nháp', 'draft'),
  (public.u('c93'), public.u('c2'), 'Gen B', 'open');
insert into public.recruitment_positions (id, campaign_id, team_id, name) values
  (public.u('a91'), public.u('c91'), public.u('d1'), 'Thành viên Truyền thông'),
  (public.u('a92'), public.u('c92'), null, 'Vị trí chưa có form'),
  (public.u('a93'), public.u('c93'), null, 'Vị trí CLB B');
insert into public.application_forms (id, position_id, name) values (public.u('f91'), public.u('a91'), 'Form TT');
insert into public.form_questions (id, form_id, question_text, question_type, field_key, is_required, order_index) values
  (public.u('91'), public.u('f91'), 'Họ tên', 'text', 'full_name', true, 0),
  (public.u('92'), public.u('f91'), 'Email', 'text', 'email', true, 1);
insert into public.applications (id, campaign_id, position_id, full_name, email, status) values
  (public.u('aa91'), public.u('c91'), public.u('a91'), 'Ứng viên 1', 'p1@test.local', 'passed'),
  (public.u('aa92'), public.u('c91'), public.u('a91'), 'Ứng viên 2', 'p2@test.local', 'submitted'),
  (public.u('aa93'), public.u('c93'), public.u('a93'), 'Ứng viên CLB B', 'pb@test.local', 'submitted');
insert into public.interview_sessions (id, campaign_id, position_id, start_time, end_time) values
  (public.u('b91'), public.u('c91'), public.u('a91'), now() + interval '1 day', now() + interval '1 day 1 hour'),
  (public.u('b92'), public.u('c91'), public.u('a91'), now() + interval '2 days', now() + interval '2 days 1 hour'),
  (public.u('b93'), public.u('c91'), public.u('a91'), now() + interval '3 days', now() + interval '3 days 1 hour');
insert into public.interview_assignments (application_id, session_id) values (public.u('aa91'), public.u('b92'));
-- Đợt 7: trigger tự thêm câu hỏi ca phỏng vấn khi tạo ca; bỏ đi để các test form bên dưới giữ nguyên bối cảnh 2 câu.
delete from public.form_questions where form_id = public.u('f91') and question_text = 'Thời gian có thể tham gia phỏng vấn';
insert into public.application_answers (application_id, question_id, answer_text) values (public.u('aa91'), public.u('92'), 'x@y.z');
insert into public.form_templates (id, name, is_default) values (public.u('7001'), 'Mẫu quyền', false);
insert into public.form_template_questions (template_id, question_text, question_type, order_index) values
  (public.u('7001'), 'Vì sao bạn muốn tham gia?', 'long_text', 0);

-- 1a. Đọc: chỉ owner và admin có recruitment
select public.tap_as(public.u('a4'));
select is((select count(*) from public.applications)::int, 2, 'recruitment: admin đọc được applications của CLB mình (2)');
select is((select count(*) from public.application_answers)::int, 1, 'recruitment: admin đọc được application_answers');
select is((select count(*) from public.interview_assignments)::int, 1, 'recruitment: admin đọc được interview_assignments');
reset role;
select public.tap_as(public.u('a2'));
select is((select count(*) from public.applications)::int, 2, 'owner đọc được applications (2, không thấy CLB B)');
select is((select count(*) from public.interview_assignments)::int, 1, 'owner đọc được interview_assignments');
reset role;
select public.tap_as(public.u('b1'));
select is((select count(*) from public.applications)::int, 1, 'owner CLB B chỉ đọc applications của CLB B');
reset role;

select public.tap_as(public.u('a3'));
select is((select count(*) from public.applications)::int, 0, 'admin chỉ có events KHÔNG đọc được applications');
select is((select count(*) from public.application_answers)::int, 0, 'admin chỉ có events KHÔNG đọc được application_answers');
select is((select count(*) from public.interview_assignments)::int, 0, 'admin chỉ có events KHÔNG đọc được interview_assignments');
reset role;
select public.tap_as(public.u('a5'));
select is((select count(*) from public.applications)::int, 0, 'admin chỉ có members KHÔNG đọc được applications');
reset role;
select public.tap_as(public.u('a6'));
select is((select count(*) from public.applications)::int, 0, 'admin chỉ có mail KHÔNG đọc được applications');
reset role;
select public.tap_as(public.u('a7'));
select is((select count(*) from public.applications)::int, 0, 'admin chỉ có facebook KHÔNG đọc được applications');
reset role;
select public.tap_as(public.u('a8'));
select is((select count(*) from public.applications)::int, 0, 'admin không có quyền nào KHÔNG đọc được applications');
select is((select count(*) from public.club_members where club_id = public.u('c1'))::int, 16, 'admin không quyền vẫn đọc được danh sách thành viên (is_club_admin)');
reset role;
select public.tap_as(public.u('a10'));
select is((select count(*) from public.applications)::int, 0, 'admin đã nghỉ (đủ quyền) KHÔNG đọc được applications');
reset role;
select public.tap_as(public.u('a9'));
select is((select count(*) from public.applications)::int, 0, 'member KHÔNG đọc được applications');
reset role;

-- 1b. Ghi: admin events không ghi được phần tuyển sinh
select public.tap_as(public.u('a3'));
select throws_ok(
  $$insert into public.recruitment_positions (campaign_id, name) values (public.u('c91'), 'Lậu')$$,
  '42501', null, 'admin chỉ có events KHÔNG insert được vị trí');
select throws_ok(
  $$insert into public.recruitment_campaigns (club_id, name) values (public.u('c1'), 'Đợt lậu')$$,
  '42501', null, 'admin chỉ có events KHÔNG insert được đợt tuyển');
select throws_ok(
  $$insert into public.interview_sessions (campaign_id, position_id, start_time, end_time) values (public.u('c91'), public.u('a91'), now(), now() + interval '1 hour')$$,
  '42501', null, 'admin chỉ có events KHÔNG insert được ca phỏng vấn');
select throws_ok(
  $$insert into public.application_forms (position_id, name) values (public.u('a92'), 'Form lậu')$$,
  '42501', null, 'admin chỉ có events KHÔNG insert được biểu mẫu');
select throws_ok(
  $$insert into public.form_questions (form_id, question_text, order_index) values (public.u('f91'), 'Câu lậu', 9)$$,
  '42501', null, 'admin chỉ có events KHÔNG insert được câu hỏi');
select is(public.tap_rows($$update public.recruitment_positions set name = 'Sửa lậu' where id = public.u('a91')$$), 0, 'admin chỉ có events KHÔNG sửa được vị trí (0 dòng)');
select is(public.tap_rows($$update public.recruitment_campaigns set name = 'Sửa lậu' where id = public.u('c91')$$), 0, 'admin chỉ có events KHÔNG sửa được đợt tuyển (0 dòng)');
select is(public.tap_rows($$update public.applications set status = 'screening' where id = public.u('aa92')$$), 0, 'admin chỉ có events KHÔNG đổi được applications.status (0 dòng)');
select is(public.tap_rows($$delete from public.interview_sessions where id = public.u('b91')$$), 0, 'admin chỉ có events KHÔNG xóa được ca phỏng vấn');
select is(public.can_delete_empty_interview_session(public.u('b91')), false, 'can_delete_empty_interview_session: admin events = false');
select throws_ok(
  $$insert into public.interview_session_members (session_id, member_id) values (public.u('b93'), public.u('e9'))$$,
  '42501', null, 'admin chỉ có events KHÔNG thêm được thành viên hỗ trợ ca');
reset role;
select is((select name from public.recruitment_positions where id = public.u('a91')), 'Thành viên Truyền thông', 'vị trí không bị đổi');
select is((select status::text from public.applications where id = public.u('aa92')), 'submitted', 'applications.status không bị đổi');

-- 1c. admin recruitment ghi được
select public.tap_as(public.u('a4'));
select lives_ok(
  $$insert into public.recruitment_campaigns (id, club_id, name) values (public.u('c94'), public.u('c1'), 'Đợt do recruitment tạo')$$,
  'admin recruitment insert được đợt tuyển');
select lives_ok(
  $$insert into public.recruitment_positions (id, campaign_id, name) values (public.u('a94'), public.u('c94'), 'Vị trí mới')$$,
  'admin recruitment insert được vị trí');
select is(public.tap_rows($$update public.recruitment_positions set name = 'Vị trí đổi tên' where id = public.u('a94')$$), 1, 'admin recruitment sửa được vị trí');
select lives_ok(
  $$insert into public.application_forms (id, position_id, name) values (public.u('f94'), public.u('a94'), 'Form mới')$$,
  'admin recruitment insert được biểu mẫu');
select lives_ok(
  $$insert into public.form_questions (form_id, question_text, order_index) values (public.u('f94'), 'Câu mới', 0)$$,
  'admin recruitment insert được câu hỏi');
select is(public.tap_rows($$update public.applications set status = 'screening' where id = public.u('aa92')$$), 1, 'admin recruitment đổi được applications.status');
select lives_ok(
  $$insert into public.interview_sessions (id, campaign_id, position_id, start_time, end_time) values (public.u('b94'), public.u('c91'), public.u('a91'), now() + interval '4 days', now() + interval '4 days 1 hour')$$,
  'admin recruitment insert được ca phỏng vấn');
select is(public.can_delete_empty_interview_session(public.u('b94')), true, 'can_delete_empty_interview_session: admin recruitment, ca trống = true');
select is(public.can_delete_empty_interview_session(public.u('b92')), false, 'can_delete_empty_interview_session: ca đã có đơn = false');
select is(public.tap_rows($$delete from public.interview_sessions where id = public.u('b94')$$), 1, 'admin recruitment xóa được ca trống');
select lives_ok(
  $$insert into public.interview_session_members (session_id, member_id) values (public.u('b93'), public.u('e9'))$$,
  'admin recruitment thêm được thành viên hỗ trợ ca');
select lives_ok(
  $$insert into public.interview_assignments (application_id, session_id) values (public.u('aa92'), public.u('b93'))$$,
  'admin recruitment xếp được ca cho đơn');
select is(public.tap_rows($$delete from public.interview_assignments where application_id = public.u('aa92')$$), 1, 'admin recruitment gỡ được xếp ca');
select throws_ok(
  $$insert into public.recruitment_positions (campaign_id, name) values (public.u('c93'), 'Sang CLB B')$$,
  '42501', null, 'admin recruitment CLB A KHÔNG insert được vị trí vào đợt của CLB B');
select is(public.tap_rows($$update public.applications set status = 'screening' where id = public.u('aa93')$$), 0, 'admin recruitment CLB A KHÔNG đổi được đơn của CLB B');
reset role;

-- 1d. Admin recruitment không sửa được sự kiện (ảnh sự kiện: policy storage theo quyền events)
select public.tap_as(public.u('a4'));
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('event-images', public.u('c1')::text || '/recruit.png')$$,
  '42501', null, 'admin chỉ có recruitment KHÔNG upload được ảnh sự kiện');
reset role;

-- 1e. Mẫu biểu mẫu dùng chung: người có recruitment (ở ít nhất một CLB) hoặc owner
select public.tap_as(public.u('a4'));
select is((select count(*) from public.form_templates where id = public.u('7001'))::int, 1, 'admin recruitment đọc được mẫu biểu mẫu');
select is((select count(*) from public.form_template_questions where template_id = public.u('7001'))::int, 1, 'admin recruitment đọc được câu hỏi mẫu');
select lives_ok(
  $$insert into public.form_templates (id, name) values (public.u('7002'), 'Mẫu do recruitment tạo')$$,
  'admin recruitment tạo được mẫu biểu mẫu');
reset role;
select public.tap_as(public.u('a2'));
select is((select count(*) from public.form_templates where id = public.u('7001'))::int, 1, 'owner đọc được mẫu biểu mẫu');
select lives_ok(
  $$insert into public.form_templates (id, name) values (public.u('7003'), 'Mẫu do owner tạo')$$,
  'owner tạo được mẫu biểu mẫu');
reset role;
select public.tap_as(public.u('a3'));
select is((select count(*) from public.form_templates)::int, 0, 'admin chỉ có events KHÔNG đọc được mẫu biểu mẫu');
select is((select count(*) from public.form_template_questions)::int, 0, 'admin chỉ có events KHÔNG đọc được câu hỏi mẫu');
select throws_ok(
  $$insert into public.form_templates (name) values ('Mẫu lậu')$$,
  '42501', null, 'admin chỉ có events KHÔNG tạo được mẫu biểu mẫu');
select is(public.tap_rows($$update public.form_templates set name = 'Sửa lậu' where id = public.u('7001')$$), 0, 'admin chỉ có events KHÔNG sửa được mẫu biểu mẫu');
reset role;
select public.tap_as(public.u('a5'));
select is((select count(*) from public.form_templates)::int, 0, 'admin chỉ có members KHÔNG đọc được mẫu biểu mẫu');
reset role;
select public.tap_as(public.u('a8'));
select is((select count(*) from public.form_templates)::int, 0, 'admin không quyền nào KHÔNG đọc được mẫu biểu mẫu');
reset role;
select public.tap_as(public.u('a9'));
select is((select count(*) from public.form_templates)::int, 0, 'member KHÔNG đọc được mẫu biểu mẫu');
reset role;

-- 1f. RPC biểu mẫu
-- Đợt 7: ca phỏng vấn thêm ở test trước đã kích trigger thêm câu hỏi; bỏ đi để payload 2 câu bên dưới khớp.
delete from public.form_questions where form_id = public.u('f91') and question_text = 'Thời gian có thể tham gia phỏng vấn';
select public.tap_as(public.u('a3'));
select throws_like(
  $$select public.create_application_form_from_template(public.u('a92'), public.u('7001'), 'Form từ mẫu')$$, '%',
  'create_application_form_from_template: admin chỉ có events bị chặn');
select throws_like(
  $$select public.save_application_form_questions(public.u('f91'),
      jsonb_build_array(jsonb_build_object('id', public.u('91'), 'question_text', 'Họ tên', 'question_type', 'text', 'is_required', true, 'order_index', 0),
                        jsonb_build_object('id', public.u('92'), 'question_text', 'Email', 'question_type', 'text', 'is_required', true, 'order_index', 1)))$$, '%',
  'save_application_form_questions: admin chỉ có events bị chặn');
reset role;
select public.tap_as(public.u('a4'));
select lives_ok(
  $$select public.create_application_form_from_template(public.u('a92'), public.u('7001'), 'Form từ mẫu')$$,
  'create_application_form_from_template: admin recruitment tạo được');
select lives_ok(
  $$select public.save_application_form_questions(public.u('f91'),
      jsonb_build_array(jsonb_build_object('id', public.u('91'), 'question_text', 'Họ tên đổi', 'question_type', 'text', 'is_required', true, 'order_index', 0),
                        jsonb_build_object('id', public.u('92'), 'question_text', 'Email', 'question_type', 'text', 'is_required', true, 'order_index', 1)))$$,
  'save_application_form_questions: admin recruitment lưu được');
reset role;
select is((select question_text from public.form_questions where id = public.u('91')), 'Họ tên đổi', 'save_application_form_questions đã ghi');

-- ===========================================================================
-- 2. members: bảng teams
-- ===========================================================================
select public.tap_as(public.u('a5'));
select lives_ok(
  $$insert into public.teams (id, club_id, name) values (public.u('d9'), public.u('c1'), 'Ban do members tạo')$$,
  'admin members insert được ban');
select is(public.tap_rows($$update public.teams set name = 'Ban đổi tên' where id = public.u('d9')$$), 1, 'admin members sửa được ban');
select is(public.tap_rows($$delete from public.teams where id = public.u('d9')$$), 1, 'admin members xóa được ban');
select throws_ok(
  $$insert into public.teams (club_id, name) values (public.u('c2'), 'Ban CLB khác')$$,
  '42501', null, 'admin members CLB A KHÔNG insert được ban của CLB B');
reset role;
select public.tap_as(public.u('a2'));
select lives_ok(
  $$insert into public.teams (club_id, name) values (public.u('c1'), 'Ban do owner tạo')$$,
  'owner insert được ban');
reset role;
-- admin có quyền khác (kể cả không có quyền nào) không ghi được teams
select public.tap_as(public.u('a3'));
select throws_ok($$insert into public.teams (club_id, name) values (public.u('c1'), 'Lậu events')$$, '42501', null, 'admin chỉ có events KHÔNG insert được ban');
select is(public.tap_rows($$update public.teams set name = 'Sửa lậu' where id = public.u('d1')$$), 0, 'admin chỉ có events KHÔNG sửa được ban');
reset role;
select public.tap_as(public.u('a4'));
select throws_ok($$insert into public.teams (club_id, name) values (public.u('c1'), 'Lậu recruitment')$$, '42501', null, 'admin chỉ có recruitment KHÔNG insert được ban');
reset role;
select public.tap_as(public.u('a7'));
select is(public.tap_rows($$delete from public.teams where id = public.u('d1')$$), 0, 'admin chỉ có facebook KHÔNG xóa được ban');
reset role;
select public.tap_as(public.u('a8'));
select throws_ok($$insert into public.teams (club_id, name) values (public.u('c1'), 'Lậu trống')$$, '42501', null, 'admin không quyền nào KHÔNG insert được ban');
reset role;
select public.tap_as(public.u('a9'));
select throws_ok($$insert into public.teams (club_id, name) values (public.u('c1'), 'Lậu member')$$, '42501', null, 'member KHÔNG insert được ban');
reset role;
select is((select count(*) from public.teams where club_id = public.u('c1') and name like 'Lậu%')::int, 0, 'không có ban lậu nào được tạo');

-- ===========================================================================
-- 3. facebook: alias và apply_task_scan
-- ===========================================================================
insert into public.tasks (id, club_id, title, due_at, kind, post_url) values
  (public.u('e001'), public.u('c1'), 'Scan quyền', now() + interval '10 days', 'engagement', 'https://www.facebook.com/groups/1/posts/2');
insert into public.task_assignees (task_id, member_id) values
  (public.u('e001'), public.u('aa01')), (public.u('e001'), public.u('aa02')), (public.u('e001'), public.u('aa03'));

select public.tap_as(public.u('a7'));
select lives_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values (public.u('c1'), 'u:fb.quyen', public.u('aa01'))$$,
  'admin facebook insert được alias');
select is((select count(*) from public.member_facebook_aliases where club_id = public.u('c1'))::int, 1, 'admin facebook đọc được alias');
select is(public.apply_task_scan(public.u('e001'), array[public.u('aa01')]), 1, 'apply_task_scan: admin facebook quét được');
reset role;
select is((select status from public.task_assignees where task_id = public.u('e001') and member_id = public.u('aa01')), 'done', 'apply_task_scan của admin facebook đã đổi trạng thái');

select public.tap_as(public.u('a3'));
select is((select count(*) from public.member_facebook_aliases)::int, 0, 'admin chỉ có events KHÔNG đọc được alias');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values (public.u('c1'), 'u:lau.events', public.u('aa01'))$$,
  '42501', null, 'admin chỉ có events KHÔNG insert được alias');
select is(public.tap_rows($$delete from public.member_facebook_aliases where fb_key = 'u:fb.quyen'$$), 0, 'admin chỉ có events KHÔNG xóa được alias');
select throws_like(
  $$select public.apply_task_scan(public.u('e001'), array[public.u('aa02')])$$, '%',
  'apply_task_scan: admin chỉ có events bị chặn');
reset role;
select public.tap_as(public.u('a4'));
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values (public.u('c1'), 'u:lau.recruit', public.u('aa01'))$$,
  '42501', null, 'admin chỉ có recruitment KHÔNG insert được alias');
select throws_like(
  $$select public.apply_task_scan(public.u('e001'), array[public.u('aa02')])$$, '%',
  'apply_task_scan: admin chỉ có recruitment bị chặn');
reset role;
select public.tap_as(public.u('a5'));
select throws_like(
  $$select public.apply_task_scan(public.u('e001'), array[public.u('aa02')])$$, '%',
  'apply_task_scan: admin chỉ có members bị chặn');
reset role;
select public.tap_as(public.u('a8'));
select throws_like(
  $$select public.apply_task_scan(public.u('e001'), array[public.u('aa02')])$$, '%',
  'apply_task_scan: admin không quyền nào bị chặn');
reset role;
select is((select status from public.task_assignees where task_id = public.u('e001') and member_id = public.u('aa02')), 'pending', 'các lần quét bị chặn không đổi dữ liệu');

-- apply_task_scan theo phạm vi việc: admin facebook chỉ quét việc engagement/avatar toàn CLB, không quét việc thường của ban khác
insert into public.tasks (id, club_id, team_id, title, due_at, kind) values
  (public.u('e002'), public.u('c1'), public.u('d2'), 'Scan general ban d2', now() + interval '10 days', 'general'),
  (public.u('e003'), public.u('c1'), null,          'Scan general toàn CLB', now() + interval '10 days', 'general'),
  (public.u('e004'), public.u('c1'), null,          'Scan avatar toàn CLB', now() + interval '10 days', 'avatar');
insert into public.task_assignees (task_id, member_id) values
  (public.u('e002'), public.u('aa03')), (public.u('e003'), public.u('aa04')), (public.u('e004'), public.u('aa04'));
select public.tap_as(public.u('a7'));
select throws_like(
  $$select public.apply_task_scan(public.u('e002'), array[public.u('aa03')])$$, '%',
  'apply_task_scan: admin facebook KHÔNG quét được việc thường của ban khác');
select throws_like(
  $$select public.apply_task_scan(public.u('e003'), array[public.u('aa04')])$$, '%',
  'apply_task_scan: admin facebook KHÔNG quét được việc thường toàn CLB');
reset role;
select is((select status from public.task_assignees where task_id = public.u('e002') and member_id = public.u('aa03')), 'pending', 'quét việc ban khác bị chặn: dòng không đổi');
select is((select status from public.task_assignees where task_id = public.u('e003') and member_id = public.u('aa04')), 'pending', 'quét việc thường toàn CLB bị chặn: dòng không đổi');
select public.tap_as(public.u('a7'));
select is(public.apply_task_scan(public.u('e004'), array[public.u('aa04')]), 1, 'apply_task_scan: admin facebook quét được việc avatar toàn CLB');
reset role;
select public.tap_as(public.u('a2'));
select is(public.apply_task_scan(public.u('e002'), array[public.u('aa03')]), 1, 'apply_task_scan: owner quét được việc thường của ban bất kỳ');
reset role;

select public.tap_as(public.u('a2'));
select lives_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values (public.u('c1'), 'u:fb.owner', public.u('aa02'))$$,
  'owner insert được alias');
select is(public.apply_task_scan(public.u('e001'), array[public.u('aa02')]), 1, 'apply_task_scan: owner quét được');
reset role;
select public.tap_as(public.u('a7'));
select is(public.tap_rows($$delete from public.member_facebook_aliases where fb_key = 'u:fb.quyen'$$), 1, 'admin facebook xóa được alias');
reset role;

-- ===========================================================================
-- 4. events: ảnh sự kiện (policy storage theo quyền events)
-- ===========================================================================
select public.tap_as(public.u('a3'));
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('event-images', public.u('c1')::text || '/ev1.png')$$,
  'admin events upload được ảnh sự kiện của CLB mình');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('event-images', public.u('c2')::text || '/ev2.png')$$,
  '42501', null, 'admin events KHÔNG upload được ảnh sự kiện của CLB khác');
reset role;
select public.tap_as(public.u('a3'));
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('event-images', public.u('c1')::text || '/ev3.png')$$,
  'admin events upload lại được ảnh sự kiện');
reset role;
select public.tap_as(public.u('a2'));
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('event-images', public.u('c1')::text || '/ev4.png')$$,
  'owner upload được ảnh sự kiện');
reset role;
-- các admin không có events không xóa / upload được
select public.tap_as(public.u('a5'));
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('event-images', public.u('c1')::text || '/lau5.png')$$,
  '42501', null, 'admin chỉ có members KHÔNG upload được ảnh sự kiện');
reset role;
select public.tap_as(public.u('a8'));
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('event-images', public.u('c1')::text || '/lau8.png')$$,
  '42501', null, 'admin không quyền nào KHÔNG upload được ảnh sự kiện');
reset role;
select public.tap_as(public.u('a9'));
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('event-images', public.u('c1')::text || '/lau9.png')$$,
  '42501', null, 'member KHÔNG upload được ảnh sự kiện');
reset role;
select public.tap_as(public.u('a10'));
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('event-images', public.u('c1')::text || '/lau10.png')$$,
  '42501', null, 'admin đã nghỉ (đủ quyền) KHÔNG upload được ảnh sự kiện');
reset role;

-- ===========================================================================
-- 5. Việc theo ban: RLS tasks / task_assignees
-- ===========================================================================
-- A (d1, general), B (d2, general), C (không ban, general), D (không ban, engagement), E (không ban, avatar), F (d1, engagement)
insert into public.tasks (id, club_id, team_id, title, due_at, kind, post_url) values
  (public.u('1a01'), public.u('c1'), public.u('d1'), 'RLS A', now() + interval '10 days', 'general', null),
  (public.u('1a02'), public.u('c1'), public.u('d2'), 'RLS B', now() + interval '10 days', 'general', null),
  (public.u('1a03'), public.u('c1'), null,          'RLS C', now() + interval '10 days', 'general', null),
  (public.u('1a04'), public.u('c1'), null,          'RLS D', now() + interval '10 days', 'engagement', 'https://www.facebook.com/x/1'),
  (public.u('1a05'), public.u('c1'), null,          'RLS E', now() + interval '10 days', 'avatar', null),
  (public.u('1a06'), public.u('c1'), public.u('d1'), 'RLS F', now() + interval '10 days', 'engagement', 'https://www.facebook.com/x/2'),
  (public.u('1b01'), public.u('c2'), public.u('d3'), 'RLS CLB B', now() + interval '10 days', 'general', null);
insert into public.task_assignees (task_id, member_id) values
  (public.u('1a01'), public.u('e9')), (public.u('1a02'), public.u('aa03')), (public.u('1a03'), public.u('aa04')),
  (public.u('1a04'), public.u('aa01')), (public.u('1a05'), public.u('aa02')), (public.u('1a06'), public.u('aa01')),
  (public.u('1b01'), public.u('f2'));

select is((select team_id from public.tasks where id = public.u('1a01')), public.u('d1'), 'tasks.team_id lưu được ban');
select is((select team_id from public.tasks where id = public.u('1a03')), null, 'tasks.team_id mặc định null');
-- on delete set null
insert into public.teams (id, club_id, name) values (public.u('dd'), public.u('c1'), 'Ban sẽ xóa');
insert into public.tasks (id, club_id, team_id, title, due_at) values (public.u('1a09'), public.u('c1'), public.u('dd'), 'RLS ban xóa', now() + interval '1 day');
delete from public.teams where id = public.u('dd');
select is((select team_id from public.tasks where id = public.u('1a09')), null, 'xóa ban: tasks.team_id về null (on delete set null)');
select is((select count(*) from public.tasks where id = public.u('1a09'))::int, 1, 'xóa ban: việc vẫn còn');
delete from public.tasks where id = public.u('1a09');

-- 5a. Đọc
select public.tap_as(public.u('a1'));
select is((select count(*) from public.tasks where title like 'RLS %' and club_id = public.u('c1'))::int, 6, 'Chủ nhiệm thấy mọi việc của CLB (6)');
select is((select count(*) from public.tasks where title like 'RLS %' and club_id = public.u('c2'))::int, 0, 'Chủ nhiệm CLB A không thấy việc CLB B');
reset role;
select public.tap_as(public.u('a2'));
select is((select count(*) from public.tasks where title like 'RLS %' and club_id = public.u('c1'))::int, 6, 'Phó chủ nhiệm (owner) thấy mọi việc của CLB (6)');
select is((select count(*) from public.task_assignees where task_id = any(array[public.u('1a01'), public.u('1a02'), public.u('1a03'), public.u('1a04'), public.u('1a05'), public.u('1a06')]))::int, 6, 'owner thấy mọi người nhận (6)');
reset role;
select public.tap_as(public.u('a3'));
select results_eq(
  $$select title from public.tasks where title like 'RLS %' order by title$$,
  $$values ('RLS A'::text), ('RLS F'::text)$$,
  'admin ban d1 (không có facebook) chỉ thấy việc của ban d1 (A, F)');
select is((select count(*) from public.task_assignees where task_id = any(array[public.u('1a01'), public.u('1a02'), public.u('1a03'), public.u('1a04'), public.u('1a05'), public.u('1a06')]))::int, 2, 'admin ban d1 chỉ thấy người nhận của việc ban d1');
reset role;
select public.tap_as(public.u('a4'));
select is((select count(*) from public.tasks where title like 'RLS %')::int, 2, 'admin recruitment ban d1: quyền khác không mở thêm việc (2)');
reset role;
select public.tap_as(public.u('a5'));
select results_eq(
  $$select title from public.tasks where title like 'RLS %' order by title$$,
  $$values ('RLS B'::text)$$,
  'admin ban d2 chỉ thấy việc của ban d2 (B)');
reset role;
select public.tap_as(public.u('a6'));
select is((select count(*) from public.tasks where title like 'RLS %')::int, 0, 'admin không có ban (và không facebook) không thấy việc nào');
select is((select count(*) from public.task_assignees where task_id = any(array[public.u('1a01'), public.u('1a02'), public.u('1a03'), public.u('1a04'), public.u('1a05'), public.u('1a06')]))::int, 0, 'admin không có ban không thấy người nhận nào');
reset role;
select public.tap_as(public.u('a7'));
select results_eq(
  $$select title from public.tasks where title like 'RLS %' order by title$$,
  $$values ('RLS A'::text), ('RLS D'::text), ('RLS E'::text), ('RLS F'::text)$$,
  'admin facebook ban d1: thấy việc ban d1 + việc toàn CLB loại engagement/avatar (A, D, E, F), không thấy B, C');
reset role;
select public.tap_as(public.u('a8'));
select is((select count(*) from public.tasks where title like 'RLS %')::int, 2, 'admin không quyền ban d1: thấy việc của ban d1 (2)');
reset role;
select public.tap_as(public.u('a9'));
select results_eq(
  $$select title from public.tasks where title like 'RLS %'$$,
  $$values ('RLS A'::text)$$,
  'member chỉ thấy việc được giao cho mình');
reset role;
select public.tap_as(public.u('a10'));
select is((select count(*) from public.tasks where title like 'RLS %')::int, 0, 'admin đã nghỉ không thấy việc nào');
reset role;
select public.tap_as(public.u('b1'));
select is((select count(*) from public.tasks where title like 'RLS %' and club_id = public.u('c1'))::int, 0, 'owner CLB B không thấy việc CLB A');
reset role;

-- 5b. Ghi tasks (cột description)
select public.tap_as(public.u('a3'));
select is(public.tap_rows($$update public.tasks set description = 'a3' where id = public.u('1a01')$$), 1, 'admin ban d1 sửa được việc của ban d1');
select is(public.tap_rows($$update public.tasks set description = 'a3' where id = public.u('1a02')$$), 0, 'admin ban d1 KHÔNG sửa được việc ban d2');
select is(public.tap_rows($$update public.tasks set description = 'a3' where id = public.u('1a03')$$), 0, 'admin ban d1 KHÔNG sửa được việc toàn CLB (general)');
select is(public.tap_rows($$update public.tasks set description = 'a3' where id = public.u('1a04')$$), 0, 'admin không có facebook KHÔNG sửa được việc engagement toàn CLB');
select is(public.tap_rows($$update public.tasks set status = 'closed' where id = public.u('1a02')$$), 0, 'admin ban d1 KHÔNG đóng được việc ban d2');
select is(public.tap_rows($$update public.task_assignees set note = 'a3' where task_id = public.u('1a01')$$), 1, 'admin ban d1 sửa được người nhận của việc ban d1');
select is(public.tap_rows($$update public.task_assignees set note = 'a3' where task_id = public.u('1a02')$$), 0, 'admin ban d1 KHÔNG sửa được người nhận của việc ban d2');
select lives_ok(
  $$insert into public.task_assignees (task_id, member_id) values (public.u('1a01'), public.u('aa02'))$$,
  'admin ban d1 thêm được người nhận vào việc ban d1');
select throws_ok(
  $$insert into public.task_assignees (task_id, member_id) values (public.u('1a02'), public.u('aa01'))$$,
  '42501', null, 'admin ban d1 KHÔNG thêm được người nhận vào việc ban d2');
select is(public.tap_rows($$delete from public.task_assignees where task_id = public.u('1a01') and member_id = public.u('aa02')$$), 1, 'admin ban d1 xóa được người nhận của việc ban d1');
select is(public.tap_rows($$delete from public.task_assignees where task_id = public.u('1a02')$$), 0, 'admin ban d1 KHÔNG xóa được người nhận của việc ban d2');
select is(public.tap_rows($$delete from public.tasks where id = public.u('1a02')$$), 0, 'admin ban d1 KHÔNG xóa được việc ban d2');
reset role;
select public.tap_as(public.u('a7'));
select is(public.tap_rows($$update public.tasks set description = 'a7' where id = public.u('1a04')$$), 1, 'admin facebook sửa được việc engagement toàn CLB');
select is(public.tap_rows($$update public.tasks set description = 'a7' where id = public.u('1a05')$$), 1, 'admin facebook sửa được việc avatar toàn CLB');
select is(public.tap_rows($$update public.tasks set description = 'a7' where id = public.u('1a03')$$), 0, 'admin facebook KHÔNG sửa được việc general toàn CLB');
select is(public.tap_rows($$update public.tasks set description = 'a7' where id = public.u('1a02')$$), 0, 'admin facebook KHÔNG sửa được việc ban khác');
select is(public.tap_rows($$update public.task_assignees set note = 'a7' where task_id = public.u('1a04')$$), 1, 'admin facebook sửa được người nhận của việc engagement toàn CLB');
reset role;
select public.tap_as(public.u('a5'));
select is(public.tap_rows($$update public.tasks set description = 'a5' where id = public.u('1a02')$$), 1, 'admin ban d2 sửa được việc ban d2');
select is(public.tap_rows($$update public.tasks set description = 'a5' where id = public.u('1a01')$$), 0, 'admin ban d2 KHÔNG sửa được việc ban d1');
reset role;
select public.tap_as(public.u('a6'));
select is(public.tap_rows($$update public.tasks set description = 'a6' where id = public.u('1a01')$$), 0, 'admin không có ban KHÔNG sửa được việc nào (A)');
select is(public.tap_rows($$update public.tasks set description = 'a6' where id = public.u('1a04')$$), 0, 'admin không có ban và không facebook KHÔNG sửa được việc engagement');
reset role;
select public.tap_as(public.u('a2'));
select is(public.tap_rows($$update public.tasks set description = 'a2' where id = public.u('1a03')$$), 1, 'owner sửa được việc toàn CLB');
select is(public.tap_rows($$update public.tasks set description = 'a2' where id = public.u('1a02')$$), 1, 'owner sửa được việc của ban bất kỳ');
select throws_ok(
  $$update public.tasks set team_id = public.u('d2') where id = public.u('1a03')$$,
  '42501', null, 'owner KHÔNG update được tasks.team_id (không grant cột)');
reset role;
select public.tap_as(public.u('b1'));
select is(public.tap_rows($$update public.tasks set description = 'b1' where id = public.u('1a01')$$), 0, 'owner CLB B KHÔNG sửa được việc CLB A');
reset role;
select is((select description from public.tasks where id = public.u('1a02')), 'a2', 'các lần sửa bị chặn không đổi dữ liệu (B = a2)');
select public.tap_as(public.u('a3'));
select is(public.tap_rows($$delete from public.tasks where id = public.u('1a01')$$), 1, 'admin ban d1 xóa được việc ban d1');
reset role;
select is((select count(*) from public.task_assignees where task_id = public.u('1a01'))::int, 0, 'xóa việc: người nhận bị xóa theo (cascade)');
select public.tap_as(public.u('a5'));
select is(public.tap_rows($$delete from public.tasks where id = public.u('1a02')$$), 1, 'admin ban d2 xóa được việc ban d2');
reset role;

-- 5b'. Thêm người nhận: chỉ member cùng ban với việc của ban mình
insert into public.tasks (id, club_id, team_id, title, due_at, kind, post_url) values
  (public.u('1a07'), public.u('c1'), public.u('d1'), 'RLS G', now() + interval '10 days', 'general', null),
  (public.u('1a08'), public.u('c1'), null,          'RLS H', now() + interval '10 days', 'engagement', 'https://www.facebook.com/x/3'),
  (public.u('1a0a'), public.u('c1'), null,          'RLS I', now() + interval '10 days', 'avatar', null);
select public.tap_as(public.u('a3'));
select throws_ok(
  $$insert into public.task_assignees (task_id, member_id) values (public.u('1a07'), public.u('aa03'))$$,
  '42501', null, 'admin ban d1 KHÔNG thêm member ban khác (d2) vào việc ban d1');
select throws_ok(
  $$insert into public.task_assignees (task_id, member_id) values (public.u('1a07'), public.u('aa04'))$$,
  '42501', null, 'admin ban d1 KHÔNG thêm member không thuộc ban nào vào việc ban d1');
select lives_ok(
  $$insert into public.task_assignees (task_id, member_id) values (public.u('1a07'), public.u('aa01'))$$,
  'admin ban d1 thêm được member cùng ban vào việc ban d1');
reset role;
select public.tap_as(public.u('a2'));
select lives_ok(
  $$insert into public.task_assignees (task_id, member_id) values (public.u('1a07'), public.u('aa03'))$$,
  'owner thêm được member ban khác vào việc ban d1');
reset role;
select public.tap_as(public.u('a7'));
select lives_ok(
  $$insert into public.task_assignees (task_id, member_id) values (public.u('1a08'), public.u('aa03'))$$,
  'admin facebook thêm được member ban khác vào việc engagement toàn CLB');
select lives_ok(
  $$insert into public.task_assignees (task_id, member_id) values (public.u('1a0a'), public.u('aa04'))$$,
  'admin facebook thêm được member không ban vào việc avatar toàn CLB');
reset role;
select is((select count(*) from public.task_assignees where task_id = public.u('1a07'))::int, 2, 'việc G có đúng 2 người nhận (aa01, aa03)');

-- 5c. create_task: admin chỉ giao trong ban của mình
select public.tap_as(public.u('a3')); -- admin events, ban d1
select lives_ok(
  $$select public.create_task(public.u('c1'), 'CT a3 lẻ', null, now() + interval '3 days', array[public.u('aa01'), public.u('e9')], null)$$,
  'create_task: admin giao lẻ cho người trong ban mình');
select lives_ok(
  $$select public.create_task(public.u('c1'), 'CT a3 ban', null, now() + interval '3 days', array[]::uuid[], public.u('d1'))$$,
  'create_task: admin giao cho cả ban của mình');
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad a3 khác ban', null, now() + interval '3 days', array[public.u('aa03')], null)$$, '%',
  'create_task: admin giao cho người ban khác bị lỗi');
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad a3 lẫn', null, now() + interval '3 days', array[public.u('aa01'), public.u('aa03')], null)$$, '%',
  'create_task: danh sách có một người ban khác thì cả lệnh lỗi');
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad a3 không ban', null, now() + interval '3 days', array[public.u('aa04')], null)$$, '%',
  'create_task: admin giao cho người không thuộc ban nào bị lỗi');
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad a3 ban d2', null, now() + interval '3 days', array[]::uuid[], public.u('d2'))$$, '%',
  'create_task: admin giao cho cả ban khác bị lỗi');
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad a3 ban CLB B', null, now() + interval '3 days', array[]::uuid[], public.u('d3'))$$, '%',
  'create_task: admin giao cho ban của CLB khác bị lỗi');
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad a3 tất cả general', null, now() + interval '3 days', array[]::uuid[], null, p_all_members => true)$$, '%',
  'create_task: admin giao cho tất cả (việc thường) bị lỗi');
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad a3 tất cả engagement', null, now() + interval '3 days', array[]::uuid[], null,
      p_kind => 'engagement', p_post_url => 'https://www.facebook.com/x/1', p_all_members => true)$$, '%',
  'create_task: admin không có facebook giao tương tác cho tất cả bị lỗi');
reset role;
select is((select team_id from public.tasks where title = 'CT a3 lẻ'), public.u('d1'), 'giao lẻ của admin: tasks.team_id = ban của admin (d1)');
select is((select team_id from public.tasks where title = 'CT a3 ban'), public.u('d1'), 'giao theo ban của admin: tasks.team_id = d1');
select is(
  (select count(*) from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'CT a3 ban')::int,
  (select count(*) from public.club_members where team_id = public.u('d1') and is_active)::int,
  'giao theo ban: mọi thành viên đang hoạt động của ban d1');
select is((select count(*) from public.tasks where title like 'CT bad%')::int, 0, 'các lần create_task bị chặn không để lại việc nào');

select public.tap_as(public.u('a8')); -- admin không quyền, ban d1
select lives_ok(
  $$select public.create_task(public.u('c1'), 'CT a8 lẻ', null, now() + interval '3 days', array[public.u('aa02')], public.u('d1'))$$,
  'create_task: admin không có quyền chức năng vẫn giao được trong ban mình');
reset role;

select public.tap_as(public.u('a6')); -- admin không ban
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad a6', null, now() + interval '3 days', array[public.u('aa01')], null)$$, '%ban%',
  'create_task: admin không thuộc ban nào bị lỗi nói rõ về ban');
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad a6 tất cả', null, now() + interval '3 days', array[]::uuid[], null,
      p_kind => 'engagement', p_post_url => 'https://www.facebook.com/x/1', p_all_members => true)$$, '%',
  'create_task: admin không ban và không facebook giao cho tất cả bị lỗi');
reset role;

select public.tap_as(public.u('a7')); -- admin facebook, ban d1
select lives_ok(
  $$select public.create_task(public.u('c1'), 'CT a7 tất cả engagement', null, now() + interval '3 days', array[]::uuid[], null,
      p_kind => 'engagement', p_post_url => 'https://www.facebook.com/x/1', p_all_members => true)$$,
  'create_task: admin facebook giao tương tác cho tất cả');
select lives_ok(
  $$select public.create_task(public.u('c1'), 'CT a7 tất cả avatar', null, now() + interval '3 days', array[]::uuid[], null,
      p_kind => 'avatar', p_all_members => true)$$,
  'create_task: admin facebook giao avatar cho tất cả');
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad a7 tất cả general', null, now() + interval '3 days', array[]::uuid[], null, p_all_members => true)$$, '%',
  'create_task: admin facebook giao việc thường cho tất cả vẫn bị lỗi');
select lives_ok(
  $$select public.create_task(public.u('c1'), 'CT a7 engagement ban', null, now() + interval '3 days', array[public.u('aa01')], null,
      p_kind => 'engagement', p_post_url => 'https://www.facebook.com/x/1')$$,
  'create_task: admin facebook giao tương tác cho người trong ban (không phải tất cả)');
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad a7 ban khác', null, now() + interval '3 days', array[public.u('aa03')], null,
      p_kind => 'engagement', p_post_url => 'https://www.facebook.com/x/1')$$, '%',
  'create_task: admin facebook giao tương tác lẻ cho người ban khác vẫn bị lỗi');
reset role;
select is((select team_id from public.tasks where title = 'CT a7 tất cả engagement'), null, 'giao tất cả (facebook): tasks.team_id null');
select is(
  (select count(*) from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'CT a7 tất cả engagement')::int,
  (select count(*) from public.club_members where club_id = public.u('c1') and is_active)::int,
  'giao tất cả: mọi thành viên đang hoạt động của CLB');
select is((select team_id from public.tasks where title = 'CT a7 engagement ban'), public.u('d1'), 'giao tương tác lẻ của admin facebook: team_id = d1');

select public.tap_as(public.u('a2')); -- owner (Phó chủ nhiệm)
select lives_ok(
  $$select public.create_task(public.u('c1'), 'CT owner lẻ', null, now() + interval '3 days', array[public.u('aa01'), public.u('aa03'), public.u('aa04')], null)$$,
  'create_task: owner giao lẻ cho người nhiều ban / không ban');
select lives_ok(
  $$select public.create_task(public.u('c1'), 'CT owner ban d2', null, now() + interval '3 days', array[]::uuid[], public.u('d2'))$$,
  'create_task: owner giao cho ban bất kỳ');
reset role;
select is((select team_id from public.tasks where title = 'CT owner lẻ'), null, 'owner giao lẻ: tasks.team_id null');
select is((select team_id from public.tasks where title = 'CT owner ban d2'), public.u('d2'), 'owner giao theo ban: tasks.team_id = ban đó');

select public.tap_as(public.u('a9'));
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad member', null, now() + interval '3 days', array[public.u('aa01')], null)$$, '%',
  'create_task: member bị chặn');
reset role;
select public.tap_as(public.u('a10'));
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad nghỉ', null, now() + interval '3 days', array[public.u('aa01')], null)$$, '%',
  'create_task: admin đã nghỉ bị chặn');
reset role;
select public.tap_as(public.u('b1'));
select throws_like(
  $$select public.create_task(public.u('c1'), 'CT bad CLB B', null, now() + interval '3 days', array[public.u('aa01')], null)$$, '%',
  'create_task: owner CLB khác bị chặn');
reset role;

-- ===========================================================================
-- 6. club_contribution: admin chỉ thấy ban của mình
-- ===========================================================================
select public.tap_as(public.u('a3'));
select is(
  (select count(*) from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days'))::int,
  7, 'club_contribution: admin ban d1 chỉ nhận 7 thành viên của ban d1');
select is(
  (select count(*) from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days') where team_id is distinct from public.u('d1'))::int,
  0, 'club_contribution: admin ban d1 không có dòng của ban khác / không ban');
reset role;
select public.tap_as(public.u('a5'));
select is(
  (select count(*) from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days') where team_id = public.u('d2'))::int,
  2, 'club_contribution: admin ban d2 nhận 2 thành viên của ban d2');
select is(
  (select count(*) from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days'))::int,
  2, 'club_contribution: admin ban d2 chỉ nhận đúng 2 dòng');
reset role;
select public.tap_as(public.u('a6'));
select is(
  (select count(*) from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days'))::int,
  0, 'club_contribution: admin không có ban không nhận dòng nào');
reset role;
select public.tap_as(public.u('a2'));
select is(
  (select count(*) from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days'))::int,
  (select count(*) from public.club_members where club_id = public.u('c1'))::int,
  'club_contribution: owner nhận mọi thành viên của CLB (kể cả đã nghỉ)');
reset role;
select public.tap_as(public.u('a9'));
select throws_like($$select * from public.club_contribution(public.u('c1'), now() - interval '100 days', now())$$, '%', 'club_contribution: member bị chặn');
reset role;
select public.tap_as(public.u('b1'));
select throws_like($$select * from public.club_contribution(public.u('c1'), now() - interval '100 days', now())$$, '%', 'club_contribution: owner CLB khác bị chặn');
reset role;

-- ===========================================================================
-- 7. RPC tuyển sinh: admit_applications, import_applications
-- ===========================================================================
select public.tap_as(public.u('a3'));
select throws_like($$select public.admit_applications(array[public.u('aa91')])$$, '%', 'admit_applications: admin chỉ có events bị chặn');
select throws_like(
  $$select public.import_applications(public.u('c91'), 'F', null, array[]::text[], '[{"position":"Ban lậu","email":"lau@x.com"}]'::jsonb)$$, '%',
  'import_applications: admin chỉ có events bị chặn');
reset role;
select public.tap_as(public.u('a8'));
select throws_like($$select public.admit_applications(array[public.u('aa91')])$$, '%', 'admit_applications: admin không quyền nào bị chặn');
reset role;
select public.tap_as(public.u('a5'));
select throws_like($$select public.admit_applications(array[public.u('aa91')])$$, '%', 'admit_applications: admin chỉ có members bị chặn');
reset role;
select public.tap_as(public.u('b1'));
select throws_like($$select public.admit_applications(array[public.u('aa91')])$$, '%', 'admit_applications: owner CLB khác bị chặn');
reset role;
select is((select admitted_member_id from public.applications where id = public.u('aa91')), null, 'các lần kết nạp bị chặn không đổi dữ liệu');
select is((select count(*) from public.applications where email = 'lau@x.com')::int, 0, 'import bị chặn không tạo đơn');

select public.tap_as(public.u('a4'));
select is(public.admit_applications(array[public.u('aa91')]), '{"admitted": 1, "skipped": 0}'::jsonb, 'admit_applications: admin recruitment kết nạp được');
select lives_ok(
  $$select public.import_applications(public.u('c91'), 'F', null, array[]::text[], '[{"position":"Ban nhập","full_name":"Nhập","email":"imp@x.com"}]'::jsonb)$$,
  'import_applications: admin recruitment import được');
reset role;
select isnt((select admitted_member_id from public.applications where id = public.u('aa91')), null, 'kết nạp của admin recruitment đã gắn admitted_member_id');
select is((select count(*) from public.applications where email = 'imp@x.com')::int, 1, 'import của admin recruitment đã tạo đơn');

-- ===========================================================================
-- 8. Nhiệm kỳ: chỉ Chủ nhiệm ghi / kích hoạt
-- ===========================================================================
insert into public.club_terms (id, club_id, name, status) values
  (public.u('ee01'), public.u('c1'), 'Thiếu Chủ nhiệm', 'draft'),
  (public.u('ee03'), public.u('c1'), 'Chủ nhiệm là Ban chủ chốt', 'draft'),
  (public.u('ee04'), public.u('c1'), 'Chủ nhiệm không tài khoản', 'draft'),
  (public.u('ee05'), public.u('c1'), 'Chủ nhiệm đã nghỉ', 'draft'),
  (public.u('ee06'), public.u('c1'), 'Hợp lệ 1', 'draft'),
  (public.u('ee07'), public.u('c1'), 'Hợp lệ 2 (đổi Chủ nhiệm)', 'draft'),
  (public.u('ee09'), public.u('c1'), 'Nháp để Phó thử', 'draft');
insert into public.club_term_roles (term_id, member_id, role, title, team_id, permissions, is_head) values
  (public.u('ee01'), public.u('e1'), 'owner', 'CN', null, '{}', false),
  (public.u('ee03'), public.u('e1'), 'owner', 'Phó', null, '{}', false),
  (public.u('ee03'), public.u('e3'), 'admin', 'Trưởng ban', null, array['events'], true),
  (public.u('ee04'), public.u('aa05'), 'owner', 'CN', null, '{}', true),
  (public.u('ee04'), public.u('e1'), 'owner', 'Phó', null, '{}', false),
  (public.u('ee05'), public.u('aa06'), 'owner', 'CN', null, '{}', true),
  (public.u('ee05'), public.u('e1'), 'owner', 'Phó', null, '{}', false),
  (public.u('ee06'), public.u('e1'), 'owner', 'Chủ nhiệm 2027', null, '{}', true),
  (public.u('ee06'), public.u('e2'), 'owner', 'Phó chủ nhiệm', null, array['events'], false),
  (public.u('ee06'), public.u('e3'), 'admin', 'Trưởng ban TT', null, array['events', 'facebook'], false),
  (public.u('ee06'), public.u('e4'), 'admin', 'Phó ban', null, '{}', false),
  (public.u('ee06'), public.u('e7'), 'admin', 'Trưởng ban CM', public.u('d2'), array['mail'], false),
  (public.u('ee07'), public.u('e2'), 'owner', 'Chủ nhiệm mới', null, '{}', true),
  (public.u('ee07'), public.u('e1'), 'owner', 'Phó chủ nhiệm', null, '{}', false),
  (public.u('ee07'), public.u('e3'), 'admin', 'Trưởng ban', null, array['events'], false),
  (public.u('ee09'), public.u('e2'), 'owner', 'Chủ nhiệm', null, '{}', true),
  (public.u('ee09'), public.u('e3'), 'admin', 'Trưởng ban', null, '{}', false);

-- 8a. Ràng buộc cột của club_term_roles
select throws_ok(
  $$update public.club_term_roles set permissions = array['bogus'] where term_id = public.u('ee09')$$,
  '23514', null, 'club_term_roles.permissions chứa mã lạ bị chặn (check)');
select is((select permissions from public.club_term_roles where term_id = public.u('ee06') and member_id = public.u('e4')), '{}'::text[], 'club_term_roles.permissions lưu đúng');

-- 8b. Chủ nhiệm ghi được
select public.tap_as(public.u('a1'));
select lives_ok(
  $$insert into public.club_terms (club_id, name, start_date, end_date) values (public.u('c1'), 'Nháp do Chủ nhiệm', '2028-01-01', '2028-12-31')$$,
  'Chủ nhiệm insert được club_terms');
select lives_ok(
  $$insert into public.club_term_roles (term_id, member_id, role, title, team_id, permissions, is_head)
    values ((select id from public.club_terms where name = 'Nháp do Chủ nhiệm'), public.u('e3'), 'admin', 'Trưởng ban', null, array['events', 'mail'], false)$$,
  'Chủ nhiệm insert được club_term_roles kèm permissions và is_head');
select throws_ok(
  $$insert into public.club_term_roles (term_id, member_id, role, permissions)
    values ((select id from public.club_terms where name = 'Nháp do Chủ nhiệm'), public.u('e4'), 'admin', array['bogus'])$$,
  '23514', null, 'Chủ nhiệm insert club_term_roles với quyền lạ bị chặn (check)');
select is(public.tap_rows($$update public.club_term_roles set permissions = array['facebook'] where term_id = (select id from public.club_terms where name = 'Nháp do Chủ nhiệm')$$), 1, 'Chủ nhiệm sửa được permissions trong danh sách nháp');
select is(public.tap_rows($$update public.club_terms set name = 'Nháp đổi tên' where name = 'Nháp do Chủ nhiệm'$$), 1, 'Chủ nhiệm sửa được nhiệm kỳ nháp');
select is(public.tap_rows($$delete from public.club_term_roles where term_id = (select id from public.club_terms where name = 'Nháp đổi tên')$$), 1, 'Chủ nhiệm xóa được dòng danh sách nháp');
select is(public.tap_rows($$delete from public.club_terms where name = 'Nháp đổi tên'$$), 1, 'Chủ nhiệm xóa được nhiệm kỳ nháp');
reset role;

-- 8c. Phó chủ nhiệm (owner không is_head) và Ban chủ chốt bị chặn
select public.tap_as(public.u('a2'));
select throws_ok(
  $$insert into public.club_terms (club_id, name) values (public.u('c1'), 'Phó chèn')$$,
  '42501', null, 'Phó chủ nhiệm KHÔNG insert được club_terms');
select throws_ok(
  $$insert into public.club_term_roles (term_id, member_id, role) values (public.u('ee09'), public.u('e4'), 'admin')$$,
  '42501', null, 'Phó chủ nhiệm KHÔNG insert được club_term_roles');
select is(public.tap_rows($$update public.club_terms set name = 'Phó sửa' where id = public.u('ee09')$$), 0, 'Phó chủ nhiệm KHÔNG sửa được club_terms (0 dòng)');
select is(public.tap_rows($$update public.club_term_roles set permissions = array['mail'] where term_id = public.u('ee09')$$), 0, 'Phó chủ nhiệm KHÔNG sửa được club_term_roles (0 dòng)');
select is(public.tap_rows($$delete from public.club_term_roles where term_id = public.u('ee09')$$), 0, 'Phó chủ nhiệm KHÔNG xóa được club_term_roles');
select is(public.tap_rows($$delete from public.club_terms where id = public.u('ee09')$$), 0, 'Phó chủ nhiệm KHÔNG xóa được club_terms');
select ok((select count(*) from public.club_terms) >= 7, 'Phó chủ nhiệm vẫn ĐỌC được club_terms');
select ok((select count(*) from public.club_term_roles) >= 14, 'Phó chủ nhiệm vẫn ĐỌC được club_term_roles');
select throws_like($$select public.activate_term(public.u('ee06'))$$, '%Chủ nhiệm%', 'activate_term: Phó chủ nhiệm bị chặn');
reset role;
select public.tap_as(public.u('a3'));
select throws_ok(
  $$insert into public.club_terms (club_id, name) values (public.u('c1'), 'Admin chèn')$$,
  '42501', null, 'Ban chủ chốt KHÔNG insert được club_terms');
select is(public.tap_rows($$update public.club_term_roles set permissions = array['events','recruitment','members','mail','facebook'] where term_id = public.u('ee09')$$), 0, 'Ban chủ chốt KHÔNG tự cấp quyền qua club_term_roles');
select ok((select count(*) from public.club_terms) >= 7, 'Ban chủ chốt vẫn đọc được club_terms');
select throws_like($$select public.activate_term(public.u('ee06'))$$, '%Chủ nhiệm%', 'activate_term: Ban chủ chốt bị chặn');
reset role;
select public.tap_as(public.u('a9'));
select is((select count(*) from public.club_terms)::int, 0, 'member KHÔNG đọc được club_terms');
reset role;
select public.tap_as(public.u('b1'));
select throws_like($$select public.activate_term(public.u('ee06'))$$, '%', 'activate_term: Chủ nhiệm CLB khác bị chặn');
reset role;

-- 8d. activate_term đòi đúng một Chủ nhiệm hợp lệ
select public.tap_as(public.u('a1'));
select throws_like($$select public.activate_term(public.u('ee01'))$$, '%Chủ nhiệm%', 'activate_term: danh sách không có Chủ nhiệm thì lỗi');
select throws_ok(
  $$insert into public.club_term_roles (term_id, member_id, role, is_head) values (public.u('ee09'), public.u('e1'), 'owner', true)$$,
  '23505', null, 'club_term_roles: hai dòng is_head cùng một nhiệm kỳ bị chặn (unique)');
select throws_like($$select public.activate_term(public.u('ee03'))$$, '%Chủ nhiệm%', 'activate_term: Chủ nhiệm là Ban chủ chốt (không phải Ban chủ nhiệm) thì lỗi');
select throws_like($$select public.activate_term(public.u('ee04'))$$, '%Chủ nhiệm%', 'activate_term: Chủ nhiệm không có tài khoản thì lỗi');
select throws_like($$select public.activate_term(public.u('ee05'))$$, '%Chủ nhiệm%', 'activate_term: Chủ nhiệm đã nghỉ thì lỗi');
reset role;
select is((select count(*) from public.club_terms where club_id = public.u('c1') and status = 'draft' and id in (public.u('ee01'), public.u('ee03'), public.u('ee04'), public.u('ee05')))::int, 4, 'các lần kích hoạt lỗi: nhiệm kỳ vẫn là nháp');
select is((select role::text from public.club_members where id = public.u('e5')), 'admin', 'các lần kích hoạt lỗi: vai trò người ngoài danh sách chưa đổi');
select is((select permissions from public.club_members where id = public.u('e5')), array['members'], 'các lần kích hoạt lỗi: quyền người ngoài danh sách chưa đổi');
select is((select is_head from public.club_members where id = public.u('e1')), true, 'các lần kích hoạt lỗi: Chủ nhiệm cũ vẫn là Chủ nhiệm');

-- 8e. Kích hoạt hợp lệ: chép quyền, xóa quyền người ngoài danh sách
select public.tap_as(public.u('a1'));
select lives_ok($$select public.activate_term(public.u('ee06'))$$, 'activate_term: Chủ nhiệm kích hoạt nhiệm kỳ hợp lệ');
reset role;
select is((select status from public.club_terms where id = public.u('ee06')), 'active', 'nhiệm kỳ mới -> active');
select is((select permissions from public.club_members where id = public.u('e3')), array['events', 'facebook'], 'admin trong danh sách nhận permissions của dòng (e3)');
select is((select permissions from public.club_members where id = public.u('e4')), '{}'::text[], 'admin trong danh sách với permissions rỗng thì rỗng (e4)');
select is((select permissions from public.club_members where id = public.u('e7')), array['mail'], 'admin trong danh sách nhận permissions của dòng (e7, thay quyền facebook cũ)');
select is((select team_id from public.club_members where id = public.u('e7')), public.u('d2'), 'team_id được cập nhật theo danh sách');
select is((select permissions from public.club_members where id = public.u('e2')), '{}'::text[], 'owner trong danh sách nhận permissions = {} dù dòng có quyền');
select is((select role::text from public.club_members where id = public.u('e2')), 'owner', 'owner trong danh sách giữ role owner');
select is((select is_head from public.club_members where id = public.u('e1')), true, 'Chủ nhiệm trong danh sách có is_head');
select is((select is_head from public.club_members where id = public.u('e2')), false, 'Phó chủ nhiệm không is_head');
select is((select role::text from public.club_members where id = public.u('e5')), 'member', 'người ngoài danh sách (e5) -> role member');
select is((select permissions from public.club_members where id = public.u('e5')), '{}'::text[], 'người ngoài danh sách (e5) -> permissions rỗng');
select is((select permissions from public.club_members where id = public.u('e6')), '{}'::text[], 'người ngoài danh sách (e6) -> permissions rỗng');
select is((select role::text from public.club_members where id = public.u('e8')), 'member', 'admin ngoài danh sách (e8) -> role member');
select is((select permissions from public.club_members where id = public.u('ea')), '{}'::text[], 'admin đã nghỉ ngoài danh sách (đủ 5 quyền) -> permissions rỗng');
select is((select count(*) from public.club_members where club_id = public.u('c1') and is_head)::int, 1, 'CLB chỉ có đúng một Chủ nhiệm sau khi kích hoạt');
select is((select count(*) from public.club_members where club_id = public.u('c1') and role <> 'admin' and permissions <> '{}')::int, 0, 'chỉ admin mới có permissions');
select public.tap_as(public.u('a5'));
select is(public.has_club_permission(public.u('c1'), 'members'), false, 'người bị gỡ quyền (e5) hết has_club_permission');
select is(public.is_club_admin(public.u('c1')), false, 'người bị gỡ vai trò (e5) hết is_club_admin');
reset role;
select public.tap_as(public.u('a3'));
select is(public.has_club_permission(public.u('c1'), 'facebook'), true, 'quyền mới của e3 có hiệu lực (facebook)');
select is(public.has_club_permission(public.u('c1'), 'events'), true, 'quyền giữ lại của e3 có hiệu lực (events)');
select is(public.has_club_permission(public.u('c1'), 'mail'), false, 'quyền không có trong danh sách (mail) không có hiệu lực');
reset role;

-- 8f. Đổi Chủ nhiệm: Phó chủ nhiệm lên thay; Chủ nhiệm cũ xuống Phó
select public.tap_as(public.u('a1'));
select lives_ok($$select public.activate_term(public.u('ee07'))$$, 'activate_term: Chủ nhiệm kích hoạt nhiệm kỳ đổi Chủ nhiệm');
reset role;
select is((select is_head from public.club_members where id = public.u('e2')), true, 'Chủ nhiệm mới (e2) có is_head');
select is((select is_head from public.club_members where id = public.u('e1')), false, 'Chủ nhiệm cũ (e1) mất is_head');
select is((select role::text from public.club_members where id = public.u('e1')), 'owner', 'Chủ nhiệm cũ vẫn là Ban chủ nhiệm');
select is((select status from public.club_terms where id = public.u('ee06')), 'ended', 'nhiệm kỳ cũ -> ended');
select is((select count(*) from public.club_members where club_id = public.u('c1') and is_head)::int, 1, 'vẫn đúng một Chủ nhiệm');
select public.tap_as(public.u('a1'));
select is(public.is_club_head(public.u('c1')), false, 'Chủ nhiệm cũ hết is_club_head');
select throws_like($$select public.activate_term(public.u('ee09'))$$, '%Chủ nhiệm%', 'Chủ nhiệm cũ không kích hoạt được nhiệm kỳ nữa');
select throws_ok(
  $$insert into public.club_terms (club_id, name) values (public.u('c1'), 'Cũ chèn')$$,
  '42501', null, 'Chủ nhiệm cũ KHÔNG insert được club_terms nữa');
reset role;
select public.tap_as(public.u('a2'));
select is(public.is_club_head(public.u('c1')), true, 'Chủ nhiệm mới có is_club_head');
select lives_ok(
  $$insert into public.club_terms (club_id, name) values (public.u('c1'), 'Mới chèn')$$,
  'Chủ nhiệm mới insert được club_terms');
select lives_ok($$select public.activate_term(public.u('ee09'))$$, 'Chủ nhiệm mới kích hoạt được nhiệm kỳ');
reset role;
select is((select role::text from public.club_members where id = public.u('e1')), 'member', 'e1 ngoài danh sách ee09 -> member');

-- ===========================================================================
-- 9. Trigger "đúng một Chủ nhiệm" (CLB B: f1 là Chủ nhiệm có tài khoản)
-- ===========================================================================
insert into public.club_members (id, club_id, user_id, role, full_name, is_active, student_code) values
  (public.u('f3'), public.u('c2'), null, 'owner', 'Phó B không TK', true, 'F3');
set constraints all immediate;
select lives_ok(
  $$update public.club_members set role = 'admin' where id = public.u('f3')$$,
  'hạ Phó chủ nhiệm (không phải Chủ nhiệm) thì được');
select throws_like(
  $$update public.club_members set is_head = false where id = public.u('f1')$$, '%Chủ nhiệm%',
  'bỏ cờ Chủ nhiệm của người cuối cùng -> lỗi');
select throws_like(
  $$update public.club_members set role = 'admin', is_head = false where id = public.u('f1')$$, '%Chủ nhiệm%',
  'hạ Chủ nhiệm duy nhất xuống admin -> lỗi');
select throws_like(
  $$delete from public.club_members where id = public.u('f1')$$, '%Chủ nhiệm%',
  'xóa Chủ nhiệm duy nhất -> lỗi');
select throws_like(
  $$update public.club_members set is_active = false where id = public.u('f1')$$, '%Chủ nhiệm%',
  'tắt is_active Chủ nhiệm duy nhất -> lỗi');
select throws_like(
  $$update public.club_members set user_id = null where id = public.u('f1')$$, '%Chủ nhiệm%',
  'gỡ user_id Chủ nhiệm duy nhất -> lỗi');
select lives_ok(
  $$update public.club_members set full_name = 'Chủ nhiệm B đổi tên' where id = public.u('f1')$$,
  'sửa thông tin khác của Chủ nhiệm thì được');
-- Đợt 7: đợt tuyển còn đơn thì không xóa dây chuyền được (FK RESTRICT); dọn đơn trước khi xóa CLB.
delete from public.applications
  where campaign_id in (select id from public.recruitment_campaigns where club_id = public.u('c2'));
select lives_ok(
  $$delete from public.clubs where id = public.u('c2')$$,
  'xóa cả CLB (cascade thành viên) không bị trigger chặn');
set constraints all deferred;

select * from finish();
rollback;
