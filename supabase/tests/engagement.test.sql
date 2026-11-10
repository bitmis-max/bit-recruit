-- pgTAP: đối chiếu tương tác Facebook + avatar khung. Theo docs/CONTRACT.md mục 1 và 4.
-- Chạy: npx supabase test db   (cần npx supabase db reset để áp migration mới nhất)
begin;
select plan(176);

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
  ('00000000-0000-0000-0000-0000000000b1', 'ownerb@bit.test',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'memberb@bit.test', 'authenticated', 'authenticated');

insert into public.clubs (id, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'CLB A'),
  ('00000000-0000-0000-0000-0000000000c2', 'CLB B'),
  ('00000000-0000-0000-0000-0000000000c3', 'CLB C (xóa cascade)');

insert into public.teams (id, club_id, name) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'Ban Truyền thông');

-- CLB A: e1 owner (a1), e2 admin (a2), e3 member (a3), e4, e5, e6 (ban d1), e7 ngừng hoạt động, e8 hoạt động
-- => 7 thành viên đang hoạt động (e1..e6, e8). CLB B: f1 owner (b1), f2 member (b2).
insert into public.club_members (id, club_id, user_id, team_id, role, full_name, is_active, student_code) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', null, 'owner',  'Owner A',  true,  'OWN1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', null, 'admin',  'Admin A',  true,  'ADM1'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3', null, 'member', 'Member 1', true,  'MEM1'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000c1', null, null, 'member', 'Member 2', true,  'MEM2'),
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000c1', null, '00000000-0000-0000-0000-0000000000d1', 'member', 'Ban viên 1', true,  'T1'),
  ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000c1', null, '00000000-0000-0000-0000-0000000000d1', 'member', 'Ban viên 2', true,  'T2'),
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000c1', null, null, 'member', 'Thành viên nghỉ', false, 'T3'),
  ('00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-0000000000c1', null, null, 'member', 'Member 3', true,  'MEM3'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', null, 'owner',  'Owner B',  true,  'OB1'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', null, 'member', 'Member B', true,  'OB2');

-- Đợt 4: giao việc của admin chỉ trong ban mình, và aliases/apply_task_scan cần quyền facebook (xem permissions.test.sql).
-- Ở file này 'Admin A' (e2) là Phó chủ nhiệm (owner, không phải Chủ nhiệm) để giữ nguyên các ca giao việc toàn CLB.
update public.club_members set role = 'owner' where id = '00000000-0000-0000-0000-0000000000e2';
update public.club_members set is_head = true where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1');

-- Khung: fa01 + fa03 thuộc CLB A, fa02 thuộc CLB B, fa04 thuộc CLB C (để thử cascade theo CLB)
insert into public.avatar_frames (id, club_id, name, image_path, created_by) values
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-0000000000c1', 'Khung A',  '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-00000000f001.png', '00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-0000000000c2', 'Khung B',  '00000000-0000-0000-0000-0000000000c2/00000000-0000-0000-0000-00000000f002.png', null),
  ('00000000-0000-0000-0000-00000000fa03', '00000000-0000-0000-0000-0000000000c1', 'Khung A2', '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-00000000f003.png', null),
  ('00000000-0000-0000-0000-00000000fa04', '00000000-0000-0000-0000-0000000000c3', 'Khung C',  '00000000-0000-0000-0000-0000000000c3/00000000-0000-0000-0000-00000000f004.png', null);

-- ===========================================================================
-- 1. avatar_frames: ràng buộc cột
-- ===========================================================================
select throws_ok(
  $$insert into public.avatar_frames (club_id, name, image_path) values
    ('00000000-0000-0000-0000-0000000000c1', '   ', 'x/y.png')$$,
  '23514', null, 'avatar_frames.name chỉ có khoảng trắng bị chặn (check)');
select throws_ok(
  $$insert into public.avatar_frames (club_id, name, image_path) values
    ('00000000-0000-0000-0000-0000000000c1', repeat('x', 121), 'x/y.png')$$,
  '23514', null, 'avatar_frames.name dài hơn 120 ký tự bị chặn (check)');
select lives_ok(
  $$insert into public.avatar_frames (club_id, name, image_path) values
    ('00000000-0000-0000-0000-0000000000c1', repeat('x', 120), 'x/y.png')$$,
  'avatar_frames.name đúng 120 ký tự thì được');
select throws_ok(
  $$insert into public.avatar_frames (club_id, name, image_path) values
    ('00000000-0000-0000-0000-0000000000c1', 'Thiếu đường dẫn', null)$$,
  '23502', null, 'avatar_frames.image_path bắt buộc (not null)');
select throws_ok(
  $$insert into public.avatar_frames (club_id, name, image_path) values
    ('00000000-0000-0000-0000-0000000000dd', 'CLB không tồn tại', 'x/y.png')$$,
  '23503', null, 'avatar_frames.club_id phải trỏ tới CLB có thật (fk)');
select isnt(
  (select id from public.avatar_frames where name = 'Khung A'), null, 'đối chứng: khung nền đã được tạo');

-- ===========================================================================
-- 2. tasks: kind / post_url / frame_id (chạy bằng postgres để tách khỏi RLS)
-- ===========================================================================
insert into public.tasks (id, club_id, title, due_at) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000000c1', 'Việc mặc định', now() + interval '10 days');
select is((select kind from public.tasks where id = '00000000-0000-0000-0000-00000000d001'), 'general', 'kind mặc định là general');
select is((select post_url from public.tasks where id = '00000000-0000-0000-0000-00000000d001'), null, 'post_url mặc định null');
select is((select frame_id from public.tasks where id = '00000000-0000-0000-0000-00000000d001'), null, 'frame_id mặc định null');

select throws_ok(
  $$insert into public.tasks (club_id, title, due_at, kind) values
    ('00000000-0000-0000-0000-0000000000c1', 'Kind sai', now() + interval '1 day', 'bogus')$$,
  '23514', null, 'tasks.kind ngoài general/engagement/avatar bị chặn (check)');
select throws_ok(
  $$insert into public.tasks (club_id, title, due_at, kind) values
    ('00000000-0000-0000-0000-0000000000c1', 'Tương tác thiếu link', now() + interval '1 day', 'engagement')$$,
  '23514', null, 'kind=engagement mà không có post_url bị chặn');
select throws_ok(
  $$insert into public.tasks (club_id, title, due_at, kind, post_url) values
    ('00000000-0000-0000-0000-0000000000c1', 'Link rỗng', now() + interval '1 day', 'engagement', '')$$,
  '23514', null, 'kind=engagement với post_url rỗng bị chặn');

-- post_url phải khớp ^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+
select throws_ok(
  $$insert into public.tasks (club_id, title, due_at, kind, post_url) values
    ('00000000-0000-0000-0000-0000000000c1', 'Link lạ', now() + interval '1 day', 'engagement', 'https://evil.com/post/1')$$,
  '23514', null, 'post_url không phải Facebook bị chặn');
select throws_ok(
  $$insert into public.tasks (club_id, title, due_at, kind, post_url) values
    ('00000000-0000-0000-0000-0000000000c1', 'Link http', now() + interval '1 day', 'engagement', 'http://www.facebook.com/groups/1/posts/2')$$,
  '23514', null, 'post_url dùng http (không phải https) bị chặn');
select throws_ok(
  $$insert into public.tasks (club_id, title, due_at, kind, post_url) values
    ('00000000-0000-0000-0000-0000000000c1', 'Link giả host', now() + interval '1 day', 'engagement', 'https://facebook.com.evil.com/post/1')$$,
  '23514', null, 'post_url giả host (facebook.com.evil.com) bị chặn');
select throws_ok(
  $$insert into public.tasks (club_id, title, due_at, kind, post_url) values
    ('00000000-0000-0000-0000-0000000000c1', 'Link host nhái', now() + interval '1 day', 'engagement', 'https://evilfacebook.com/post/1')$$,
  '23514', null, 'post_url host nhái (evilfacebook.com) bị chặn');
select throws_ok(
  $$insert into public.tasks (club_id, title, due_at, kind, post_url) values
    ('00000000-0000-0000-0000-0000000000c1', 'Link không có đường dẫn', now() + interval '1 day', 'engagement', 'https://www.facebook.com/')$$,
  '23514', null, 'post_url không có đường dẫn sau tên miền bị chặn');
select throws_ok(
  $$insert into public.tasks (club_id, title, due_at, kind, post_url) values
    ('00000000-0000-0000-0000-0000000000c1', 'Link thiếu scheme', now() + interval '1 day', 'engagement', 'www.facebook.com/groups/1')$$,
  '23514', null, 'post_url thiếu https:// bị chặn');
select lives_ok(
  $$insert into public.tasks (club_id, title, due_at, kind, post_url) values
    ('00000000-0000-0000-0000-0000000000c1', 'Link www', now() + interval '1 day', 'engagement', 'https://www.facebook.com/groups/1/posts/2'),
    ('00000000-0000-0000-0000-0000000000c1', 'Link trần', now() + interval '1 day', 'engagement', 'https://facebook.com/groups/1/posts/2'),
    ('00000000-0000-0000-0000-0000000000c1', 'Link m', now() + interval '1 day', 'engagement', 'https://m.facebook.com/story.php?story_fbid=1&id=2'),
    ('00000000-0000-0000-0000-0000000000c1', 'Link web', now() + interval '1 day', 'engagement', 'https://web.facebook.com/photo/?fbid=1'),
    ('00000000-0000-0000-0000-0000000000c1', 'Link fb.com', now() + interval '1 day', 'engagement', 'https://fb.com/p/abc'),
    ('00000000-0000-0000-0000-0000000000c1', 'Link www.fb.com', now() + interval '1 day', 'engagement', 'https://www.fb.com/p/abc')$$,
  'post_url hợp lệ: www./không tiền tố/m./web. facebook.com, fb.com, www.fb.com');

-- frame_id chỉ dùng khi kind = 'avatar'
select throws_like(
  $$insert into public.tasks (club_id, title, due_at, kind, frame_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'Thường có khung', now() + interval '1 day', 'general', '00000000-0000-0000-0000-00000000fa01')$$,
  '%', 'kind=general mà có frame_id bị chặn');
select throws_like(
  $$insert into public.tasks (club_id, title, due_at, kind, post_url, frame_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'Tương tác có khung', now() + interval '1 day', 'engagement', 'https://www.facebook.com/x/1', '00000000-0000-0000-0000-00000000fa01')$$,
  '%', 'kind=engagement mà có frame_id bị chặn');
select lives_ok(
  $$insert into public.tasks (id, club_id, title, due_at, kind, frame_id) values
    ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-0000000000c1', 'Avatar có khung', now() + interval '1 day', 'avatar', '00000000-0000-0000-0000-00000000fa01')$$,
  'kind=avatar với frame_id được');
select lives_ok(
  $$insert into public.tasks (club_id, title, due_at, kind) values
    ('00000000-0000-0000-0000-0000000000c1', 'Avatar chưa chọn khung', now() + interval '1 day', 'avatar')$$,
  'kind=avatar không có frame_id vẫn được (frame_id nullable)');
select throws_like(
  $$insert into public.tasks (club_id, title, due_at, kind, frame_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'Khung CLB khác', now() + interval '1 day', 'avatar', '00000000-0000-0000-0000-00000000fa02')$$,
  '%', 'trigger: khung thuộc CLB khác với task bị chặn (insert)');
select throws_like(
  $$update public.tasks set frame_id = '00000000-0000-0000-0000-00000000fa02' where id = '00000000-0000-0000-0000-00000000d002'$$,
  '%', 'trigger: đổi frame_id sang khung của CLB khác bị chặn (update)');
select is((select frame_id from public.tasks where id = '00000000-0000-0000-0000-00000000d002'), '00000000-0000-0000-0000-00000000fa01'::uuid,
  'sau lần update lỗi, frame_id vẫn là khung cũ');
select lives_ok(
  $$update public.tasks set frame_id = '00000000-0000-0000-0000-00000000fa03' where id = '00000000-0000-0000-0000-00000000d002'$$,
  'đổi frame_id sang khung khác cùng CLB được');
select throws_like(
  $$update public.tasks set kind = 'general' where id = '00000000-0000-0000-0000-00000000d002'$$,
  '%', 'đổi kind avatar -> general khi còn frame_id bị chặn');
select throws_like(
  $$update public.tasks set kind = 'engagement' where id = '00000000-0000-0000-0000-00000000d001'$$,
  '%', 'đổi kind general -> engagement khi chưa có post_url bị chặn');

-- on delete set null
select lives_ok(
  $$delete from public.avatar_frames where id = '00000000-0000-0000-0000-00000000fa03'$$,
  'xóa khung đang được task dùng thì được');
select is((select frame_id from public.tasks where id = '00000000-0000-0000-0000-00000000d002'), null,
  'xóa khung: tasks.frame_id về null (on delete set null)');
select is((select count(*) from public.tasks where id = '00000000-0000-0000-0000-00000000d002')::int, 1,
  'xóa khung: task vẫn còn');
select is((select kind from public.tasks where id = '00000000-0000-0000-0000-00000000d002'), 'avatar',
  'xóa khung: task vẫn là kind avatar');

-- xóa CLB thì khung đi theo (cascade)
select is((select count(*) from public.avatar_frames where club_id = '00000000-0000-0000-0000-0000000000c3')::int, 1, 'trước khi xóa CLB C: có 1 khung');
delete from public.clubs where id = '00000000-0000-0000-0000-0000000000c3';
select is((select count(*) from public.avatar_frames where club_id = '00000000-0000-0000-0000-0000000000c3')::int, 0, 'xóa CLB thì khung bị xóa theo (cascade)');

-- ===========================================================================
-- 3. avatar_frames: anon đọc được, không ghi được; authenticated cũng không ghi
-- ===========================================================================
set local role anon;
select is((select count(*) from public.avatar_frames where club_id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2'))::int, 3, 'anon đọc được avatar_frames (3 khung của CLB A và B: A, B, và khung 120 ký tự)');
select is((select name from public.avatar_frames where id = '00000000-0000-0000-0000-00000000fa01'), 'Khung A', 'anon đọc đúng nội dung khung');
select is((select count(*) from public.avatar_frames where club_id = '00000000-0000-0000-0000-0000000000c2')::int, 1, 'anon đọc được khung của mọi CLB (khung là ảnh công khai)');
select throws_ok(
  $$select created_by from public.avatar_frames where club_id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'anon KHÔNG đọc được avatar_frames.created_by');
select lives_ok(
  $$select id, name, image_path, club_id, created_at from public.avatar_frames where club_id = '00000000-0000-0000-0000-0000000000c1'$$,
  'anon đọc được avatar_frames (id, name, image_path, club_id, created_at)');
select throws_ok(
  $$insert into public.avatar_frames (club_id, name, image_path) values
    ('00000000-0000-0000-0000-0000000000c1', 'Anon chèn', 'x/y.png')$$,
  '42501', null, 'anon KHÔNG insert được avatar_frames');
select throws_ok(
  $$update public.avatar_frames set name = 'Anon sửa' where id = '00000000-0000-0000-0000-00000000fa01'$$,
  '42501', null, 'anon KHÔNG update được avatar_frames');
select throws_ok(
  $$delete from public.avatar_frames where id = '00000000-0000-0000-0000-00000000fa01'$$,
  '42501', null, 'anon KHÔNG delete được avatar_frames');
reset role;

select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select is((select count(*) from public.avatar_frames where club_id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2'))::int, 3, 'authenticated cũng đọc được avatar_frames');
select throws_ok(
  $$select created_by from public.avatar_frames where club_id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'authenticated (admin) KHÔNG đọc được avatar_frames.created_by');
select lives_ok(
  $$select id, name, image_path, club_id, created_at from public.avatar_frames where club_id = '00000000-0000-0000-0000-0000000000c1'$$,
  'authenticated (admin) đọc được avatar_frames (id, name, image_path, club_id, created_at)');
select throws_ok(
  $$insert into public.avatar_frames (club_id, name, image_path) values
    ('00000000-0000-0000-0000-0000000000c1', 'Admin chèn', 'x/y.png')$$,
  '42501', null, 'admin (authenticated) KHÔNG insert được avatar_frames (chỉ service-role)');
select throws_ok(
  $$update public.avatar_frames set name = 'Admin sửa' where id = '00000000-0000-0000-0000-00000000fa01'$$,
  '42501', null, 'admin (authenticated) KHÔNG update được avatar_frames');
select throws_ok(
  $$delete from public.avatar_frames where id = '00000000-0000-0000-0000-00000000fa01'$$,
  '42501', null, 'admin (authenticated) KHÔNG delete được avatar_frames');
reset role;
select is((select name from public.avatar_frames where id = '00000000-0000-0000-0000-00000000fa01'), 'Khung A', 'avatar_frames không bị đổi sau các lần ghi lậu');

set local role service_role;
select lives_ok(
  $$insert into public.avatar_frames (id, club_id, name, image_path) values
    ('00000000-0000-0000-0000-00000000fa05', '00000000-0000-0000-0000-0000000000c1', 'Do service-role', 'x/z.png')$$,
  'service_role insert được avatar_frames');
select lives_ok(
  $$delete from public.avatar_frames where id = '00000000-0000-0000-0000-00000000fa05'$$,
  'service_role delete được avatar_frames');
reset role;

-- ===========================================================================
-- 4. tasks: quyền ghi theo cột (kind / post_url / frame_id chỉ đặt qua create_task)
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select lives_ok(
  $$update public.tasks set title = 'Đổi tên được' where id = '00000000-0000-0000-0000-00000000d001'$$,
  'admin vẫn update được tasks.title');
select throws_ok(
  $$update public.tasks set kind = 'engagement' where id = '00000000-0000-0000-0000-00000000d001'$$,
  '42501', null, 'admin KHÔNG update được tasks.kind');
select throws_ok(
  $$update public.tasks set post_url = 'https://www.facebook.com/x/1' where id = '00000000-0000-0000-0000-00000000d001'$$,
  '42501', null, 'admin KHÔNG update được tasks.post_url');
select throws_ok(
  $$update public.tasks set frame_id = '00000000-0000-0000-0000-00000000fa01' where id = '00000000-0000-0000-0000-00000000d001'$$,
  '42501', null, 'admin KHÔNG update được tasks.frame_id');
select throws_ok(
  $$insert into public.tasks (club_id, title, due_at, kind, post_url) values
    ('00000000-0000-0000-0000-0000000000c1', 'Admin chèn kind', now() + interval '1 day', 'engagement', 'https://www.facebook.com/x/1')$$,
  '42501', null, 'admin KHÔNG insert trực tiếp được tasks với kind/post_url');
reset role;
select is((select kind from public.tasks where id = '00000000-0000-0000-0000-00000000d001'), 'general', 'tasks.kind không bị đổi sau các lần ghi lậu');

-- ===========================================================================
-- 5. create_task: tham số mới
-- ===========================================================================
select is((select count(*) from pg_proc where proname = 'create_task' and pronamespace = 'public'::regnamespace)::int, 1,
  'chỉ còn một hàm create_task (hàm cũ đã bị drop, không còn overload mơ hồ)');

-- 5a. Gọi kiểu cũ (6 tham số vị trí) vẫn chạy
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select lives_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Kiểu cũ vị trí', 'Mô tả', now() + interval '3 days', array['00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4']::uuid[], null)$$,
  'create_task gọi kiểu cũ (6 tham số vị trí) vẫn chạy');
select lives_ok(
  $$select public.create_task(
      p_club_id => '00000000-0000-0000-0000-0000000000c1', p_title => 'Kiểu cũ tên tham số', p_description => null,
      p_due_at => now() + interval '3 days', p_member_ids => array['00000000-0000-0000-0000-0000000000e3']::uuid[], p_team_id => null)$$,
  'create_task gọi theo tham số có tên như Đợt 2 vẫn chạy');
select lives_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Kiểu cũ theo ban', null, now() + interval '3 days', array[]::uuid[], '00000000-0000-0000-0000-0000000000d1')$$,
  'create_task gọi kiểu cũ giao theo ban vẫn chạy');
reset role;
select is((select kind from public.tasks where title = 'Kiểu cũ vị trí'), 'general', 'gọi kiểu cũ: kind = general');
select is((select post_url from public.tasks where title = 'Kiểu cũ vị trí'), null, 'gọi kiểu cũ: post_url null');
select is((select frame_id from public.tasks where title = 'Kiểu cũ vị trí'), null, 'gọi kiểu cũ: frame_id null');
select results_eq(
  $$select ta.member_id from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Kiểu cũ vị trí' order by ta.member_id$$,
  $$values ('00000000-0000-0000-0000-0000000000e3'::uuid), ('00000000-0000-0000-0000-0000000000e4'::uuid)$$,
  'gọi kiểu cũ: người nhận đúng danh sách');
select results_eq(
  $$select ta.member_id from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Kiểu cũ theo ban' order by ta.member_id$$,
  $$values ('00000000-0000-0000-0000-0000000000e5'::uuid), ('00000000-0000-0000-0000-0000000000e6'::uuid)$$,
  'gọi kiểu cũ theo ban: đúng thành viên đang hoạt động của ban');

-- 5b. Tạo việc tương tác / avatar
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select lives_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Tương tác OK', 'Thả tim bài', now() + interval '3 days',
      array['00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4']::uuid[], null,
      p_kind => 'engagement', p_post_url => 'https://www.facebook.com/groups/1/posts/2')$$,
  'create_task: kind=engagement kèm post_url');
select lives_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Avatar OK', null, now() + interval '3 days',
      array['00000000-0000-0000-0000-0000000000e3']::uuid[], null,
      p_kind => 'avatar', p_frame_id => '00000000-0000-0000-0000-00000000fa01')$$,
  'create_task: kind=avatar kèm khung cùng CLB');
select isnt(
  public.create_task('00000000-0000-0000-0000-0000000000c1', 'Tương tác trả id', null, now() + interval '3 days',
    array['00000000-0000-0000-0000-0000000000e3']::uuid[], null,
    p_kind => 'engagement', p_post_url => 'https://fb.com/p/1'),
  null, 'create_task với tham số mới vẫn trả về id');
reset role;
select is((select kind from public.tasks where title = 'Tương tác OK'), 'engagement', 'create_task lưu kind=engagement');
select is((select post_url from public.tasks where title = 'Tương tác OK'), 'https://www.facebook.com/groups/1/posts/2', 'create_task lưu post_url');
select is((select frame_id from public.tasks where title = 'Tương tác OK'), null, 'việc tương tác không có frame_id');
select is((select kind from public.tasks where title = 'Avatar OK'), 'avatar', 'create_task lưu kind=avatar');
select is((select frame_id from public.tasks where title = 'Avatar OK'), '00000000-0000-0000-0000-00000000fa01'::uuid, 'create_task lưu frame_id');
select is((select created_by from public.tasks where title = 'Tương tác OK'), '00000000-0000-0000-0000-0000000000e2'::uuid, 'created_by vẫn là người gọi (admin e2)');
select is((select count(*) from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Tương tác OK' and ta.status = 'pending')::int, 2, 'việc tương tác: 2 người nhận, đều pending');

-- 5c. Lỗi
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Lỗi kind sai', null, now() + interval '3 days',
      array['00000000-0000-0000-0000-0000000000e3']::uuid[], null, p_kind => 'bogus')$$,
  '%', 'create_task: kind ngoài danh sách bị lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Lỗi tương tác thiếu link', null, now() + interval '3 days',
      array['00000000-0000-0000-0000-0000000000e3']::uuid[], null, p_kind => 'engagement')$$,
  '%', 'create_task: engagement thiếu post_url bị lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Lỗi link lạ', null, now() + interval '3 days',
      array['00000000-0000-0000-0000-0000000000e3']::uuid[], null, p_kind => 'engagement', p_post_url => 'https://evil.com/x/1')$$,
  '%', 'create_task: post_url không phải Facebook bị lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Lỗi link giả host', null, now() + interval '3 days',
      array['00000000-0000-0000-0000-0000000000e3']::uuid[], null, p_kind => 'engagement', p_post_url => 'https://facebook.com.evil.com/x/1')$$,
  '%', 'create_task: post_url giả host bị lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Lỗi khung CLB khác', null, now() + interval '3 days',
      array['00000000-0000-0000-0000-0000000000e3']::uuid[], null, p_kind => 'avatar', p_frame_id => '00000000-0000-0000-0000-00000000fa02')$$,
  '%', 'create_task: khung của CLB khác bị lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Lỗi khung không tồn tại', null, now() + interval '3 days',
      array['00000000-0000-0000-0000-0000000000e3']::uuid[], null, p_kind => 'avatar', p_frame_id => '00000000-0000-0000-0000-00000000fadd')$$,
  '%', 'create_task: khung không tồn tại bị lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Lỗi thường có khung', null, now() + interval '3 days',
      array['00000000-0000-0000-0000-0000000000e3']::uuid[], null, p_kind => 'general', p_frame_id => '00000000-0000-0000-0000-00000000fa01')$$,
  '%', 'create_task: kind=general kèm frame_id bị lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Lỗi tương tác có khung', null, now() + interval '3 days',
      array['00000000-0000-0000-0000-0000000000e3']::uuid[], null, p_kind => 'engagement',
      p_post_url => 'https://www.facebook.com/x/1', p_frame_id => '00000000-0000-0000-0000-00000000fa01')$$,
  '%', 'create_task: kind=engagement kèm frame_id bị lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Lỗi tương tác hạn quá khứ', null, now() - interval '1 day',
      array['00000000-0000-0000-0000-0000000000e3']::uuid[], null, p_kind => 'engagement', p_post_url => 'https://www.facebook.com/x/1')$$,
  '%Hạn chót phải ở tương lai%', 'create_task: vẫn kiểm tra hạn chót ở tương lai khi có tham số mới');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Lỗi không người nhận', null, now() + interval '3 days',
      array[]::uuid[], null, p_kind => 'engagement', p_post_url => 'https://www.facebook.com/x/1', p_all_members => false)$$,
  '%', 'create_task: p_all_members=false và không có người nhận vẫn lỗi');
reset role;
select is((select count(*) from public.tasks where club_id = '00000000-0000-0000-0000-0000000000c1' and title like 'Lỗi %')::int, 0, 'các lần create_task lỗi không để lại task nào');

-- 5d. Quyền
select public.tap_as('00000000-0000-0000-0000-0000000000a3'); -- member thường
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Member tạo tương tác', null, now() + interval '3 days',
      array['00000000-0000-0000-0000-0000000000e4']::uuid[], null, p_kind => 'engagement', p_post_url => 'https://www.facebook.com/x/1')$$,
  '%', 'create_task: member thường bị chặn (tham số mới)');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Member giao tất cả', null, now() + interval '3 days',
      array[]::uuid[], null, p_all_members => true)$$,
  '%', 'create_task: member thường không giao được cho tất cả');
reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000b1'); -- owner CLB B
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'CLB B giao tất cả CLB A', null, now() + interval '3 days',
      array[]::uuid[], null, p_all_members => true)$$,
  '%', 'create_task: admin CLB khác không giao được cho tất cả thành viên CLB A');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'CLB B dùng khung CLB A', null, now() + interval '3 days',
      array['00000000-0000-0000-0000-0000000000e4']::uuid[], null, p_kind => 'avatar', p_frame_id => '00000000-0000-0000-0000-00000000fa01')$$,
  '%', 'create_task: admin CLB khác bị chặn dù khung hợp lệ');
reset role;
select is((select count(*) from public.tasks where title in ('Member tạo tương tác', 'Member giao tất cả', 'CLB B giao tất cả CLB A', 'CLB B dùng khung CLB A'))::int, 0, 'create_task bị chặn không để lại task');

-- 5e. p_all_members
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select lives_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Tất cả thành viên', null, now() + interval '3 days',
      array[]::uuid[], null, p_kind => 'engagement', p_post_url => 'https://www.facebook.com/x/1', p_all_members => true)$$,
  'create_task: p_all_members=true với mảng người nhận rỗng');
select lives_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Tất cả + lẻ + ban', null, now() + interval '3 days',
      array['00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e5']::uuid[], '00000000-0000-0000-0000-0000000000d1',
      p_all_members => true)$$,
  'create_task: p_all_members=true hợp với người chọn lẻ và ban (không lỗi trùng khóa)');
select lives_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Tất cả null mảng', null, now() + interval '3 days',
      null, null, p_all_members => true)$$,
  'create_task: p_all_members=true với p_member_ids null');
select lives_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Tất cả avatar', null, now() + interval '3 days',
      array[]::uuid[], null, p_kind => 'avatar', p_frame_id => '00000000-0000-0000-0000-00000000fa01', p_all_members => true)$$,
  'create_task: p_all_members=true cho việc avatar');
reset role;
select results_eq(
  $$select ta.member_id from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Tất cả thành viên' order by ta.member_id$$,
  $$values
    ('00000000-0000-0000-0000-0000000000e1'::uuid),
    ('00000000-0000-0000-0000-0000000000e2'::uuid),
    ('00000000-0000-0000-0000-0000000000e3'::uuid),
    ('00000000-0000-0000-0000-0000000000e4'::uuid),
    ('00000000-0000-0000-0000-0000000000e5'::uuid),
    ('00000000-0000-0000-0000-0000000000e6'::uuid),
    ('00000000-0000-0000-0000-0000000000e8'::uuid)$$,
  'p_all_members: giao cho mọi thành viên đang hoạt động của CLB (7), KHÔNG có e7 ngừng hoạt động, KHÔNG có người CLB B');
select is((select count(*) from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Tất cả thành viên' and ta.status = 'pending')::int, 7, 'p_all_members: mọi người nhận đều pending');
select is((select count(*) from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Tất cả thành viên' and ta.member_id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2'))::int, 0, 'p_all_members: không giao cho CLB khác');
select is((select count(*) from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Tất cả + lẻ + ban')::int, 7, 'p_all_members + lẻ + ban: vẫn đúng 7 người, không trùng');
select is((select count(*) from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Tất cả null mảng')::int, 7, 'p_all_members với p_member_ids null: 7 người');
select is((select count(*) from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Tất cả avatar')::int, 7, 'p_all_members cho việc avatar: 7 người');
select is((select kind from public.tasks where title = 'Tất cả thành viên'), 'engagement', 'p_all_members: kind vẫn được lưu');

-- ===========================================================================
-- 6. apply_task_scan
-- ===========================================================================
-- S1 (open, engagement, CLB A): e3 pending, e4 pending, e5 done (completed_at cũ), e6 missed, e8 pending
-- S2 (closed), S3 (CLB B)
insert into public.tasks (id, club_id, title, due_at, status, kind, post_url) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000c1', 'Scan S1',        now() + interval '10 days', 'open',   'engagement', 'https://www.facebook.com/groups/1/posts/2'),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000000c1', 'Scan S2 đóng',   now() + interval '10 days', 'closed', 'engagement', 'https://www.facebook.com/groups/1/posts/3'),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-0000000000c2', 'Scan S3 CLB B',  now() + interval '10 days', 'open',   'engagement', 'https://www.facebook.com/groups/9/posts/9');
insert into public.task_assignees (task_id, member_id) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000e4'),
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000e5'),
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000e6'),
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000e8'),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-0000000000f2');
update public.task_assignees set status = 'done'
  where task_id = '00000000-0000-0000-0000-00000000e001' and member_id = '00000000-0000-0000-0000-0000000000e5';
update public.task_assignees set completed_at = now() - interval '1 day'
  where task_id = '00000000-0000-0000-0000-00000000e001' and member_id = '00000000-0000-0000-0000-0000000000e5';
update public.task_assignees set status = 'missed'
  where task_id = '00000000-0000-0000-0000-00000000e001' and member_id = '00000000-0000-0000-0000-0000000000e6';

-- 6a. Quyền: bị chặn, dữ liệu không đổi
select public.tap_as('00000000-0000-0000-0000-0000000000a3'); -- member thường
select throws_like(
  $$select public.apply_task_scan('00000000-0000-0000-0000-00000000e001', array['00000000-0000-0000-0000-0000000000e3']::uuid[])$$,
  '%', 'apply_task_scan: member thường bị chặn (kể cả chính mình)');
reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000b1'); -- owner CLB B
select throws_like(
  $$select public.apply_task_scan('00000000-0000-0000-0000-00000000e001', array['00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4']::uuid[])$$,
  '%', 'apply_task_scan: admin của CLB khác bị chặn');
reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select throws_like(
  $$select public.apply_task_scan('00000000-0000-0000-0000-00000000e003', array['00000000-0000-0000-0000-0000000000f2']::uuid[])$$,
  '%', 'apply_task_scan: admin CLB A không quét được việc của CLB B');
select throws_like(
  $$select public.apply_task_scan('00000000-0000-0000-0000-00000000e002', array['00000000-0000-0000-0000-0000000000e3']::uuid[])$$,
  '%', 'apply_task_scan: việc đã đóng (closed) bị lỗi');
select throws_like(
  $$select public.apply_task_scan('00000000-0000-0000-0000-00000000dead', array['00000000-0000-0000-0000-0000000000e3']::uuid[])$$,
  '%', 'apply_task_scan: việc không tồn tại bị lỗi');
reset role;
set local role anon;
select throws_ok(
  $$select public.apply_task_scan('00000000-0000-0000-0000-00000000e001', array['00000000-0000-0000-0000-0000000000e3']::uuid[])$$,
  '42501', null, 'anon không execute được apply_task_scan');
reset role;
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e001' and status = 'pending')::int, 3, 'sau các lần bị chặn: S1 vẫn 3 pending (e3, e4, e8)');
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e002' and member_id = '00000000-0000-0000-0000-0000000000e3'), 'pending', 'sau lỗi: việc đóng không đổi');
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e003' and member_id = '00000000-0000-0000-0000-0000000000f2'), 'pending', 'sau lỗi: việc CLB B không đổi');

-- 6b. Admin quét: chỉ pending -> done
-- mảng gồm: e3 (pending), e5 (đã done), e6 (missed), e7 + e1 (không phải người nhận), f2 (CLB khác)
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select is(
  public.apply_task_scan('00000000-0000-0000-0000-00000000e001',
    array['00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000e6',
          '00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f2']::uuid[]),
  1, 'apply_task_scan: trả đúng 1 (chỉ e3 đang pending; done/missed/không phải người nhận không tính)');
reset role;
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e001' and member_id = '00000000-0000-0000-0000-0000000000e3'), 'done', 'e3: pending -> done');
select isnt((select completed_at from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e001' and member_id = '00000000-0000-0000-0000-0000000000e3'), null, 'e3: trigger đặt completed_at');
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e001' and member_id = '00000000-0000-0000-0000-0000000000e4'), 'pending', 'e4 không có trong mảng: vẫn pending');
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e001' and member_id = '00000000-0000-0000-0000-0000000000e8'), 'pending', 'e8 không có trong mảng: vẫn pending');
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e001' and member_id = '00000000-0000-0000-0000-0000000000e5'), 'done', 'e5 đã done: vẫn done');
select ok(
  (select completed_at from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e001' and member_id = '00000000-0000-0000-0000-0000000000e5') < now() - interval '23 hours',
  'e5 đã done: completed_at cũ không bị đụng');
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e001' and member_id = '00000000-0000-0000-0000-0000000000e6'), 'missed', 'e6 missed: KHÔNG bị đổi thành done');
select is((select completed_at from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e001' and member_id = '00000000-0000-0000-0000-0000000000e6'), null, 'e6 missed: completed_at vẫn null');
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e001' and member_id in ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f2'))::int, 0, 'người không phải người nhận không bị thêm vào việc');
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e003' and status = 'done')::int, 0, 'f2 (CLB B) không bị đổi dù có trong mảng');

-- 6c. Quét lần hai trùng: không đổi thêm, trả 0 (mỗi lần chỉ thêm "xong")
select public.tap_as('00000000-0000-0000-0000-0000000000a2');
select is(
  public.apply_task_scan('00000000-0000-0000-0000-00000000e001', array['00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000e6']::uuid[]),
  0, 'apply_task_scan: quét lại cùng danh sách trả 0');
select is(public.apply_task_scan('00000000-0000-0000-0000-00000000e001', array[]::uuid[]), 0, 'apply_task_scan: mảng rỗng trả 0');
reset role;

-- 6d. Quét lần ba (bình luận) thêm người mới; owner cũng gọi được
select public.tap_as('00000000-0000-0000-0000-0000000000a1'); -- owner A
select is(
  public.apply_task_scan('00000000-0000-0000-0000-00000000e001', array['00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e8']::uuid[]),
  2, 'apply_task_scan: owner quét lần 3, thêm e4 và e8 (e3 đã done) trả 2');
reset role;
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e001' and status = 'done')::int, 4, 'S1: e3, e4, e5, e8 đã done');
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e001' and status = 'missed')::int, 1, 'S1: e6 vẫn missed');
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000e001' and status = 'pending')::int, 0, 'S1: không còn pending');

-- 6e. Việc avatar cũng quét được
select public.tap_as('00000000-0000-0000-0000-0000000000a2');
select is(
  public.apply_task_scan((select id from public.tasks where title = 'Avatar OK'), array['00000000-0000-0000-0000-0000000000e3']::uuid[]),
  1, 'apply_task_scan: dùng được cho việc kind=avatar');
reset role;

-- ===========================================================================
-- 7. member_facebook_aliases
-- ===========================================================================
-- Ràng buộc (postgres)
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'U:john.doe', '00000000-0000-0000-0000-0000000000e3')$$,
  '23514', null, 'fb_key tiền tố hoa (U:) bị chặn');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'u:John.Doe', '00000000-0000-0000-0000-0000000000e3')$$,
  '23514', null, 'fb_key username có chữ hoa bị chặn');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'id:12', '00000000-0000-0000-0000-0000000000e3')$$,
  '23514', null, 'fb_key id ít hơn 3 chữ số bị chặn');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'id:abc', '00000000-0000-0000-0000-0000000000e3')$$,
  '23514', null, 'fb_key id không phải số bị chặn');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'id:1234567890123456789012345678', '00000000-0000-0000-0000-0000000000e3')$$,
  '23514', null, 'fb_key id quá 25 chữ số bị chặn');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'x:abc', '00000000-0000-0000-0000-0000000000e3')$$,
  '23514', null, 'fb_key tiền tố lạ bị chặn');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', '', '00000000-0000-0000-0000-0000000000e3')$$,
  '23514', null, 'fb_key rỗng bị chặn');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'u:', '00000000-0000-0000-0000-0000000000e3')$$,
  '23514', null, 'fb_key u: không có username bị chặn');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'u:john doe', '00000000-0000-0000-0000-0000000000e3')$$,
  '23514', null, 'fb_key username có khoảng trắng bị chặn');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'u:john_doe', '00000000-0000-0000-0000-0000000000e3')$$,
  '23514', null, 'fb_key username có dấu gạch dưới bị chặn');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'u:' || repeat('a', 81), '00000000-0000-0000-0000-0000000000e3')$$,
  '23514', null, 'fb_key username dài hơn 80 ký tự bị chặn');
select throws_like(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'u:nguoi.clb.khac', '00000000-0000-0000-0000-0000000000f2')$$,
  '%', 'trigger: alias gắn cho member của CLB khác bị chặn (postgres)');
select lives_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'u:' || repeat('a', 80), '00000000-0000-0000-0000-0000000000e8'),
    ('00000000-0000-0000-0000-0000000000c1', 'id:' || repeat('7', 25), '00000000-0000-0000-0000-0000000000e8'),
    ('00000000-0000-0000-0000-0000000000c1', 'id:123', '00000000-0000-0000-0000-0000000000e8')$$,
  'fb_key ở biên hợp lệ được nhận (u: 80 ký tự, id: 3 và 25 chữ số)');
delete from public.member_facebook_aliases where club_id = '00000000-0000-0000-0000-0000000000c1';

-- Admin CLB A ghi qua RLS
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select lives_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'u:john.doe', '00000000-0000-0000-0000-0000000000e3')$$,
  'admin CLB insert được alias username');
select lives_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'id:100012345678901', '00000000-0000-0000-0000-0000000000e4')$$,
  'admin CLB insert được alias id');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'u:john.doe', '00000000-0000-0000-0000-0000000000e5')$$,
  '23505', null, 'trùng (club_id, fb_key) bị chặn (primary key)');
select throws_like(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'u:nguoi.clb.khac', '00000000-0000-0000-0000-0000000000f2')$$,
  '%', 'admin CLB A không gắn alias cho member CLB B vào CLB A (trigger cùng CLB)');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c2', 'u:vao.clb.b', '00000000-0000-0000-0000-0000000000f2')$$,
  '42501', null, 'admin CLB A KHÔNG insert được alias vào CLB B (RLS)');
select throws_like(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c2', 'u:lech.clb', '00000000-0000-0000-0000-0000000000e3')$$,
  '%', 'alias club_id CLB B nhưng member CLB A bị chặn');
select is((select count(*) from public.member_facebook_aliases where club_id = '00000000-0000-0000-0000-0000000000c1')::int, 2, 'admin CLB A thấy 2 alias của CLB A');
select throws_ok(
  $$update public.member_facebook_aliases set member_id = '00000000-0000-0000-0000-0000000000e5' where fb_key = 'u:john.doe'$$,
  '42501', null, 'admin KHÔNG update được alias (không có grant update)');
select throws_ok(
  $$update public.member_facebook_aliases set fb_key = 'u:doi.key' where fb_key = 'u:john.doe'$$,
  '42501', null, 'admin KHÔNG đổi được fb_key của alias');
reset role;
select is((select member_id from public.member_facebook_aliases where fb_key = 'u:john.doe'), '00000000-0000-0000-0000-0000000000e3'::uuid, 'alias không bị đổi sau các lần update lậu');

-- Admin CLB B không thấy / không xóa được alias CLB A
select public.tap_as('00000000-0000-0000-0000-0000000000b1'); -- owner B
select is((select count(*) from public.member_facebook_aliases where club_id = '00000000-0000-0000-0000-0000000000c1')::int, 0, 'admin CLB B KHÔNG thấy alias của CLB A');
do $$ begin
  delete from public.member_facebook_aliases where club_id = '00000000-0000-0000-0000-0000000000c1';
exception when others then null; end $$;
do $$ begin
  insert into public.member_facebook_aliases (club_id, fb_key, member_id)
    values ('00000000-0000-0000-0000-0000000000c1', 'u:clb.b.chen', '00000000-0000-0000-0000-0000000000e3');
exception when others then null; end $$;
reset role;
select is((select count(*) from public.member_facebook_aliases where club_id = '00000000-0000-0000-0000-0000000000c1')::int, 2, 'admin CLB B không xóa được và không chèn được alias của CLB A');

-- Member thường: không thấy, không ghi
select public.tap_as('00000000-0000-0000-0000-0000000000a3'); -- member A
select is((select count(*) from public.member_facebook_aliases where club_id = '00000000-0000-0000-0000-0000000000c1')::int, 0, 'member thường KHÔNG thấy alias');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'u:member.chen', '00000000-0000-0000-0000-0000000000e3')$$,
  '42501', null, 'member thường KHÔNG insert được alias');
do $$ begin
  delete from public.member_facebook_aliases where club_id = '00000000-0000-0000-0000-0000000000c1';
exception when others then null; end $$;
reset role;
select is((select count(*) from public.member_facebook_aliases where club_id = '00000000-0000-0000-0000-0000000000c1')::int, 2, 'member thường không xóa được alias');

-- anon
set local role anon;
select throws_ok(
  $$select count(*) from public.member_facebook_aliases where club_id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'anon KHÔNG đọc được alias');
select throws_ok(
  $$insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'u:anon.chen', '00000000-0000-0000-0000-0000000000e3')$$,
  '42501', null, 'anon KHÔNG insert được alias');
reset role;

-- Admin CLB A xóa được
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select lives_ok(
  $$delete from public.member_facebook_aliases where fb_key = 'id:100012345678901'$$,
  'admin CLB xóa được alias');
reset role;
select is((select count(*) from public.member_facebook_aliases where fb_key = 'id:100012345678901')::int, 0, 'alias đã bị xóa');
select is((select count(*) from public.member_facebook_aliases where fb_key = 'u:john.doe')::int, 1, 'alias khác còn nguyên');

-- Xóa thành viên thì alias đi theo (cascade); xóa CLB cũng vậy
insert into public.member_facebook_aliases (club_id, fb_key, member_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'u:nguoi.nghi', '00000000-0000-0000-0000-0000000000e7');
select is((select count(*) from public.member_facebook_aliases where member_id = '00000000-0000-0000-0000-0000000000e7')::int, 1, 'trước khi xóa e7: có 1 alias');
delete from public.club_members where id = '00000000-0000-0000-0000-0000000000e7';
select is((select count(*) from public.member_facebook_aliases where fb_key = 'u:nguoi.nghi')::int, 0, 'xóa thành viên thì alias bị xóa theo (cascade)');

-- ===========================================================================
-- 8. Bucket avatar-frames
-- ===========================================================================
select is((select public from storage.buckets where id = 'avatar-frames'), true, 'bucket avatar-frames tồn tại và public');
select is((select file_size_limit from storage.buckets where id = 'avatar-frames'), 2097152::bigint, 'bucket avatar-frames giới hạn 2 MB');
select is((select allowed_mime_types from storage.buckets where id = 'avatar-frames'), array['image/png'], 'bucket avatar-frames chỉ nhận image/png');

insert into storage.objects (bucket_id, name) values
  ('avatar-frames', '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-00000000f001.png');

set local role anon;
select is((select count(*) from storage.objects where bucket_id = 'avatar-frames' and name like '00000000-0000-0000-0000-0000000000c1/%')::int, 1, 'anon đọc được object trong bucket avatar-frames');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('avatar-frames', '00000000-0000-0000-0000-0000000000c1/anon.png')$$,
  '42501', null, 'anon KHÔNG ghi được object vào avatar-frames');
reset role;

select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select is((select count(*) from storage.objects where bucket_id = 'avatar-frames' and name like '00000000-0000-0000-0000-0000000000c1/%')::int, 1, 'authenticated đọc được object trong avatar-frames');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('avatar-frames', '00000000-0000-0000-0000-0000000000c1/admin.png')$$,
  '42501', null, 'admin (authenticated) KHÔNG ghi được object vào avatar-frames (chỉ service-role)');
do $$ begin
  delete from storage.objects where bucket_id = 'avatar-frames' and name like '00000000-0000-0000-0000-0000000000c1/%';
exception when others then null; end $$;
do $$ begin
  update storage.objects set name = '00000000-0000-0000-0000-0000000000c1/doi-ten.png' where bucket_id = 'avatar-frames' and name like '00000000-0000-0000-0000-0000000000c1/%';
exception when others then null; end $$;
reset role;
select is((select count(*) from storage.objects where bucket_id = 'avatar-frames' and name = '00000000-0000-0000-0000-0000000000c1/00000000-0000-0000-0000-00000000f001.png')::int, 1, 'admin KHÔNG xóa / đổi tên được object trong avatar-frames');

-- ===========================================================================
-- 9. anon không gọi được create_task với chữ ký mới
-- ===========================================================================
set local role anon;
select throws_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Anon', null, now() + interval '1 day', array[]::uuid[], null, p_all_members => true)$$,
  '42501', null, 'anon không execute được create_task (chữ ký mới)');
reset role;
select is((select count(*) from public.tasks where title = 'Anon')::int, 0, 'anon không tạo được task');

select * from finish();
rollback;
