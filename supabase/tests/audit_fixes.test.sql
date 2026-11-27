-- pgTAP: Đợt 7, sửa vấn đề từ đợt rà soát. Theo docs/CONTRACT.md mục "DB" (1-10).
-- Chạy: npx supabase test db   (cần npx supabase db reset để áp migration 20261119000000_audit_fixes.sql)
begin;
select plan(73);

-- ---------------------------------------------------------------------------
-- Helper (mất khi rollback)
-- ---------------------------------------------------------------------------
create function public.tap_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function public.u(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid
$$;
grant execute on function public.u(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Dữ liệu nền (quyền postgres)
-- ---------------------------------------------------------------------------
-- CLB c1: a1 Chủ nhiệm (e1), a2 admin{members,recruitment} ban d1 (e2), a3 admin{} (e3, ban d1).
-- Ban d1, d2. Thành viên thường m1 (ban d1).
insert into auth.users (id, email, aud, role)
select public.u(x), x || '@bit.test', 'authenticated', 'authenticated' from unnest(array['a1','a2','a3']) x;

insert into public.clubs (id, name) values (public.u('c1'), 'CLB A');
insert into public.teams (id, club_id, name) values
  (public.u('d1'), public.u('c1'), 'Ban A'),
  (public.u('d2'), public.u('c1'), 'Ban B');

insert into public.club_members
  (id, club_id, user_id, team_id, role, full_name, is_active, student_code, email, permissions, is_head) values
  (public.u('e1'), public.u('c1'), public.u('a1'), null,          'owner', 'Chủ nhiệm', true, 'E1', 'e1@t.test', '{}', true),
  (public.u('e2'), public.u('c1'), public.u('a2'), public.u('d1'), 'admin', 'Admin 2',   true, 'E2', 'e2@t.test', array['members','recruitment'], false),
  (public.u('e3'), public.u('c1'), public.u('a3'), public.u('d1'), 'admin', 'Admin 3',   true, 'E3', 'e3@t.test', '{}', false),
  (public.u('f1'), public.u('c1'), null,           public.u('d1'), 'member', 'Thành viên 1', true, 'M1', 'm1@t.test', '{}', false);

-- Đợt "cA" (đóng): có đơn + câu trả lời. Vị trí p1 (ban d2), form f1 với q1 (họ tên), q2 (email).
insert into public.recruitment_campaigns (id, club_id, name, status) values
  (public.u('ca'), public.u('c1'), 'Đợt A', 'closed'),
  (public.u('ce'), public.u('c1'), 'Đợt trống', 'closed'),
  (public.u('c5'), public.u('c1'), 'Đợt mở không ca', 'open'),
  (public.u('c7'), public.u('c1'), 'Đợt mở có ca', 'open');
insert into public.recruitment_positions (id, campaign_id, team_id, name) values
  (public.u('b1'), public.u('ca'), public.u('d2'), 'Vị trí 1'),
  (public.u('b2'), public.u('ca'), null,           'Vị trí không đơn'),
  (public.u('be'), public.u('ce'), null,           'Vị trí đợt trống'),
  (public.u('b5'), public.u('c5'), null,           'Vị trí mở không ca'),
  (public.u('b7'), public.u('c7'), null,           'Vị trí mở có form'),
  (public.u('b8'), public.u('c7'), null,           'Vị trí không form'),
  (public.u('b9'), public.u('c7'), null,           'Vị trí form đã có câu hỏi');
insert into public.application_forms (id, position_id, name) values
  (public.u('f01'), public.u('b1'), 'Form 1'),
  (public.u('f02'), public.u('b2'), 'Form không đơn'),
  (public.u('f0e'), public.u('be'), 'Form đợt trống'),
  (public.u('f05'), public.u('b5'), 'Form mở'),
  (public.u('f07'), public.u('b7'), 'Form có ca'),
  (public.u('f09'), public.u('b9'), 'Form có sẵn câu hỏi ca');
insert into public.form_questions (id, form_id, question_text, question_type, field_key, is_required, order_index) values
  (public.u('91'), public.u('f01'), 'Họ tên', 'text', 'full_name', true, 0),
  (public.u('92'), public.u('f01'), 'Email', 'text', 'email', true, 1),
  (public.u('93'), public.u('f02'), 'Câu không ai trả lời', 'text', null, false, 0),
  (public.u('9e'), public.u('f0e'), 'Câu đợt trống', 'text', null, false, 0),
  (public.u('9a'), public.u('f05'), 'Họ tên', 'text', 'full_name', true, 0),
  (public.u('9b'), public.u('f05'), 'Email', 'text', 'email', true, 1),
  (public.u('9c'), public.u('f07'), 'Họ tên', 'text', 'full_name', true, 0),
  (public.u('9d'), public.u('f07'), 'Câu tùy chỉnh', 'text', null, false, 4),
  (public.u('9f'), public.u('f09'), '  THỜI GIAN CÓ THỂ THAM GIA PHỎNG VẤN ', 'long_text', null, true, 0);

-- Ca của đợt trống (sẽ bị xóa cascade).
insert into public.interview_sessions (id, campaign_id, position_id, start_time, end_time) values
  (public.u('5e'), public.u('ce'), public.u('be'), now() + interval '1 day', now() + interval '1 day 1 hour');

-- Đơn: aa1..aa4 ở p1 (aa1, aa2 passed để kết nạp). aa5 ở p1 trùng MSSV với e2.
insert into public.applications (id, campaign_id, position_id, full_name, email, student_code, status) values
  (public.u('aa1'), public.u('ca'), public.u('b1'), 'Ứng viên 1', 'u1@t.test', 'U1', 'submitted'),
  (public.u('aa2'), public.u('ca'), public.u('b1'), 'Ứng viên 2', 'u2@t.test', 'U2', 'submitted'),
  (public.u('aa3'), public.u('ca'), public.u('b1'), 'Admin tự nộp', 'e2@t.test', 'E2', 'passed'),
  (public.u('aa4'), public.u('ca'), public.u('b1'), 'Trùng thành viên', 'm1@t.test', 'M1', 'passed'),
  (public.u('aa5'), public.u('ca'), public.u('b1'), 'Admin tự nộp lần 2', 'e2-lan2@t.test', 'E2', 'passed');
insert into public.application_answers (application_id, question_id, answer_text) values
  (public.u('aa1'), public.u('91'), 'Ứng viên 1');

-- ===========================================================================
-- 1. Link phỏng vấn không lộ cho anon
-- ===========================================================================
-- Ca trong đợt mở để anon đọc được dòng.
insert into public.interview_sessions (id, campaign_id, position_id, start_time, end_time, location, meeting_link, note, capacity) values
  (public.u('5a'), public.u('c7'), public.u('b7'), now() + interval '2 days', now() + interval '2 days 1 hour', 'Phòng 1', 'https://meet.example/secret', 'Ghi chú nội bộ', 5);

select ok(has_column_privilege('anon', 'public.interview_sessions', 'id', 'select')
  and has_column_privilege('anon', 'public.interview_sessions', 'campaign_id', 'select')
  and has_column_privilege('anon', 'public.interview_sessions', 'position_id', 'select')
  and has_column_privilege('anon', 'public.interview_sessions', 'round', 'select')
  and has_column_privilege('anon', 'public.interview_sessions', 'start_time', 'select')
  and has_column_privilege('anon', 'public.interview_sessions', 'end_time', 'select'),
  'anon đọc được id, campaign_id, position_id, round, start_time, end_time của ca');
select ok(not has_column_privilege('anon', 'public.interview_sessions', 'meeting_link', 'select')
  and not has_column_privilege('anon', 'public.interview_sessions', 'location', 'select')
  and not has_column_privilege('anon', 'public.interview_sessions', 'note', 'select')
  and not has_column_privilege('anon', 'public.interview_sessions', 'capacity', 'select'),
  'anon không có quyền cột meeting_link, location, note, capacity');

set local role anon;
select is((select count(*) from public.interview_sessions where id = public.u('5a'))::int, 1,
  'anon vẫn thấy ca của đợt đang mở (policy giữ nguyên)');
select throws_ok($$select meeting_link from public.interview_sessions$$, '42501', null, 'anon select meeting_link bị chặn');
select throws_ok($$select location from public.interview_sessions$$, '42501', null, 'anon select location bị chặn');
select throws_ok($$select note from public.interview_sessions$$, '42501', null, 'anon select note bị chặn');
select throws_ok($$select * from public.interview_sessions$$, '42501', null, 'anon select * bị chặn');
reset role;

-- ===========================================================================
-- 2. FK RESTRICT: không xóa dây chuyền mất đơn
-- ===========================================================================
select is(
  (select array_agg(conname::text order by conname) from pg_constraint
   where contype = 'f' and confdeltype = 'r' and connamespace = 'public'::regnamespace),
  array['application_answers_question_id_fkey', 'applications_campaign_id_fkey', 'applications_position_id_fkey'],
  'đúng 3 FK ON DELETE RESTRICT');

select throws_ok($$delete from public.recruitment_campaigns where id = public.u('ca')$$, '23503', null,
  'xóa đợt còn đơn: lỗi 23503');
select throws_ok($$delete from public.recruitment_positions where id = public.u('b1')$$, '23503', null,
  'xóa vị trí còn đơn: lỗi 23503');
select throws_ok($$delete from public.form_questions where id = public.u('91')$$, '23503', null,
  'xóa câu hỏi còn câu trả lời: lỗi 23503');
select throws_ok($$delete from public.application_forms where id = public.u('f01')$$, '23503', null,
  'xóa biểu mẫu có câu hỏi còn câu trả lời: lỗi 23503');
select is((select count(*) from public.application_answers where application_id = public.u('aa1'))::int, 1,
  'sau các lỗi trên câu trả lời vẫn còn');

-- Chưa có đơn: xóa như cũ.
select lives_ok($$delete from public.form_questions where id = public.u('92')$$,
  'xóa câu hỏi chưa có câu trả lời: được');
select lives_ok($$delete from public.recruitment_positions where id = public.u('b2')$$,
  'xóa vị trí không có đơn: được (cascade biểu mẫu + câu hỏi)');
select is((select count(*) from public.application_forms where id = public.u('f02'))::int
  + (select count(*) from public.form_questions where id = public.u('93'))::int, 0,
  'xóa vị trí cascade sang biểu mẫu và câu hỏi');
select lives_ok($$delete from public.recruitment_campaigns where id = public.u('ce')$$,
  'xóa đợt không có đơn: được');
select is(
  (select count(*) from public.recruitment_positions where id = public.u('be'))::int
  + (select count(*) from public.application_forms where id = public.u('f0e'))::int
  + (select count(*) from public.form_questions where id = public.u('9e'))::int
  + (select count(*) from public.interview_sessions where id = public.u('5e'))::int, 0,
  'xóa đợt cascade sang vị trí, biểu mẫu, câu hỏi và ca phỏng vấn');

-- interview_assignments -> applications vẫn cascade.
insert into public.interview_sessions (id, campaign_id, position_id, start_time, end_time) values
  (public.u('5b'), public.u('ca'), public.u('b1'), now() + interval '3 days', now() + interval '3 days 1 hour');
insert into public.interview_assignments (application_id, session_id) values (public.u('aa4'), public.u('5b'));
select lives_ok($$delete from public.applications where id = public.u('aa4')$$, 'xóa đơn được');
select is((select count(*) from public.interview_assignments where application_id = public.u('aa4'))::int, 0,
  'xóa đơn vẫn cascade sang interview_assignments');
-- Dựng lại aa4 (dùng cho test kết nạp)
insert into public.applications (id, campaign_id, position_id, full_name, email, student_code, status) values
  (public.u('aa4'), public.u('ca'), public.u('b1'), 'Trùng thành viên', 'm1@t.test', 'M1', 'passed');

-- ===========================================================================
-- 3. import_members: người không phải Chủ nhiệm không cập nhật gì ở dòng owner/admin
-- ===========================================================================
select public.tap_as(public.u('a2'));
select is(
  public.import_members(public.u('c1'), $$[
    {"full_name":"Chủ nhiệm đổi tên","student_code":"E1","email":"e1@t.test","phone":"111","class_name":"K1","facebook_url":"https://facebook.com/x","title":"Chủ","team":"Ban B"},
    {"full_name":"Admin 3 đổi tên","student_code":"E3","phone":"333","class_name":"K3","title":"Phó","team":"Ban B"}
  ]$$::jsonb),
  '{"inserted":0,"updated":0,"unchanged":0,"staff_team_skipped":2}'::jsonb,
  'admin: 2 dòng owner/admin bị bỏ qua hoàn toàn, đếm staff_team_skipped = 2');
select is(
  public.import_members(public.u('c1'), $$[
    {"full_name":"Thành viên 1 đổi","student_code":"M1","phone":"999"},
    {"full_name":"Mới","student_code":"N1"},
    {"full_name":"Admin 2 tự sửa","student_code":"E2","phone":"222"}
  ]$$::jsonb),
  '{"inserted":1,"updated":1,"unchanged":0,"staff_team_skipped":1}'::jsonb,
  'admin: dòng member vẫn cập nhật, dòng mới vẫn thêm, dòng chính mình (admin) bị bỏ qua');
reset role;
select is(
  (select to_jsonb(r) from (select full_name, phone, class_name, facebook_url, title, team_id
     from public.club_members where id = public.u('e1')) r),
  jsonb_build_object('full_name','Chủ nhiệm','phone',null,'class_name',null,'facebook_url',null,'title',null,'team_id',null),
  'dòng Chủ nhiệm không đổi gì');
select is(
  (select to_jsonb(r) from (select full_name, phone, class_name, title, team_id
     from public.club_members where id = public.u('e3')) r),
  jsonb_build_object('full_name','Admin 3','phone',null,'class_name',null,'title',null,'team_id',public.u('d1')),
  'dòng admin khác không đổi gì');
select is((select phone from public.club_members where id = public.u('e2')), null, 'admin không tự sửa được dòng của mình qua import');
select is((select phone from public.club_members where id = public.u('f1')), '999', 'dòng thành viên thường đã cập nhật');

select public.tap_as(public.u('a1'));
select is(
  public.import_members(public.u('c1'), $$[
    {"full_name":"Admin 3 do Chủ nhiệm sửa","student_code":"E3","phone":"333","title":"Phó"}
  ]$$::jsonb),
  '{"inserted":0,"updated":1,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  'Chủ nhiệm vẫn cập nhật được dòng admin');
reset role;
select is((select phone from public.club_members where id = public.u('e3')), '333', 'Chủ nhiệm đã sửa phone của admin');

-- ===========================================================================
-- 4. admit_applications: admin tự kết nạp chính mình không đổi được ban
-- ===========================================================================
-- aa3: admin e2 (ban chính d1) nộp đơn vào vị trí ban d2. Người gọi a2 không phải Chủ nhiệm.
select public.tap_as(public.u('a2'));
select is(public.admit_applications(array[public.u('aa3')]), '{"admitted":1,"skipped":0}'::jsonb,
  'admin kết nạp đơn của chính mình: admitted = 1');
reset role;
select is((select admitted_member_id from public.applications where id = public.u('aa3')), public.u('e2'),
  'admitted_member_id gắn đúng thành viên e2');
select is((select team_id from public.club_members where id = public.u('e2')), public.u('d1'),
  'ban chính của admin không đổi (d1)');
select is((select array_agg(team_id) from public.club_member_teams where member_id = public.u('e2')), array[public.u('d1')],
  'tập ban của admin không thêm ban (chỉ d1)');
select is((select role::text || '/' || full_name from public.club_members where id = public.u('e2')), 'admin/Admin 2',
  'không sửa gì khác ở dòng admin');

-- Thành viên thường vẫn được thêm ban (hành vi Đợt 6 giữ nguyên).
select public.tap_as(public.u('a2'));
select is(public.admit_applications(array[public.u('aa4')]), '{"admitted":1,"skipped":0}'::jsonb,
  'admin kết nạp đơn trùng thành viên thường');
reset role;
select is((select array_agg(team_id order by team_id) from public.club_member_teams where member_id = public.u('f1')),
  array[public.u('d1'), public.u('d2')], 'thành viên thường được thêm ban d2 vào tập');

-- Chủ nhiệm kết nạp thì ban được thêm cho admin.
select public.tap_as(public.u('a1'));
select is(public.admit_applications(array[public.u('aa5')]), '{"admitted":1,"skipped":0}'::jsonb,
  'Chủ nhiệm kết nạp đơn ghép với admin');
reset role;
select is((select array_agg(team_id order by team_id) from public.club_member_teams where member_id = public.u('e2')),
  array[public.u('d1'), public.u('d2')], 'Chủ nhiệm kết nạp: ban d2 được thêm vào tập của admin');
select is((select team_id from public.club_members where id = public.u('e2')), public.u('d1'),
  'ban chính của admin vẫn d1 (chỉ đặt khi đang null)');

-- ===========================================================================
-- 5. Sức chứa ca phỏng vấn
-- ===========================================================================
insert into public.interview_sessions (id, campaign_id, position_id, start_time, end_time, capacity) values
  (public.u('5c'), public.u('ca'), public.u('b1'), now() + interval '4 days', now() + interval '4 days 1 hour', 1);
insert into public.interview_assignments (id, application_id, session_id) values
  (public.u('1a1'), public.u('aa1'), public.u('5c'));
select throws_ok(
  $$insert into public.interview_assignments (application_id, session_id) values (public.u('aa2'), public.u('5c'))$$,
  'P0001', 'Ca phỏng vấn đã đủ sức chứa', 'ca đủ sức chứa: xếp thêm bị chặn');
update public.interview_assignments set status = 'absent' where id = public.u('1a1');
select lives_ok(
  $$insert into public.interview_assignments (id, application_id, session_id) values (public.u('1a2'), public.u('aa2'), public.u('5c'))$$,
  'người cũ vắng mặt không chiếm chỗ: xếp được người mới');
select throws_ok(
  $$insert into public.interview_assignments (application_id, session_id) values (public.u('aa3'), public.u('5c'))$$,
  'P0001', 'Ca phỏng vấn đã đủ sức chứa', 'chỗ trống đã bị người mới lấp: ca lại đầy');
update public.interview_assignments set status = 'rescheduled' where id = public.u('1a2');
select lives_ok(
  $$insert into public.interview_assignments (application_id, session_id) values (public.u('aa3'), public.u('5c'))$$,
  'người dời lịch (rescheduled) không chiếm chỗ');
update public.interview_assignments set status = 'attended' where application_id = public.u('aa3') and session_id = public.u('5c');
select throws_ok(
  $$insert into public.interview_assignments (application_id, session_id) values (public.u('aa5'), public.u('5c'))$$,
  'P0001', 'Ca phỏng vấn đã đủ sức chứa', 'người đã dự (attended) vẫn chiếm chỗ');
-- Hàm khóa dòng ca trước khi đếm.
select matches(
  (select prosrc from pg_proc where proname = 'enforce_interview_assignment_integrity' and pronamespace = 'public'::regnamespace),
  'for update', 'enforce_interview_assignment_integrity khóa dòng ca (for update)');

-- ===========================================================================
-- 6. submit_application: trùng email báo lỗi thân thiện
-- ===========================================================================
set local role anon;
select lives_ok(
  $$select public.submit_application(public.u('b5'), jsonb_build_array(
      jsonb_build_object('question_id', public.u('9a'), 'text', 'Bạn A'),
      jsonb_build_object('question_id', public.u('9b'), 'text', 'Bạn.A@Test.Local')))$$,
  'nộp đơn lần đầu thành công');
select throws_ok(
  $$select public.submit_application(public.u('b5'), jsonb_build_array(
      jsonb_build_object('question_id', public.u('9a'), 'text', 'Bạn A lần 2'),
      jsonb_build_object('question_id', public.u('9b'), 'text', 'bạn.a@test.local')))$$,
  'P0001', 'Email này đã nộp đơn cho vị trí này.', 'nộp lại cùng email (khác hoa/thường): lỗi thân thiện, không lộ key');
reset role;
select is((select count(*) from public.applications where position_id = public.u('b5'))::int, 1, 'chỉ có một đơn được ghi');
select is((select count(*) from public.application_answers aa join public.applications a on a.id = aa.application_id
           where a.position_id = public.u('b5'))::int, 0, 'lần nộp lỗi không để lại câu trả lời mồ côi');

-- ===========================================================================
-- 7. Trigger tạo câu hỏi "Thời gian có thể tham gia phỏng vấn"
-- ===========================================================================
-- Ca 5a (mục 1) đã được thêm vào vị trí bt (form f0t có 2 câu, order_index lớn nhất = 4) trước khi trigger test.
select is(
  (select to_jsonb(r) from (
     select question_type::text as t, is_required, field_key, order_index
     from public.form_questions
     where form_id = public.u('f07') and lower(btrim(question_text)) = lower('Thời gian có thể tham gia phỏng vấn')) r),
  jsonb_build_object('t', 'long_text', 'is_required', true, 'field_key', null, 'order_index', 5),
  'thêm ca: biểu mẫu tự có câu hỏi ca (long_text, bắt buộc, field_key null, order_index = max + 1)');
insert into public.interview_sessions (campaign_id, position_id, start_time, end_time) values
  (public.u('c7'), public.u('b7'), now() + interval '5 days', now() + interval '5 days 1 hour');
select is((select count(*) from public.form_questions
           where form_id = public.u('f07') and lower(btrim(question_text)) = lower('Thời gian có thể tham gia phỏng vấn'))::int, 1,
  'thêm ca thứ hai: không chèn trùng');
select lives_ok(
  $$insert into public.interview_sessions (campaign_id, position_id, start_time, end_time)
    values (public.u('c7'), public.u('b8'), now() + interval '5 days', now() + interval '5 days 1 hour')$$,
  'thêm ca cho vị trí chưa có biểu mẫu: không lỗi');
select is((select count(*) from public.application_forms where position_id = public.u('b8'))::int, 0,
  'không tự tạo biểu mẫu cho vị trí chưa có');
insert into public.interview_sessions (campaign_id, position_id, start_time, end_time) values
  (public.u('c7'), public.u('b9'), now() + interval '5 days', now() + interval '5 days 1 hour');
select is((select count(*) from public.form_questions where form_id = public.u('f09'))::int, 1,
  'biểu mẫu đã có câu hỏi ca (khác hoa/thường, có khoảng trắng): không thêm câu mới');

-- Admin có quyền recruitment thêm ca qua RLS: trigger (security definer) vẫn ghi được form_questions.
select public.tap_as(public.u('a2'));
select lives_ok(
  $$insert into public.interview_sessions (campaign_id, position_id, start_time, end_time)
    values (public.u('c5'), public.u('b5'), now() + interval '6 days', now() + interval '6 days 1 hour')$$,
  'admin recruitment thêm ca qua RLS');
reset role;
select is((select question_type::text from public.form_questions
           where form_id = public.u('f05') and lower(btrim(question_text)) = lower('Thời gian có thể tham gia phỏng vấn')),
  'long_text', 'trigger chạy dưới quyền hàm: câu hỏi được tạo dù người gọi là authenticated');

select ok(not has_function_privilege('anon', 'public.ensure_interview_availability_question()', 'execute')
  and not has_function_privilege('authenticated', 'public.ensure_interview_availability_question()', 'execute')
  and not has_function_privilege('anon', 'public.reset_task_reminders_on_due_change()', 'execute')
  and not has_function_privilege('authenticated', 'public.reset_task_reminders_on_due_change()', 'execute'),
  'hàm trigger mới không gọi được từ anon/authenticated');
select is(
  (select bool_and(prosecdef and proconfig @> array['search_path=public'])
   from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('ensure_interview_availability_question', 'reset_task_reminders_on_due_change')),
  true, 'hàm trigger mới là security definer có search_path = public');

-- ===========================================================================
-- 8. Dời hạn việc thì nhắc lại được
-- ===========================================================================
insert into public.tasks (id, club_id, title, due_at) values
  (public.u('7a'), public.u('c1'), 'Việc nhắc', now() + interval '3 days'),
  (public.u('7b'), public.u('c1'), 'Việc khác', now() + interval '3 days');
insert into public.task_assignees (task_id, member_id, reminded_before_at, reminded_overdue_at) values
  (public.u('7a'), public.u('f1'), now() - interval '1 hour', now() - interval '2 hours'),
  (public.u('7a'), public.u('e2'), now() - interval '1 hour', null),
  (public.u('7b'), public.u('f1'), now() - interval '1 hour', now() - interval '2 hours');
update public.tasks set title = 'Việc nhắc (đổi tên)' where id = public.u('7a');
select is((select count(*) from public.task_assignees where task_id = public.u('7a') and reminded_before_at is not null)::int, 2,
  'đổi tiêu đề (không đổi hạn): mốc nhắc giữ nguyên');
update public.tasks set due_at = due_at where id = public.u('7a');
select is((select count(*) from public.task_assignees where task_id = public.u('7a') and reminded_before_at is not null)::int, 2,
  'ghi lại đúng hạn cũ: mốc nhắc giữ nguyên');
update public.tasks set due_at = now() + interval '9 days' where id = public.u('7a');
select is((select count(*) from public.task_assignees
           where task_id = public.u('7a') and (reminded_before_at is not null or reminded_overdue_at is not null))::int, 0,
  'dời hạn: mọi người nhận của việc đó được xóa mốc nhắc');
select is((select count(*) from public.task_assignees where task_id = public.u('7b') and reminded_before_at is not null)::int, 1,
  'việc khác không bị ảnh hưởng');

-- ===========================================================================
-- 9. Thu quyền thừa
-- ===========================================================================
-- Quy tắc tổng quát: không có policy tương ứng thì không có quyền.
select is(
  (select coalesce(array_agg(c.relname || ':' || p.priv order by c.relname, p.priv), '{}'::text[])
   from pg_class c
   cross join (values ('insert'), ('update'), ('delete')) p(priv)
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and (case p.priv
            when 'delete' then has_table_privilege('authenticated', c.oid, 'delete')
            else has_any_column_privilege('authenticated', c.oid, p.priv) end)
     and not exists (
       select 1 from pg_policies pol
       where pol.schemaname = 'public' and pol.tablename = c.relname
         and (pol.roles && array['authenticated', 'public']::name[])
         and pol.cmd in ('ALL', upper(p.priv)))),
  '{}'::text[], 'authenticated không có quyền ghi nào thiếu policy tương ứng');
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}'::text[])
   from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and has_any_column_privilege('anon', c.oid, 'select')
     and not exists (
       select 1 from pg_policies pol
       where pol.schemaname = 'public' and pol.tablename = c.relname
         and (pol.roles && array['anon', 'public']::name[])
         and pol.cmd in ('ALL', 'SELECT'))),
  '{}'::text[], 'anon không đọc được bảng nào thiếu policy select cho anon');

select ok(
  not has_table_privilege('authenticated', 'public.application_answers', 'insert')
  and not has_table_privilege('authenticated', 'public.application_answers', 'update')
  and not has_table_privilege('authenticated', 'public.application_answers', 'delete')
  and not has_table_privilege('authenticated', 'public.applications', 'insert')
  and not has_table_privilege('authenticated', 'public.applications', 'delete')
  and not has_table_privilege('authenticated', 'public.club_members', 'insert')
  and not has_table_privilege('authenticated', 'public.club_members', 'update')
  and not has_table_privilege('authenticated', 'public.club_members', 'delete')
  and not has_table_privilege('authenticated', 'public.events', 'insert')
  and not has_table_privilege('authenticated', 'public.events', 'update')
  and not has_table_privilege('authenticated', 'public.events', 'delete')
  and not has_table_privilege('authenticated', 'public.profiles', 'insert')
  and not has_table_privilege('authenticated', 'public.profiles', 'delete'),
  'authenticated: đã thu quyền ghi thừa của application_answers, applications, club_members, events, profiles');
select ok(
  has_column_privilege('authenticated', 'public.applications', 'status', 'update')
  and has_any_column_privilege('authenticated', 'public.profiles', 'update'),
  'authenticated vẫn đổi được status đơn và cập nhật hồ sơ (có policy)');
select ok(
  not has_table_privilege('anon', 'public.application_answers', 'select')
  and not has_table_privilege('anon', 'public.applications', 'select')
  and not has_table_privilege('anon', 'public.club_members', 'select')
  and not has_table_privilege('anon', 'public.form_template_questions', 'select')
  and not has_table_privilege('anon', 'public.form_templates', 'select')
  and not has_table_privilege('anon', 'public.interview_assignments', 'select')
  and not has_table_privilege('anon', 'public.interview_session_members', 'select')
  and not has_table_privilege('anon', 'public.profiles', 'select'),
  'anon: đã thu select của 8 bảng không có policy cho anon');
select ok(
  has_any_column_privilege('anon', 'public.clubs', 'select')
  and has_any_column_privilege('anon', 'public.teams', 'select')
  and has_any_column_privilege('anon', 'public.events', 'select')
  and has_any_column_privilege('anon', 'public.recruitment_campaigns', 'select')
  and has_any_column_privilege('anon', 'public.recruitment_positions', 'select')
  and has_any_column_privilege('anon', 'public.application_forms', 'select')
  and has_any_column_privilege('anon', 'public.form_questions', 'select'),
  'anon vẫn đọc được các bảng công khai');

-- Luồng còn lại vẫn chạy: thành viên tự sửa hồ sơ qua hàm security definer, admin đổi status đơn.
select public.tap_as(public.u('a2'));
select lives_ok($$update public.applications set status = 'screening' where id = public.u('aa1')$$,
  'admin recruitment vẫn đổi được status đơn');
select throws_ok($$insert into public.club_members (club_id, full_name) values (public.u('c1'), 'Lậu')$$,
  '42501', null, 'authenticated insert club_members trực tiếp bị chặn (thiếu quyền)');
select throws_ok($$delete from public.applications where id = public.u('aa1')$$,
  '42501', null, 'authenticated delete applications trực tiếp bị chặn (thiếu quyền)');
reset role;

-- ===========================================================================
-- 10. Index
-- ===========================================================================
select has_index('public', 'application_answers', 'application_answers_question_idx', 'index application_answers(question_id)');
select has_index('public', 'interview_session_members', 'interview_session_members_member_idx', 'index interview_session_members(member_id)');
select has_index('public', 'club_members', 'club_members_user_idx', 'index club_members(user_id)');

select * from finish();
rollback;
