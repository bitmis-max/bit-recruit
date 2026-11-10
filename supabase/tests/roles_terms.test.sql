-- pgTAP: vai trò (owner/admin/member), nhiệm kỳ, kết nạp. Theo docs/CONTRACT.md mục 2.
-- Chạy: npx supabase test db   (cần npx supabase db reset để áp migration mới nhất)
begin;
select plan(107);

-- ---------------------------------------------------------------------------
-- Helper (mất khi rollback): giả lập user đăng nhập
-- ---------------------------------------------------------------------------
create function public.tap_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

-- ---------------------------------------------------------------------------
-- Dữ liệu nền (chạy bằng quyền postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@bit.test',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@bit.test',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'member@bit.test',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'member2@bit.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'ownerb@bit.test',  'authenticated', 'authenticated');

insert into public.clubs (id, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'CLB A'),
  ('00000000-0000-0000-0000-0000000000c2', 'CLB B');

insert into public.teams (id, club_id, name) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'Ban Truyền thông');

-- club_members: id, club, user, role, name, active, student_code, email, title
insert into public.club_members (id, club_id, user_id, role, full_name, is_active, student_code, email, title) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'owner',  'Owner A',    true,  'OWN1', null, 'Chủ nhiệm cũ'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', 'admin',  'Admin A',    true,  'ADM1', null, 'Phó cũ'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3', 'member', 'Member 1',   true,  'MEM1', null, null),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a4', 'member', 'Member 2',   true,  'MEM2', null, null),
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000c1', null,                                   'admin',  'Người ngoài', true, 'OUT1', null, 'Trưởng ban cũ'),
  ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000c1', null,                                   'member', 'Đã nghỉ',    false, 'INA1', null, null),
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000c1', null,                                   'owner',  'Owner không TK', true, 'OWN2', null, null),
  ('00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-0000000000c1', null,                                   'member', 'Đã có sẵn',  true,  'EXIST1', null, null),
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000c1', null,                                   'member', 'Có mail sẵn', true, null, 'ex.mail@bit.test', null),
  ('00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000c1', null,                                   'admin',  'Admin cũ đã nghỉ', false, 'OLD1', null, 'Phó cũ đã nghỉ'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 'owner',  'Owner B',    true,  'OB1', null, null),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c2', null,                                   'owner',  'Owner B không TK', true, 'OB2', null, null);

-- Đợt 4: admin fixture được cấp đủ 5 quyền chức năng; e1 (CLB A) và f1 (CLB B) là Chủ nhiệm (is_head).
update public.club_members set permissions = array['events', 'recruitment', 'members', 'mail', 'facebook'] where role = 'admin';
update public.club_members set is_head = true where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1');

-- Tuyển sinh (CLB A): campaign mở, 1 vị trí thuộc ban Truyền thông, 1 form
insert into public.recruitment_campaigns (id, club_id, name, status) values
  ('00000000-0000-0000-0000-000000000c91', '00000000-0000-0000-0000-0000000000c1', 'Gen 17', 'open');
insert into public.recruitment_positions (id, campaign_id, team_id, name) values
  ('00000000-0000-0000-0000-000000000a91', '00000000-0000-0000-0000-000000000c91', '00000000-0000-0000-0000-0000000000d1', 'Thành viên Truyền thông');
insert into public.application_forms (id, position_id, name) values
  ('00000000-0000-0000-0000-000000000f91', '00000000-0000-0000-0000-000000000a91', 'Form Truyền thông');
insert into public.form_questions (id, form_id, question_text, question_type, field_key, is_required, order_index) values
  ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000f91', 'Họ tên',       'text', 'full_name',    true,  1),
  ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000f91', 'Email',        'text', 'email',        true,  2),
  ('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000f91', 'Link Facebook','text', 'facebook_url',  false, 3);

-- Đơn ứng tuyển
insert into public.applications (id, campaign_id, position_id, full_name, email, phone, student_code, class_name, status, facebook_url) values
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-000000000c91', '00000000-0000-0000-0000-000000000a91', 'Ứng viên 1', 'p1@test.local', '0911111111', 'S001', 'K20A', 'passed',    'https://facebook.com/p1'),
  ('00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-000000000c91', '00000000-0000-0000-0000-000000000a91', 'Ứng viên 2', 'p2@test.local', '0922222222', 'S002', 'K20B', 'passed',    null),
  ('00000000-0000-0000-0000-00000000aa03', '00000000-0000-0000-0000-000000000c91', '00000000-0000-0000-0000-000000000a91', 'Ứng viên 3', 'p3@test.local', null,         'S003', null,   'submitted', null),
  ('00000000-0000-0000-0000-00000000aa04', '00000000-0000-0000-0000-000000000c91', '00000000-0000-0000-0000-000000000a91', 'Trùng MSSV', 'dupcode@test.local', null,     'EXIST1', null, 'passed',    null),
  ('00000000-0000-0000-0000-00000000aa05', '00000000-0000-0000-0000-000000000c91', '00000000-0000-0000-0000-000000000a91', 'Trùng mail', 'ex.mail@bit.test', null,       'S005', null,   'passed',    null),
  ('00000000-0000-0000-0000-00000000aa06', '00000000-0000-0000-0000-000000000c91', '00000000-0000-0000-0000-000000000a91', 'Đơn cho CLB khác thử', 'x6@test.local', null, 'S006', null,  'passed',    null);

-- Phiên phỏng vấn + phân công + câu trả lời để thử RLS
insert into public.interview_sessions (id, campaign_id, position_id, start_time, end_time) values
  ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-000000000c91', '00000000-0000-0000-0000-000000000a91', now() + interval '1 day', now() + interval '1 day 1 hour');
insert into public.interview_assignments (application_id, session_id) values
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-00000000bb01');
insert into public.application_answers (application_id, question_id, answer_text) values
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-000000000093', 'https://facebook.com/p1');

-- Nhiệm kỳ (CLB A)
insert into public.club_terms (id, club_id, name, start_date, end_date, status) values
  ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-0000000000c1', 'Nhiệm kỳ 2025', '2025-01-01', null, 'active'),
  ('00000000-0000-0000-0000-00000000ee02', '00000000-0000-0000-0000-0000000000c1', 'Nhiệm kỳ 2026', '2026-01-01', '2026-12-31', 'draft'),
  ('00000000-0000-0000-0000-00000000ee03', '00000000-0000-0000-0000-0000000000c1', 'Thiếu owner',   null, null, 'draft'),
  ('00000000-0000-0000-0000-00000000ee04', '00000000-0000-0000-0000-0000000000c1', 'Owner không TK', null, null, 'draft'),
  ('00000000-0000-0000-0000-00000000ee05', '00000000-0000-0000-0000-0000000000c1', 'Để thử insert',  null, null, 'draft');

insert into public.club_term_roles (term_id, member_id, role, title, team_id, is_head, permissions) values
  ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-0000000000e1', 'owner', 'Chủ nhiệm cũ', null, true, '{}'),
  ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-0000000000e5', 'admin', 'Trưởng ban cũ', null, false, '{}'),
  -- ee02: kỳ mới. Owner giữ nguyên, admin có ban, người đã nghỉ được đưa vào lại, e5 KHÔNG có trong danh sách
  ('00000000-0000-0000-0000-00000000ee02', '00000000-0000-0000-0000-0000000000e1', 'owner', 'Chủ nhiệm 2026', null, true, '{}'),
  ('00000000-0000-0000-0000-00000000ee02', '00000000-0000-0000-0000-0000000000e2', 'admin', 'Phó chủ nhiệm 2026', '00000000-0000-0000-0000-0000000000d1', false, array['events', 'recruitment', 'members', 'mail', 'facebook']),
  ('00000000-0000-0000-0000-00000000ee02', '00000000-0000-0000-0000-0000000000e6', 'admin', 'Trưởng ban mới', null, false, '{}'),
  -- ee03: chỉ có admin, không có Chủ nhiệm
  ('00000000-0000-0000-0000-00000000ee03', '00000000-0000-0000-0000-0000000000e2', 'admin', 'Phó', null, false, '{}'),
  -- ee04: Chủ nhiệm nhưng không có tài khoản
  ('00000000-0000-0000-0000-00000000ee04', '00000000-0000-0000-0000-0000000000e7', 'owner', 'Chủ nhiệm', null, true, '{}'),
  ('00000000-0000-0000-0000-00000000ee04', '00000000-0000-0000-0000-0000000000e2', 'admin', 'Phó', null, false, '{}');

-- ===========================================================================
-- 1. RLS đọc: member không đọc được dữ liệu tuyển sinh, admin đọc được
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a3'); -- member
select is((select count(*) from public.applications)::int, 0, 'member KHÔNG đọc được applications');
select is((select count(*) from public.application_answers)::int, 0, 'member KHÔNG đọc được application_answers');
select is((select count(*) from public.interview_assignments)::int, 0, 'member KHÔNG đọc được interview_assignments');
select is((select count(*) from public.club_terms)::int, 0, 'member KHÔNG đọc được club_terms');
select is((select count(*) from public.club_term_roles)::int, 0, 'member KHÔNG đọc được club_term_roles');
select is((select count(*) from public.club_members)::int, 1, 'member chỉ thấy dòng club_members của mình');
select is(public.is_club_owner('00000000-0000-0000-0000-0000000000c1'), false, 'is_club_owner = false với member');

reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin
select is((select count(*) from public.applications)::int, 6, 'admin đọc được applications');
select is((select count(*) from public.application_answers)::int, 1, 'admin đọc được application_answers');
select is((select count(*) from public.interview_assignments)::int, 1, 'admin đọc được interview_assignments');
select is((select count(*) from public.club_terms)::int, 5, 'admin đọc được club_terms');
select is((select count(*) from public.club_term_roles)::int, 8, 'admin đọc được club_term_roles');
select is(public.is_club_owner('00000000-0000-0000-0000-0000000000c1'), false, 'is_club_owner = false với admin');
select throws_ok(
  $$insert into public.club_term_roles (term_id, member_id, role) values
    ('00000000-0000-0000-0000-00000000ee05', '00000000-0000-0000-0000-0000000000e2', 'admin')$$,
  '42501', null, 'admin (không phải owner) KHÔNG insert được club_term_roles (RLS)');
select lives_ok(
  $$update public.applications set status = 'screening' where id = '00000000-0000-0000-0000-00000000aa03'$$,
  'admin vẫn update được applications.status');
select throws_ok(
  $$update public.applications set full_name = 'Sửa trái phép' where id = '00000000-0000-0000-0000-00000000aa03'$$,
  '42501', null, 'admin KHÔNG update được cột khác ngoài status (full_name)');
select throws_ok(
  $$update public.applications set admitted_member_id = null where id = '00000000-0000-0000-0000-00000000aa03'$$,
  '42501', null, 'admin KHÔNG update được admitted_member_id trực tiếp');

reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000a1'); -- owner
select is(public.is_club_owner('00000000-0000-0000-0000-0000000000c1'), true, 'is_club_owner = true với owner');
select is(public.is_club_owner('00000000-0000-0000-0000-0000000000c2'), false, 'is_club_owner = false với CLB khác');
select lives_ok(
  $$insert into public.club_term_roles (term_id, member_id, role) values
    ('00000000-0000-0000-0000-00000000ee05', '00000000-0000-0000-0000-0000000000e2', 'admin')$$,
  'owner insert được club_term_roles vào term draft');
select throws_ok(
  $$insert into public.club_term_roles (term_id, member_id, role) values
    ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-0000000000e2', 'admin')$$,
  '42501', null, 'owner KHÔNG insert được vào term đã active (RLS)');

-- Quyền cột: owner tạo term không gửi status; upsert kiểu PostgREST
select lives_ok(
  $$insert into public.club_terms (club_id, name, start_date, end_date) values
    ('00000000-0000-0000-0000-0000000000c1', 'Nhiệm kỳ nháp mới', '2027-01-01', '2027-12-31')$$,
  'owner insert club_terms không gửi status thì thành công');
select is((select status from public.club_terms where name = 'Nhiệm kỳ nháp mới'), 'draft', 'club_terms.status mặc định là draft');
select throws_ok(
  $$insert into public.club_terms (club_id, name, status) values
    ('00000000-0000-0000-0000-0000000000c1', 'Gian lận status', 'active')$$,
  '42501', null, 'owner insert club_terms có cột status bị lỗi quyền');
select lives_ok(
  $$insert into public.club_term_roles (term_id, member_id, role, title, team_id)
    values ('00000000-0000-0000-0000-00000000ee05', '00000000-0000-0000-0000-0000000000e3', 'admin', 'Trưởng ban A', null)
    on conflict (term_id, member_id) do update set term_id = excluded.term_id, member_id = excluded.member_id,
      role = excluded.role, title = excluded.title, team_id = excluded.team_id$$,
  'owner upsert club_term_roles (kiểu PostgREST) lần 1 thành công');
select lives_ok(
  $$insert into public.club_term_roles (term_id, member_id, role, title, team_id)
    values ('00000000-0000-0000-0000-00000000ee05', '00000000-0000-0000-0000-0000000000e3', 'admin', 'Trưởng ban B', null)
    on conflict (term_id, member_id) do update set term_id = excluded.term_id, member_id = excluded.member_id,
      role = excluded.role, title = excluded.title, team_id = excluded.team_id$$,
  'owner upsert club_term_roles lần 2 (đổi title) thành công');
select is((select title from public.club_term_roles where term_id = '00000000-0000-0000-0000-00000000ee05' and member_id = '00000000-0000-0000-0000-0000000000e3'), 'Trưởng ban B', 'upsert lần 2 đã đổi title');

reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin
select throws_ok(
  $$insert into public.club_term_roles (term_id, member_id, role, title, team_id)
    values ('00000000-0000-0000-0000-00000000ee05', '00000000-0000-0000-0000-0000000000e4', 'admin', 'X', null)
    on conflict (term_id, member_id) do update set term_id = excluded.term_id, member_id = excluded.member_id,
      role = excluded.role, title = excluded.title, team_id = excluded.team_id$$,
  '42501', null, 'admin (không phải owner) upsert club_term_roles bị chặn');

-- ===========================================================================
-- 2. activate_term
-- ===========================================================================
reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin, không phải owner
select throws_like(
  $$select public.activate_term('00000000-0000-0000-0000-00000000ee02')$$, '%',
  'activate_term: admin (không phải owner) bị lỗi');

reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000b1'); -- owner CLB khác
select throws_like(
  $$select public.activate_term('00000000-0000-0000-0000-00000000ee02')$$, '%',
  'activate_term: owner của CLB khác bị lỗi');

reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000a1'); -- owner đúng
select throws_like(
  $$select public.activate_term('00000000-0000-0000-0000-00000000ee03')$$, '%',
  'activate_term: danh sách không có Chủ nhiệm thì lỗi');
select throws_like(
  $$select public.activate_term('00000000-0000-0000-0000-00000000ee04')$$, '%',
  'activate_term: Chủ nhiệm trong danh sách không có user_id thì lỗi');
select throws_like(
  $$select public.activate_term('00000000-0000-0000-0000-00000000ee01')$$, '%',
  'activate_term: term không phải draft (đang active) thì lỗi');

-- lỗi không được để lại thay đổi nào
reset role;
select is((select status from public.club_terms where id = '00000000-0000-0000-0000-00000000ee01'), 'active', 'sau lần gọi lỗi: term cũ vẫn active');
select is((select role::text from public.club_members where id = '00000000-0000-0000-0000-0000000000e5'), 'admin', 'sau lần gọi lỗi: vai trò người ngoài danh sách chưa đổi');

-- thành công
select public.tap_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$select public.activate_term('00000000-0000-0000-0000-00000000ee02')$$,
  'activate_term: owner kích hoạt term hợp lệ thành công');

reset role;
select is((select role::text from public.club_members where id = '00000000-0000-0000-0000-0000000000e5'), 'member', 'người ngoài danh sách -> role member');
select is((select title from public.club_members where id = '00000000-0000-0000-0000-0000000000e5'), null, 'người ngoài danh sách -> title null');
select is((select role::text from public.club_members where id = '00000000-0000-0000-0000-0000000000e7'), 'member', 'owner cũ không có TK, ngoài danh sách -> role member');
select is((select role::text from public.club_members where id = '00000000-0000-0000-0000-0000000000e1'), 'owner', 'owner trong danh sách giữ role owner');
select is((select title from public.club_members where id = '00000000-0000-0000-0000-0000000000e1'), 'Chủ nhiệm 2026', 'owner được cập nhật title');
select is((select role::text from public.club_members where id = '00000000-0000-0000-0000-0000000000e2'), 'admin', 'admin trong danh sách giữ role admin');
select is((select title from public.club_members where id = '00000000-0000-0000-0000-0000000000e2'), 'Phó chủ nhiệm 2026', 'admin được cập nhật title');
select is((select team_id from public.club_members where id = '00000000-0000-0000-0000-0000000000e2'), '00000000-0000-0000-0000-0000000000d1'::uuid, 'team_id được cập nhật khi khác null');
select is((select is_active from public.club_members where id = '00000000-0000-0000-0000-0000000000e6'), true, 'thành viên trong danh sách được is_active = true');
select is((select role::text from public.club_members where id = '00000000-0000-0000-0000-0000000000e6'), 'admin', 'thành viên (đã nghỉ) trong danh sách nhận role admin');
select is((select role::text from public.club_members where id = '00000000-0000-0000-0000-0000000000e3'), 'member', 'member thường vẫn là member');
select is((select role::text from public.club_members where id = '00000000-0000-0000-0000-0000000000ea'), 'member', 'admin cũ đã nghỉ (is_active=false) ngoài danh sách -> role member');
select is((select title from public.club_members where id = '00000000-0000-0000-0000-0000000000ea'), null, 'admin cũ đã nghỉ ngoài danh sách -> title null');
select is((select status from public.club_terms where id = '00000000-0000-0000-0000-00000000ee01'), 'ended', 'term cũ -> ended');
select is((select end_date from public.club_terms where id = '00000000-0000-0000-0000-00000000ee01'), current_date, 'term cũ end_date null -> đặt bằng hôm nay');
select is((select status from public.club_terms where id = '00000000-0000-0000-0000-00000000ee02'), 'active', 'term mới -> active');
select isnt((select activated_at from public.club_terms where id = '00000000-0000-0000-0000-00000000ee02'), null, 'term mới có activated_at');
select is((select activated_by from public.club_terms where id = '00000000-0000-0000-0000-00000000ee02'), '00000000-0000-0000-0000-0000000000a1'::uuid, 'term mới có activated_by = người kích hoạt');
select is((select end_date from public.club_terms where id = '00000000-0000-0000-0000-00000000ee02'), '2026-12-31'::date, 'term mới giữ nguyên end_date đã đặt');
select is((select count(*) from public.club_terms where club_id = '00000000-0000-0000-0000-0000000000c1' and status = 'active')::int, 1, 'chỉ có 1 term active mỗi CLB');
select throws_ok(
  $$update public.club_terms set status = 'active' where id = '00000000-0000-0000-0000-00000000ee05'$$,
  '23505', null, 'unique index: không thể có 2 term active cùng CLB');
select throws_like(
  $$insert into public.club_term_roles (term_id, member_id, role) values
    ('00000000-0000-0000-0000-00000000ee05', '00000000-0000-0000-0000-0000000000f1', 'owner')$$, '%',
  'club_term_roles: member khác CLB với term bị chặn (trigger)');

-- ===========================================================================
-- 3. Trigger bảo vệ owner cuối cùng (CLB B: f1 có TK, f2 không TK)
-- ===========================================================================
set constraints all immediate;
select lives_ok(
  $$update public.club_members set role = 'admin' where id = '00000000-0000-0000-0000-0000000000f2'$$,
  'hạ owner KHÔNG có tài khoản khi vẫn còn owner có TK thì được');
select throws_like(
  $$update public.club_members set role = 'admin', is_head = false where id = '00000000-0000-0000-0000-0000000000f1'$$, '%Chủ nhiệm%',
  'hạ owner cuối cùng có TK (Chủ nhiệm duy nhất) -> lỗi');
select throws_like(
  $$delete from public.club_members where id = '00000000-0000-0000-0000-0000000000f1'$$, '%Chủ nhiệm%',
  'xóa owner cuối cùng có TK -> lỗi');
select throws_like(
  $$update public.club_members set is_active = false where id = '00000000-0000-0000-0000-0000000000f1'$$, '%Chủ nhiệm%',
  'tắt is_active owner cuối cùng -> lỗi');
select throws_like(
  $$update public.club_members set user_id = null where id = '00000000-0000-0000-0000-0000000000f1'$$, '%Chủ nhiệm%',
  'gỡ user_id owner cuối cùng -> lỗi');
select lives_ok(
  $$delete from public.clubs where id = '00000000-0000-0000-0000-0000000000c2'$$,
  'xóa cả CLB (cascade member) không bị trigger chặn');
set constraints all deferred;

-- ===========================================================================
-- 4. admit_applications (CLB A)
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a3'); -- member thường
select throws_like(
  $$select public.admit_applications(array['00000000-0000-0000-0000-00000000aa01'::uuid])$$, '%',
  'admit_applications: member thường bị lỗi');

reset role;
select is((select admitted_member_id from public.applications where id = '00000000-0000-0000-0000-00000000aa01'), null, 'member gọi lỗi: đơn chưa bị gắn admitted_member_id');

-- owner CLB khác (B) đã bị xóa ở bước 3; dùng user chưa có membership nào: a4 là member A. Thử bằng user không thuộc CLB nào.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000b9', 'stranger@bit.test', 'authenticated', 'authenticated');
select public.tap_as('00000000-0000-0000-0000-0000000000b9');
select throws_like(
  $$select public.admit_applications(array['00000000-0000-0000-0000-00000000aa06'::uuid])$$, '%',
  'admit_applications: người không thuộc CLB bị lỗi');

reset role;
select is((select count(*) from public.club_members where club_id = '00000000-0000-0000-0000-0000000000c1')::int, 10, 'trước khi kết nạp: CLB A có 10 thành viên');

select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin
select is(
  public.admit_applications(array[
    '00000000-0000-0000-0000-00000000aa01'::uuid, '00000000-0000-0000-0000-00000000aa02'::uuid,
    '00000000-0000-0000-0000-00000000aa03'::uuid, '00000000-0000-0000-0000-00000000aa04'::uuid,
    '00000000-0000-0000-0000-00000000aa05'::uuid]),
  '{"admitted": 4, "skipped": 1}'::jsonb,
  'admit_applications lần 1: 4 passed được nhận, 1 đơn không passed bị bỏ qua');

reset role;
select is((select count(*) from public.club_members where club_id = '00000000-0000-0000-0000-0000000000c1')::int, 12, 'sau kết nạp: chỉ thêm 2 thành viên mới (2 đơn trùng được gắn vào người sẵn có)');
select is((select role::text from public.club_members where club_id = '00000000-0000-0000-0000-0000000000c1' and student_code = 'S001'), 'member', 'thành viên mới có role member');
select is((select team_id from public.club_members where club_id = '00000000-0000-0000-0000-0000000000c1' and student_code = 'S001'), '00000000-0000-0000-0000-0000000000d1'::uuid, 'team lấy từ recruitment_positions.team_id');
select results_eq(
  $$select full_name, class_name, email, phone, facebook_url from public.club_members where club_id = '00000000-0000-0000-0000-0000000000c1' and student_code = 'S001'$$,
  $$values ('Ứng viên 1'::text, 'K20A'::text, 'p1@test.local'::text, '0911111111'::text, 'https://facebook.com/p1'::text)$$,
  'thông tin được copy từ đơn (tên, lớp, email, SĐT, Facebook)');
select isnt((select admitted_member_id from public.applications where id = '00000000-0000-0000-0000-00000000aa01'), null, 'đơn passed có admitted_member_id');
select is(
  (select admitted_member_id from public.applications where id = '00000000-0000-0000-0000-00000000aa01'),
  (select id from public.club_members where club_id = '00000000-0000-0000-0000-0000000000c1' and student_code = 'S001'),
  'admitted_member_id trỏ đúng thành viên mới');
select is((select admitted_member_id from public.applications where id = '00000000-0000-0000-0000-00000000aa03'), null, 'đơn chưa passed KHÔNG được kết nạp');
select is((select admitted_member_id from public.applications where id = '00000000-0000-0000-0000-00000000aa04'), '00000000-0000-0000-0000-0000000000e8'::uuid, 'trùng student_code -> gắn vào thành viên sẵn có');
select is((select admitted_member_id from public.applications where id = '00000000-0000-0000-0000-00000000aa05'), '00000000-0000-0000-0000-0000000000e9'::uuid, 'trùng email -> gắn vào thành viên sẵn có');
select is((select count(*) from public.club_members where club_id = '00000000-0000-0000-0000-0000000000c1' and student_code = 'EXIST1')::int, 1, 'không tạo trùng student_code');

select public.tap_as('00000000-0000-0000-0000-0000000000a2');
select is(
  public.admit_applications(array[
    '00000000-0000-0000-0000-00000000aa01'::uuid, '00000000-0000-0000-0000-00000000aa02'::uuid,
    '00000000-0000-0000-0000-00000000aa03'::uuid, '00000000-0000-0000-0000-00000000aa04'::uuid,
    '00000000-0000-0000-0000-00000000aa05'::uuid]),
  '{"admitted": 0, "skipped": 5}'::jsonb,
  'admit_applications lần 2 (chạy lại): không nhận thêm, skipped = 5');
reset role;
select is((select count(*) from public.club_members where club_id = '00000000-0000-0000-0000-0000000000c1')::int, 12, 'chạy lần 2 không tạo trùng thành viên');

-- ===========================================================================
-- 5. update_my_member_profile
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a3'); -- member 1
select lives_ok(
  $$select public.update_my_member_profile('00000000-0000-0000-0000-0000000000c1', '0900000001', 'https://www.facebook.com/member1')$$,
  'update_my_member_profile: cập nhật hợp lệ');
reset role;
select is((select phone from public.club_members where id = '00000000-0000-0000-0000-0000000000e3'), '0900000001', 'SĐT của mình được cập nhật');
select is((select facebook_url from public.club_members where id = '00000000-0000-0000-0000-0000000000e3'), 'https://www.facebook.com/member1', 'Facebook của mình được cập nhật');
select is((select phone from public.club_members where id = '00000000-0000-0000-0000-0000000000e4'), null, 'dòng của member khác KHÔNG bị đổi');

select public.tap_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok($$select public.update_my_member_profile('00000000-0000-0000-0000-0000000000c1', '0900000001', 'https://fb.com/abc')$$, 'link fb.com hợp lệ');
select lives_ok($$select public.update_my_member_profile('00000000-0000-0000-0000-0000000000c1', '0900000001', 'https://m.facebook.com/profile.php?id=1')$$, 'link m.facebook.com hợp lệ');
select throws_like($$select public.update_my_member_profile('00000000-0000-0000-0000-0000000000c1', '0900000001', 'http://facebook.com/abc')$$, '%', 'link http (không https) bị lỗi');
select throws_like($$select public.update_my_member_profile('00000000-0000-0000-0000-0000000000c1', '0900000001', 'https://example.com/abc')$$, '%', 'link không phải facebook bị lỗi');
select throws_like($$select public.update_my_member_profile('00000000-0000-0000-0000-0000000000c1', '0900000001', 'https://facebook.com.evil.com/abc')$$, '%', 'link giả mạo tên miền bị lỗi');
select throws_like($$select public.update_my_member_profile('00000000-0000-0000-0000-0000000000c1', '0900000001', 'https://facebook.com/')$$, '%', 'link facebook không có đường dẫn bị lỗi');
select throws_like($$select public.update_my_member_profile('00000000-0000-0000-0000-0000000000c1', '0900000001', 'javascript:alert(1)')$$, '%', 'link javascript: bị lỗi');
reset role;
select is((select facebook_url from public.club_members where id = '00000000-0000-0000-0000-0000000000e3'), 'https://m.facebook.com/profile.php?id=1', 'link sai không ghi đè link đúng trước đó');

select public.tap_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok($$select public.update_my_member_profile('00000000-0000-0000-0000-0000000000c1', '0900000002', '')$$, 'link rỗng được chấp nhận');
reset role;
select is((select facebook_url from public.club_members where id = '00000000-0000-0000-0000-0000000000e3'), null, 'link rỗng -> null');

-- gọi cho CLB mà mình không phải thành viên: lỗi hoặc không làm gì, nhưng không được đổi dữ liệu người khác
select public.tap_as('00000000-0000-0000-0000-0000000000b9'); -- stranger
do $$ begin
  perform public.update_my_member_profile('00000000-0000-0000-0000-0000000000c1', '0666', 'https://facebook.com/hack');
exception when others then null;
end $$;
reset role;
select is((select count(*) from public.club_members where phone = '0666' or facebook_url = 'https://facebook.com/hack')::int, 0, 'người ngoài CLB không sửa được hồ sơ ai cả');

set local role anon;
select throws_like($$select public.update_my_member_profile('00000000-0000-0000-0000-0000000000c1', '0666', null)$$, '%', 'anon không gọi được update_my_member_profile');
reset role;

-- ===========================================================================
-- 6. submit_application lưu facebook_url (gọi như người dùng ẩn danh)
-- ===========================================================================
set local role anon;
select lives_ok(
  $$select public.submit_application('00000000-0000-0000-0000-000000000a91', jsonb_build_array(
      jsonb_build_object('question_id', '00000000-0000-0000-0000-000000000091', 'text', 'Ứng viên Mới'),
      jsonb_build_object('question_id', '00000000-0000-0000-0000-000000000092', 'text', 'NewApplicant@Test.Local'),
      jsonb_build_object('question_id', '00000000-0000-0000-0000-000000000093', 'text', 'https://facebook.com/newapp')))$$,
  'submit_application có câu hỏi facebook_url chạy thành công');
select lives_ok(
  $$select public.submit_application('00000000-0000-0000-0000-000000000a91', jsonb_build_array(
      jsonb_build_object('question_id', '00000000-0000-0000-0000-000000000091', 'text', 'Không Facebook'),
      jsonb_build_object('question_id', '00000000-0000-0000-0000-000000000092', 'text', 'nofb@test.local')))$$,
  'submit_application bỏ trống facebook_url (không bắt buộc) vẫn thành công');
reset role;
select is((select facebook_url from public.applications where email = 'newapplicant@test.local'), 'https://facebook.com/newapp', 'applications.facebook_url được lưu');
select is((select full_name from public.applications where email = 'newapplicant@test.local'), 'Ứng viên Mới', 'full_name vẫn được lưu');
select is((select facebook_url from public.applications where email = 'nofb@test.local'), null, 'không điền Facebook -> facebook_url null');
select is((select count(*) from public.application_answers a join public.applications p on p.id = a.application_id where p.email = 'newapplicant@test.local')::int, 0, 'câu trả lời field_key không bị lưu trùng vào application_answers');

-- ===========================================================================
-- 7. anon không execute được các hàm quản trị
-- ===========================================================================
set local role anon;
select throws_ok($$select public.activate_term('00000000-0000-0000-0000-00000000ee05')$$, '42501', null, 'anon không execute được activate_term');
select throws_ok($$select public.admit_applications(array['00000000-0000-0000-0000-00000000aa06'::uuid])$$, '42501', null, 'anon không execute được admit_applications');
select throws_ok($$select public.update_my_member_profile('00000000-0000-0000-0000-0000000000c1', '0666', null)$$, '42501', null, 'anon không execute được update_my_member_profile');
select throws_ok($$select public.is_club_owner('00000000-0000-0000-0000-0000000000c1')$$, '42501', null, 'anon không execute được is_club_owner');
reset role;

select * from finish();
rollback;
