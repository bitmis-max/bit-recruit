-- pgTAP: import_members (import thành viên từ Excel/CSV). Theo docs/CONTRACT.md mục 1 và 3.
-- Chạy: npx supabase test db   (cần npx supabase db reset để áp migration 20261116000000_import_members.sql)
begin;
select plan(65);

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

-- ---------------------------------------------------------------------------
-- Dữ liệu nền (quyền postgres)
-- ---------------------------------------------------------------------------
-- CLB c1: a1 Chủ nhiệm (is_head), a2 owner không is_head, a3 admin{members} ban d1,
--         a4 admin{recruitment} ban d2, a6 member.  CLB c2: b1 Chủ nhiệm, b2 admin{members}.
insert into auth.users (id, email, aud, role)
select public.u(x), x || '@bit.test', 'authenticated', 'authenticated'
from unnest(array['a1','a2','a3','a4','a6','b1','b2']) x;

insert into public.clubs (id, name) values (public.u('c1'), 'CLB A'), (public.u('c2'), 'CLB B');
insert into public.teams (id, club_id, name) values
  (public.u('d1'), public.u('c1'), 'Ban Truyền thông'),
  (public.u('d2'), public.u('c1'), 'Ban Chuyên môn'),
  (public.u('d3'), public.u('c2'), 'Ban của CLB B');

insert into public.club_members
  (id, club_id, user_id, team_id, role, full_name, is_active, student_code, email, permissions, is_head) values
  (public.u('e1'), public.u('c1'), public.u('a1'), null,          'owner',  'Chủ nhiệm',     true, 'E1', 'e1@t.test', '{}', true),
  (public.u('e2'), public.u('c1'), public.u('a2'), public.u('d1'), 'owner',  'Phó chủ nhiệm', true, 'E2', 'e2@t.test', '{}', false),
  (public.u('e3'), public.u('c1'), public.u('a3'), public.u('d1'), 'admin',  'Admin members', true, 'E3', 'e3@t.test', array['members'], false),
  (public.u('e4'), public.u('c1'), public.u('a4'), public.u('d2'), 'admin',  'Admin recruit', true, 'E4', 'e4@t.test', array['recruitment'], false),
  (public.u('e6'), public.u('c1'), public.u('a6'), public.u('d1'), 'member', 'Member',        true, 'E6', null, '{}', false),
  (public.u('f1'), public.u('c2'), public.u('b1'), null,          'owner',  'Chủ nhiệm B',   true, 'F1', 'f1@t.test', '{}', true),
  (public.u('f2'), public.u('c2'), public.u('b2'), public.u('d3'), 'admin',  'Admin B',       true, 'F2', 'f2@t.test', array['members'], false);

insert into public.club_members
  (id, club_id, team_id, role, full_name, is_active, student_code, class_name, email, phone, facebook_url, title) values
  (public.u('aa01'), public.u('c1'), public.u('d1'), 'member', 'Cũ Một', true,  'S100', 'K1', 'm1@x.com', '111', 'https://facebook.com/m1', 'Trưởng nhóm'),
  (public.u('aa02'), public.u('c1'), null,          'member', 'Cũ Hai',  true,  'S200', null, 'm2@x.com', null,  null, null),
  (public.u('aa03'), public.u('c1'), null,          'member', 'Cũ Ba',   false, 'S300', null, 'm3@x.com', null,  null, null),
  (public.u('aa04'), public.u('c1'), null,          'member', 'Cũ Bốn',  true,  'S400', null, 'm4@t.test', null, null, null);

-- Số thành viên đang có trong CLB A
select is((select count(*) from public.club_members where club_id = public.u('c1'))::int, 9,
  'dữ liệu nền: CLB A có 9 thành viên');

-- ===========================================================================
-- 1. Quyền
-- ===========================================================================
select public.tap_as(public.u('a6'));
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"Lậu member"}]'::jsonb)$$,
  'P0001', 'Bạn không có quyền import thành viên cho CLB này', 'member bị chặn');
reset role;
select public.tap_as(public.u('a4'));
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"Lậu recruitment"}]'::jsonb)$$,
  'P0001', 'Bạn không có quyền import thành viên cho CLB này', 'admin không có quyền members (chỉ recruitment) bị chặn');
reset role;
select public.tap_as(public.u('b2'));
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"Lậu admin CLB khác"}]'::jsonb)$$,
  'P0001', 'Bạn không có quyền import thành viên cho CLB này', 'admin (members) của CLB khác bị chặn');
reset role;
select public.tap_as(public.u('b1'));
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"Lậu owner CLB khác"}]'::jsonb)$$,
  'P0001', 'Bạn không có quyền import thành viên cho CLB này', 'owner của CLB khác bị chặn');
select throws_ok(
  $$select public.import_members(null, '[{"full_name":"Lậu null"}]'::jsonb)$$,
  'P0001', 'Bạn không có quyền import thành viên cho CLB này', 'p_club_id null bị chặn');
reset role;
set local role anon;
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"Lậu anon"}]'::jsonb)$$,
  '42501', null, 'anon không execute được import_members');
reset role;
select is((select count(*) from public.club_members where club_id = public.u('c1'))::int, 9,
  'các lần bị chặn không ghi gì');

-- ===========================================================================
-- 2. Thêm mới (admin có quyền members)
-- ===========================================================================
select public.tap_as(public.u('a3'));
select is(
  public.import_members(public.u('c1'), $$[
    {"full_name":"  Nguyễn Văn Mới  ","student_code":" N1 ","class_name":"K70","email":"  Moi@Example.COM ",
     "phone":"0901","facebook_url":"https://www.facebook.com/moi","team":"  ban TRUYỀN thông ","title":"Thành viên"},
    {"full_name":"Chỉ Tên","student_code":"","email":"  ","team":null}
  ]$$::jsonb),
  '{"inserted":2,"updated":0,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  'admin có quyền members import được: thêm 2 người');
reset role;
select is(
  (select to_jsonb(r) from (
    select full_name, student_code, class_name, email, phone, facebook_url, title, team_id, role::text as role,
           is_active, permissions, is_head, user_id
    from public.club_members where club_id = public.u('c1') and student_code = 'N1') r),
  jsonb_build_object('full_name','Nguyễn Văn Mới','student_code','N1','class_name','K70','email','moi@example.com',
    'phone','0901','facebook_url','https://www.facebook.com/moi','title','Thành viên','team_id', public.u('d1'),
    'role','member','is_active',true,'permissions','[]'::jsonb,'is_head',false,'user_id',null),
  'dòng đầy đủ: đã trim, email viết thường, ban khớp không phân biệt hoa thường, role member, is_active, không quyền');
select is(
  (select to_jsonb(r) from (
    select student_code, class_name, email, phone, facebook_url, title, team_id, role::text as role, is_active
    from public.club_members where club_id = public.u('c1') and full_name = 'Chỉ Tên') r),
  jsonb_build_object('student_code',null,'class_name',null,'email',null,'phone',null,'facebook_url',null,
    'title',null,'team_id',null,'role','member','is_active',true),
  'dòng chỉ có tên: các trường rỗng thành null');
select is((select count(*) from public.club_members where club_id = public.u('c1'))::int, 11, 'CLB A có 11 thành viên sau khi thêm 2');

select public.tap_as(public.u('a1'));
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Do Chủ nhiệm","student_code":"N2"}]'::jsonb),
  '{"inserted":1,"updated":0,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  'Chủ nhiệm import được');
reset role;
select public.tap_as(public.u('a2'));
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Do owner","student_code":"N3"}]'::jsonb),
  '{"inserted":1,"updated":0,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  'owner (không is_head) import được');
reset role;

-- ===========================================================================
-- 3. Cập nhật theo MSSV / email; không ghi đè bằng null
-- ===========================================================================
select public.tap_as(public.u('a1'));
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Cũ Một (đổi)","student_code":"S100","phone":"999"}]'::jsonb),
  '{"inserted":0,"updated":1,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  'khớp theo MSSV: cập nhật 1');
reset role;
select is(
  (select to_jsonb(r) from (
    select full_name, class_name, email, phone, facebook_url, title, team_id, role::text as role, is_active
    from public.club_members where id = public.u('aa01')) r),
  jsonb_build_object('full_name','Cũ Một (đổi)','class_name','K1','email','m1@x.com','phone','999',
    'facebook_url','https://facebook.com/m1','title','Trưởng nhóm','team_id', public.u('d1'),
    'role','member','is_active',true),
  'trường file có giá trị thì đổi (tên, phone); trường file trống giữ nguyên (lớp, email, fb, chức danh, ban)');

select public.tap_as(public.u('a1'));
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Cũ Một (đổi)","student_code":"S100","phone":"  ","class_name":""}]'::jsonb),
  '{"inserted":0,"updated":0,"unchanged":1,"staff_team_skipped":0}'::jsonb,
  'không trường nào đổi (rỗng không ghi đè): unchanged 1');
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Cũ Một (đổi)","student_code":"S100","email":"M1@X.COM","phone":"999"}]'::jsonb),
  '{"inserted":0,"updated":0,"unchanged":1,"staff_team_skipped":0}'::jsonb,
  'giá trị giống hệt (email chỉ khác hoa/thường): unchanged');
select is(
  public.import_members(public.u('c1'),
    '[{"full_name":"Cũ Hai mới","email":"M2@X.COM","student_code":"S2NEW","class_name":"K2","team":"Ban Chuyên môn"}]'::jsonb),
  '{"inserted":0,"updated":1,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  'khớp theo email (MSSV mới chưa ai dùng): cập nhật 1, không thêm người trùng');
reset role;
select is(
  (select to_jsonb(r) from (
    select full_name, student_code, class_name, team_id
    from public.club_members where id = public.u('aa02')) r),
  jsonb_build_object('full_name','Cũ Hai mới','student_code','S2NEW','class_name','K2','team_id', public.u('d2')),
  'người khớp theo email được gán MSSV mới, lớp, ban');
select is((select count(*) from public.club_members where club_id = public.u('c1') and lower(email) = 'm2@x.com')::int, 1,
  'email m2@x.com vẫn chỉ một người');

-- Một lần gọi trộn nhiều kiểu
select public.tap_as(public.u('a3'));
select is(
  public.import_members(public.u('c1'), $$[
    {"full_name":"Mới trộn 1","student_code":"MIX1"},
    {"full_name":"Mới trộn 2","email":"mix2@x.com"},
    {"full_name":"Cũ Bốn","student_code":"S400"},
    {"full_name":"Cũ Bốn đổi","email":"m4@t.test","title":"Phó nhóm"},
    {"full_name":"Cũ Ba","student_code":"S300","class_name":"K3"}
  ]$$::jsonb),
  '{"inserted":2,"updated":2,"unchanged":1,"staff_team_skipped":0}'::jsonb,
  'trộn: thêm 2, cập nhật 2 (theo email, theo MSSV), không đổi 1');
reset role;

-- ===========================================================================
-- 4. Không đổi role / permissions / is_head / user_id / is_active
-- ===========================================================================
select public.tap_as(public.u('a1'));
select is(
  public.import_members(public.u('c1'), $$[
    {"full_name":"Chủ nhiệm (đổi tên)","student_code":"E1"},
    {"full_name":"Admin members (đổi tên)","student_code":"E3","phone":"3333"},
    {"full_name":"Cũ Ba (đổi tên)","student_code":"S300"}
  ]$$::jsonb),
  '{"inserted":0,"updated":3,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  'cập nhật owner, admin, thành viên đã nghỉ');
reset role;
select is(
  (select to_jsonb(r) from (
    select full_name, role::text as role, permissions, is_head, user_id, is_active
    from public.club_members where id = public.u('e1')) r),
  jsonb_build_object('full_name','Chủ nhiệm (đổi tên)','role','owner','permissions','[]'::jsonb,
    'is_head',true,'user_id', public.u('a1'),'is_active',true),
  'Chủ nhiệm: đổi tên nhưng giữ owner, is_head, user_id, is_active');
select is(
  (select to_jsonb(r) from (
    select full_name, phone, role::text as role, permissions, is_head, user_id, is_active
    from public.club_members where id = public.u('e3')) r),
  jsonb_build_object('full_name','Admin members (đổi tên)','phone','3333','role','admin',
    'permissions', '["members"]'::jsonb,'is_head',false,'user_id', public.u('a3'),'is_active',true),
  'admin: đổi tên/phone nhưng giữ role, permissions, user_id');
select is(
  (select to_jsonb(r) from (
    select full_name, role::text as role, is_active
    from public.club_members where id = public.u('aa03')) r),
  jsonb_build_object('full_name','Cũ Ba (đổi tên)','role','member','is_active',false),
  'thành viên đã nghỉ: vẫn is_active = false sau khi cập nhật');

-- ===========================================================================
-- 5. Ban của owner/admin: chỉ Chủ nhiệm được đổi
-- ===========================================================================
-- e4: admin ban d2. e2: owner (không is_head) ban d1. e3: admin ban d1.
select public.tap_as(public.u('a3'));
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Admin recruit","student_code":"E4","team":"Ban Truyền thông"}]'::jsonb),
  '{"inserted":0,"updated":0,"unchanged":0,"staff_team_skipped":1}'::jsonb,
  'admin không đổi được ban của admin khác: dòng bị bỏ qua hoàn toàn, đếm staff_team_skipped (Đợt 7)');
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Phó chủ nhiệm","student_code":"E2","team":"Ban Chuyên môn","phone":"555"}]'::jsonb),
  '{"inserted":0,"updated":0,"unchanged":0,"staff_team_skipped":1}'::jsonb,
  'admin không sửa được gì ở dòng owner (kể cả phone): bỏ qua hoàn toàn (Đợt 7)');
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Phó chủ nhiệm","student_code":"E2","team":"ban truyền thông"}]'::jsonb),
  '{"inserted":0,"updated":0,"unchanged":0,"staff_team_skipped":1}'::jsonb,
  'dòng owner bị bỏ qua hoàn toàn dù ban trong file trùng ban hiện tại (Đợt 7)');
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Cũ Bốn đổi","student_code":"S400","team":"Ban Chuyên môn"}]'::jsonb),
  '{"inserted":0,"updated":1,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  'admin đổi được ban của thành viên thường');
reset role;
select is((select team_id from public.club_members where id = public.u('e4')), public.u('d2'), 'ban của e4 giữ nguyên (d2)');
select is((select team_id from public.club_members where id = public.u('e2')), public.u('d1'), 'ban của e2 giữ nguyên (d1)');
select is((select phone from public.club_members where id = public.u('e2')), null, 'phone của e2 KHÔNG đổi (dòng owner bị bỏ qua hoàn toàn, Đợt 7)');
select is((select team_id from public.club_members where id = public.u('aa04')), public.u('d2'), 'ban của thành viên thường đã đổi (d2)');

select public.tap_as(public.u('a2'));
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Admin recruit","student_code":"E4","team":"Ban Truyền thông"}]'::jsonb),
  '{"inserted":0,"updated":0,"unchanged":0,"staff_team_skipped":1}'::jsonb,
  'owner không is_head cũng không cập nhật được dòng admin (Đợt 7)');
reset role;
select public.tap_as(public.u('a1'));
select is(
  public.import_members(public.u('c1'), $$[
    {"full_name":"Admin recruit","student_code":"E4","team":"Ban Truyền thông"},
    {"full_name":"Phó chủ nhiệm","student_code":"E2","team":"Ban Chuyên môn"}
  ]$$::jsonb),
  '{"inserted":0,"updated":2,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  'Chủ nhiệm THÊM được ban cho admin và owner');
reset role;
-- Đợt 6: import THÊM ban vào tập; ban chính chỉ đặt khi đang null (trước đây import đổi ban chính).
select is((select team_id from public.club_members where id = public.u('e4')), public.u('d2'), 'ban chính của e4 giữ nguyên d2');
select is((select array_agg(team_id order by team_id) from public.club_member_teams where member_id = public.u('e4')), array[public.u('d1'), public.u('d2')], 'tập ban của e4 có thêm d1');
select is((select team_id from public.club_members where id = public.u('e2')), public.u('d1'), 'ban chính của e2 giữ nguyên d1');
select is((select array_agg(team_id order by team_id) from public.club_member_teams where member_id = public.u('e2')), array[public.u('d1'), public.u('d2')], 'tập ban của e2 có thêm d2');

-- ===========================================================================
-- 6. Lỗi: không ghi gì (một transaction)
-- ===========================================================================
create temp table tap_before as
  select count(*) as n, md5(string_agg(m.id::text || coalesce(m.full_name, '') || coalesce(m.student_code, '')
                                        || coalesce(m.email, '') || coalesce(m.team_id::text, ''), ',' order by m.id)) as h
  from public.club_members m where m.club_id = public.u('c1');
grant select on tap_before to authenticated;

select public.tap_as(public.u('a1'));
select throws_ok(
  $$select public.import_members(public.u('c1'), $j$[
    {"full_name":"Hợp lệ sẽ không được ghi","student_code":"FAIL1"},
    {"full_name":"Cũ Một (rồi sẽ lỗi)","student_code":"S100","phone":"888"},
    {"full_name":"Ban lạ","student_code":"FAIL2","team":"Ban không có"}
  ]$j$::jsonb)$$,
  'P0001', 'Dòng 3: ban "Ban không có" chưa có trên web. Hãy tạo ban ở mục Quản lí ban hoặc sửa tên trong file.',
  'ban không tồn tại: lỗi "Dòng 3"');
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"Ban CLB khác","team":"Ban của CLB B"}]'::jsonb)$$,
  'P0001', 'Dòng 1: ban "Ban của CLB B" chưa có trên web. Hãy tạo ban ở mục Quản lí ban hoặc sửa tên trong file.',
  'ban của CLB khác không được tính');
select throws_ok(
  $$select public.import_members(public.u('c1'), $j$[
    {"full_name":"A","student_code":"DUP1","email":"x@y.com"},
    {"full_name":"B","student_code":"DUP2"},
    {"full_name":"C","student_code":"DUP1"}
  ]$j$::jsonb)$$,
  'P0001', 'Dòng 3 trùng với dòng 1 (MSSV DUP1)', 'trùng MSSV trong file');
select throws_ok(
  $$select public.import_members(public.u('c1'), $j$[
    {"full_name":"A","email":"Trung@Y.com"},
    {"full_name":"B","email":"trung@y.COM"}
  ]$j$::jsonb)$$,
  'P0001', 'Dòng 2 trùng với dòng 1 (email trung@y.com)', 'trùng email trong file (không phân biệt hoa thường)');
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"X","student_code":"S100","email":"m4@t.test"}]'::jsonb)$$,
  'P0001', 'Dòng 1: MSSV và email thuộc hai thành viên khác nhau trên web', 'MSSV và email thuộc hai người khác nhau');
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"A"},{"full_name":"B","email":"khong-hop-le"}]'::jsonb)$$,
  'P0001', 'Dòng 2: email không hợp lệ', 'email sai định dạng');
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"A","facebook_url":"http://facebook.com/a"}]'::jsonb)$$,
  'P0001', 'Dòng 1: link Facebook không hợp lệ', 'Facebook không phải https');
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"A","facebook_url":"https://example.com/a"}]'::jsonb)$$,
  'P0001', 'Dòng 1: link Facebook không hợp lệ', 'Facebook sai tên miền');
select lives_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"FB đúng","facebook_url":"https://m.facebook.com/a"},{"full_name":"FB fb.com","facebook_url":"https://fb.com/b"}]'::jsonb)$$,
  'Facebook m.facebook.com và fb.com hợp lệ');
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"student_code":"NONAME"}]'::jsonb)$$,
  'P0001', 'Dòng 1: thiếu họ tên', 'thiếu họ tên');
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"A"},{"full_name":"   "}]'::jsonb)$$,
  'P0001', 'Dòng 2: thiếu họ tên', 'họ tên toàn khoảng trắng');
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"A","phone":123}]'::jsonb)$$,
  'P0001', 'Dòng 1: trường "phone" phải là chuỗi', 'giá trị không phải chuỗi');
select throws_ok(
  $$select public.import_members(public.u('c1'), jsonb_build_array(jsonb_build_object('full_name', repeat('a', 201))))$$,
  'P0001', 'Dòng 1: trường "full_name" tối đa 200 ký tự', 'họ tên quá 200 ký tự');
select throws_ok(
  $$select public.import_members(public.u('c1'), jsonb_build_array(jsonb_build_object('full_name', 'A', 'student_code', repeat('1', 101))))$$,
  'P0001', 'Dòng 1: trường "student_code" tối đa 100 ký tự', 'MSSV quá 100 ký tự');
select throws_ok(
  $$select public.import_members(public.u('c1'), '[{"full_name":"A"}, "chuỗi"]'::jsonb)$$,
  'P0001', 'Dòng 2: dữ liệu dòng không hợp lệ', 'phần tử không phải object');
select throws_ok(
  $$select public.import_members(public.u('c1'), '[]'::jsonb)$$,
  'P0001', 'Không có dòng nào để import', 'mảng rỗng');
select throws_ok(
  $$select public.import_members(public.u('c1'), '{"full_name":"A"}'::jsonb)$$,
  'P0001', 'Dữ liệu import phải là một danh sách các dòng', 'p_rows không phải mảng');
select throws_ok(
  $$select public.import_members(public.u('c1'),
      (select jsonb_agg(jsonb_build_object('full_name', 'Quá ' || g)) from generate_series(1, 1001) g))$$,
  'P0001', 'Tối đa 1000 dòng mỗi lần import (file có 1001 dòng)', 'hơn 1000 dòng bị từ chối');
reset role;

-- Lỗi từ DB/trigger được thêm tiền tố "Dòng N: " (một khối bắt lỗi ngoài cùng)
create function public.tap_boom() returns trigger language plpgsql as $$
begin
  if new.full_name = 'BOOM' then
    raise exception 'lỗi giả lập từ trigger';
  end if;
  return new;
end $$;
create trigger tap_boom before insert on public.club_members
  for each row execute function public.tap_boom();
select public.tap_as(public.u('a1'));
select throws_ok(
  $$select public.import_members(public.u('c1'), $j$[
    {"full_name":"Trước BOOM","student_code":"BOOM0"},
    {"full_name":"BOOM","student_code":"BOOM1"}
  ]$j$::jsonb)$$,
  'P0001', 'Dòng 2: lỗi giả lập từ trigger', 'lỗi từ trigger được thêm tiền tố "Dòng N:"');
reset role;
drop trigger tap_boom on public.club_members;

-- Sau mọi lần lỗi: chỉ có 2 người "FB đúng"/"FB fb.com" được thêm ở ca lives_ok; không còn gì khác
select is((select count(*) from public.club_members where club_id = public.u('c1'))::int,
  (select n from tap_before)::int + 2,
  'sau các lần lỗi: chỉ thêm 2 người của ca lives_ok, các lần lỗi không ghi gì');
select is((select count(*) from public.club_members where student_code in ('FAIL1', 'FAIL2', 'DUP1', 'DUP2', 'BOOM0', 'BOOM1', 'NONAME'))::int, 0,
  'không có dòng hợp lệ nào của các lần lỗi bị ghi');
select is((select phone from public.club_members where id = public.u('aa01')), '999', 'dòng cập nhật trong lần lỗi bị hoàn tác (phone vẫn 999)');

-- ===========================================================================
-- 7. Đúng 1000 dòng
-- ===========================================================================
select public.tap_as(public.u('a1'));
select is(
  public.import_members(public.u('c1'),
    (select jsonb_agg(jsonb_build_object('full_name', 'Bulk ' || g, 'student_code', 'BULK' || g)) from generate_series(1, 1000) g)),
  '{"inserted":1000,"updated":0,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  '1000 dòng vẫn chạy được');
reset role;
select is((select count(*) from public.club_members where club_id = public.u('c1') and student_code like 'BULK%')::int, 1000,
  '1000 người Bulk đã được thêm');

-- CLB khác không bị ảnh hưởng
select is((select count(*) from public.club_members where club_id = public.u('c2'))::int, 2, 'CLB B không bị đổi');

select * from finish();
rollback;
