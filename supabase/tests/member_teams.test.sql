-- pgTAP: một thành viên thuộc nhiều ban (Đợt 6). Theo docs/CONTRACT.md mục "DB" (7).
-- Chạy: npx supabase test db   (cần npx supabase db reset để áp migration 20261118000000_member_teams.sql)
begin;
select plan(99);

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

-- Tập ban của một thành viên theo thứ tự id (để so sánh ổn định)
create function public.tap_set(p_member uuid) returns uuid[] language sql as $$
  select coalesce(array_agg(team_id order by team_id), '{}'::uuid[])
  from public.club_member_teams where member_id = p_member
$$;
grant execute on function public.tap_set(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Dữ liệu nền (quyền postgres)
-- ---------------------------------------------------------------------------
-- CLB c1: ban d1 "Ban A", d2 "Ban B", d4 "Ban D", d5 "Ban E". CLB c2: ban d3.
-- a1 Chủ nhiệm (e1). a3 admin{members} ban d2 (e3). a4 admin{} ban d1 (e4).
-- a5 member ban d1 (e5), a6 member ban d1 (e6).
-- g1 "Cả hai" ban d1, g2 "Chỉ d1", g3 "Chỉ d2", g4 "Không ban", g5/g6/h1 dành cho test trigger.
-- CLB c2: b1 Chủ nhiệm (f1), f2 member ban d3.
insert into auth.users (id, email, aud, role)
select public.u(x), x || '@bit.test', 'authenticated', 'authenticated'
from unnest(array['a1','a3','a4','a5','a6','b1']) x;

insert into public.clubs (id, name) values (public.u('c1'), 'CLB A'), (public.u('c2'), 'CLB B');
insert into public.teams (id, club_id, name) values
  (public.u('d1'), public.u('c1'), 'Ban A'),
  (public.u('d2'), public.u('c1'), 'Ban B'),
  (public.u('d4'), public.u('c1'), 'Ban D'),
  (public.u('d5'), public.u('c1'), 'Ban E'),
  (public.u('d3'), public.u('c2'), 'Ban của CLB B');

insert into public.club_members
  (id, club_id, user_id, team_id, role, full_name, is_active, student_code, email, permissions, is_head) values
  (public.u('e1'), public.u('c1'), public.u('a1'), null,          'owner',  'Chủ nhiệm',   true, 'E1', 'e1@t.test', '{}', true),
  (public.u('e3'), public.u('c1'), public.u('a3'), public.u('d2'), 'admin',  'Admin d2',    true, 'E3', 'e3@t.test', array['members'], false),
  (public.u('e4'), public.u('c1'), public.u('a4'), public.u('d1'), 'admin',  'Admin d1',    true, 'E4', 'e4@t.test', '{}', false),
  (public.u('e5'), public.u('c1'), public.u('a5'), public.u('d1'), 'member', 'Member 5',    true, 'E5', null, '{}', false),
  (public.u('e6'), public.u('c1'), public.u('a6'), public.u('d1'), 'member', 'Member 6',    true, 'E6', null, '{}', false),
  (public.u('f1'), public.u('c2'), public.u('b1'), null,          'owner',  'Chủ nhiệm B', true, 'F1', 'f1@t.test', '{}', true),
  (public.u('f2'), public.u('c2'), null,           public.u('d3'), 'member', 'Member B',    true, 'F2', null, '{}', false);

insert into public.club_members (id, club_id, team_id, role, full_name, is_active, student_code) values
  (public.u('aa01'), public.u('c1'), public.u('d1'), 'member', 'Cả hai',  true, 'G1'),
  (public.u('aa02'), public.u('c1'), public.u('d1'), 'member', 'Chỉ d1',  true, 'G2'),
  (public.u('aa03'), public.u('c1'), public.u('d2'), 'member', 'Chỉ d2',  true, 'G3'),
  (public.u('aa04'), public.u('c1'), null,           'member', 'Không ban', true, 'G4'),
  (public.u('aa05'), public.u('c1'), null,           'member', 'Thử trigger', true, 'G5'),
  (public.u('aa06'), public.u('c1'), null,           'member', 'Thử xóa', true, 'G6'),
  (public.u('aa07'), public.u('c1'), public.u('d5'), 'member', 'Thử xóa ban', true, 'H1');

-- ===========================================================================
-- 0. Bảng, RLS, quyền
-- ===========================================================================
select has_table('public', 'club_member_teams', 'bảng club_member_teams tồn tại');
select is(
  (select relrowsecurity from pg_class where oid = 'public.club_member_teams'::regclass),
  true, 'club_member_teams bật RLS');
select ok(has_table_privilege('authenticated', 'public.club_member_teams', 'select'), 'authenticated có select');
select ok(
  not has_table_privilege('authenticated', 'public.club_member_teams', 'insert')
  and not has_table_privilege('authenticated', 'public.club_member_teams', 'update')
  and not has_table_privilege('authenticated', 'public.club_member_teams', 'delete'),
  'authenticated không ghi được club_member_teams');
select ok(
  not has_table_privilege('anon', 'public.club_member_teams', 'select')
  and not has_table_privilege('anon', 'public.club_member_teams', 'insert'),
  'anon không có quyền gì trên club_member_teams');
select ok(has_table_privilege('service_role', 'public.club_member_teams', 'insert'), 'service_role ghi được');

-- ===========================================================================
-- 1. Đồng bộ ban chính -> tập (insert member có team_id đã chạy qua trigger ở dữ liệu nền)
-- ===========================================================================
select is(public.tap_set(public.u('aa01')), array[public.u('d1')], 'insert member có ban: ban chính vào tập');
select is(public.tap_set(public.u('e1')), '{}'::uuid[], 'member không ban: tập rỗng');

-- Backfill (cùng câu SQL của migration): xóa tập rồi chạy lại phải khôi phục đúng.
-- Chỉ động tới thành viên do test tạo (CLB c1, c2) để không vỡ khi DB local có dữ liệu sẵn.
create temp table tap_test_members as
  select id from public.club_members where club_id in (public.u('c1'), public.u('c2'));
create temp table tap_set_before as
  select member_id, team_id from public.club_member_teams
  where member_id in (select id from tap_test_members);
set local session_replication_role = replica;  -- xóa không kích trigger đổi ban chính
delete from public.club_member_teams where member_id in (select id from tap_test_members);
set local session_replication_role = origin;
insert into public.club_member_teams (member_id, team_id)
select id, team_id from public.club_members
where team_id is not null and id in (select id from tap_test_members);
select is(
  (select count(*) from (
     (select member_id, team_id from public.club_member_teams
        where member_id in (select id from tap_test_members)
      except select * from tap_set_before)
     union all
     (select * from tap_set_before
      except select member_id, team_id from public.club_member_teams
        where member_id in (select id from tap_test_members))
   ) d)::int,
  0, 'backfill: mỗi ban chính thành một dòng trong tập');

update public.club_members set team_id = public.u('d1') where id = public.u('aa05');
select is(public.tap_set(public.u('aa05')), array[public.u('d1')], 'update team_id từ null: ban mới vào tập');
update public.club_members set team_id = public.u('d2') where id = public.u('aa05');
select is(public.tap_set(public.u('aa05')), array[public.u('d1'), public.u('d2')], 'đổi ban chính: ban cũ KHÔNG bị xóa khỏi tập');
select is((select team_id from public.club_members where id = public.u('aa05')), public.u('d2'), 'ban chính là ban mới');
update public.club_members set team_id = null where id = public.u('aa05');
select is(public.tap_set(public.u('aa05')), array[public.u('d1'), public.u('d2')], 'đặt team_id = null: tập giữ nguyên');
update public.club_members set team_id = public.u('d2') where id = public.u('aa05');
select is((select count(*) from public.club_member_teams where member_id = public.u('aa05'))::int, 2, 'đặt lại ban đã có: không trùng dòng');

select throws_ok(
  $$update public.club_members set team_id = public.u('d3') where id = public.u('aa05')$$,
  'P0001', 'Ban phải thuộc cùng CLB với thành viên', 'đặt ban chính là ban của CLB khác bị chặn (trigger)');
select throws_ok(
  $$insert into public.club_member_teams (member_id, team_id) values (public.u('aa05'), public.u('d3'))$$,
  'P0001', 'Ban phải thuộc cùng CLB với thành viên', 'ghép với ban của CLB khác bị chặn');
select throws_ok(
  $$insert into public.club_member_teams (member_id, team_id) values (public.u('aa05'), public.u('d1'))$$,
  '23505', null, 'khóa chính (member_id, team_id) chặn trùng');

-- ===========================================================================
-- 2. Xóa dòng tập đúng bằng ban chính
-- ===========================================================================
-- aa06: tập {d1 (cũ nhất), d2, d4 (mới nhất)}, ban chính d2.
insert into public.club_member_teams (member_id, team_id, created_at) values
  (public.u('aa06'), public.u('d1'), now() - interval '3 hours'),
  (public.u('aa06'), public.u('d2'), now() - interval '2 hours'),
  (public.u('aa06'), public.u('d4'), now() - interval '1 hour');
update public.club_members set team_id = public.u('d2') where id = public.u('aa06');
select is(public.tap_set(public.u('aa06')), array[public.u('d1'), public.u('d2'), public.u('d4')], 'dựng tập 3 ban cho aa06');

delete from public.club_member_teams where member_id = public.u('aa06') and team_id = public.u('d4');
select is((select team_id from public.club_members where id = public.u('aa06')), public.u('d2'), 'xóa ban không phải ban chính: ban chính giữ nguyên');
insert into public.club_member_teams (member_id, team_id, created_at) values (public.u('aa06'), public.u('d4'), now() - interval '1 hour');

delete from public.club_member_teams where member_id = public.u('aa06') and team_id = public.u('d2');
select is((select team_id from public.club_members where id = public.u('aa06')), public.u('d1'), 'xóa ban chính: ban chính sang ban còn lại CŨ NHẤT');
delete from public.club_member_teams where member_id = public.u('aa06') and team_id = public.u('d1');
select is((select team_id from public.club_members where id = public.u('aa06')), public.u('d4'), 'xóa tiếp ban chính: sang ban còn lại');
delete from public.club_member_teams where member_id = public.u('aa06');
select is((select team_id from public.club_members where id = public.u('aa06')), null, 'xóa hết tập: ban chính = null');
select is(public.tap_set(public.u('aa06')), '{}'::uuid[], 'không vòng lặp trigger: tập rỗng sau khi xóa hết');

-- Xóa cả ban: aa07 có ban chính d5 và thêm d1 (cũ hơn). Xóa ban d5 -> ban chính còn lại là d1.
insert into public.club_member_teams (member_id, team_id, created_at) values
  (public.u('aa07'), public.u('d1'), now() - interval '5 hours');
delete from public.teams where id = public.u('d5');
select is((select team_id from public.club_members where id = public.u('aa07')), public.u('d1'), 'xóa ban chính khỏi bảng teams: ban chính sang ban còn lại');
select is(public.tap_set(public.u('aa07')), array[public.u('d1')], 'xóa ban: dòng tập của ban đó cascade');

-- Xóa thành viên: cascade tập, không lỗi.
select lives_ok($$delete from public.club_members where id = public.u('aa07')$$, 'xóa thành viên không lỗi');
select is((select count(*) from public.club_member_teams where member_id = public.u('aa07'))::int, 0, 'xóa thành viên: tập cascade');

-- ===========================================================================
-- 3. set_member_teams
-- ===========================================================================
set local role service_role;
select lives_ok(
  $$select public.set_member_teams(public.u('aa04'), array[public.u('d2'), public.u('d1')])$$,
  'service_role gọi được set_member_teams');
reset role;
select is((select team_id from public.club_members where id = public.u('aa04')), public.u('d2'), 'phần tử đầu = ban chính');
select is(public.tap_set(public.u('aa04')), array[public.u('d1'), public.u('d2')], 'tập = đúng mảng');
select is(
  (select array_agg(team_id order by created_at, team_id) from public.club_member_teams where member_id = public.u('aa04')),
  array[public.u('d2'), public.u('d1')], 'thứ tự created_at theo thứ tự mảng');

set local role service_role;
select public.set_member_teams(public.u('aa04'), array[public.u('d1'), public.u('d1'), public.u('d4'), public.u('d1')]);
reset role;
select is(public.tap_set(public.u('aa04')), array[public.u('d1'), public.u('d4')], 'bỏ trùng, bỏ ban không còn trong mảng');
select is((select team_id from public.club_members where id = public.u('aa04')), public.u('d1'), 'đổi ban chính sang phần tử đầu');

set local role service_role;
select public.set_member_teams(public.u('aa04'), array[public.u('d4')]);
reset role;
select is(public.tap_set(public.u('aa04')), array[public.u('d4')], 'thu về một ban');
select is((select team_id from public.club_members where id = public.u('aa04')), public.u('d4'), 'ban chính là ban duy nhất');

set local role service_role;
select public.set_member_teams(public.u('aa04'), '{}'::uuid[]);
reset role;
select is(public.tap_set(public.u('aa04')), '{}'::uuid[], 'mảng rỗng: tập rỗng');
select is((select team_id from public.club_members where id = public.u('aa04')), null, 'mảng rỗng: ban chính null');

-- Lỗi: không ghi gì (nguyên tử).
set local role service_role;
select public.set_member_teams(public.u('aa04'), array[public.u('d1'), public.u('d2')]);
select throws_ok(
  $$select public.set_member_teams(public.u('aa04'), array[public.u('d4'), public.u('d3')])$$,
  'P0001', 'Có ban không thuộc CLB của thành viên này', 'ban của CLB khác bị chặn');
select throws_ok(
  $$select public.set_member_teams(public.u('aa04'), null)$$,
  'P0001', 'Danh sách ban không hợp lệ', 'mảng null bị chặn');
select throws_ok(
  $$select public.set_member_teams(public.u('aa04'), array[public.u('d1'), null]::uuid[])$$,
  'P0001', 'Danh sách ban không hợp lệ', 'mảng chứa null bị chặn');
select throws_ok(
  $$select public.set_member_teams(public.u('ffff'), array[public.u('d1')])$$,
  'P0001', 'Không tìm thấy thành viên', 'thành viên không tồn tại');
reset role;
select is(public.tap_set(public.u('aa04')), array[public.u('d1'), public.u('d2')], 'sau các lỗi: tập không đổi');
select is((select team_id from public.club_members where id = public.u('aa04')), public.u('d1'), 'sau các lỗi: ban chính không đổi');

select public.tap_as(public.u('a1'));
select throws_ok(
  $$select public.set_member_teams(public.u('aa04'), array[public.u('d1')])$$,
  '42501', null, 'authenticated (kể cả Chủ nhiệm) không gọi được set_member_teams');
reset role;
set local role anon;
select throws_ok(
  $$select public.set_member_teams(public.u('aa04'), array[public.u('d1')])$$,
  '42501', null, 'anon không gọi được set_member_teams');
reset role;

-- ===========================================================================
-- 4. RLS đọc
-- ===========================================================================
-- Dựng: e5 thuộc {d1, d2}; aa01 ("Cả hai") thuộc {d1, d2} nhưng d1 mới hơn d2 theo created_at.
set local role service_role;
select public.set_member_teams(public.u('e5'), array[public.u('d1'), public.u('d2')]);
select public.set_member_teams(public.u('aa01'), array[public.u('d1'), public.u('d2')]);
reset role;
update public.club_member_teams set created_at = now() + interval '1 hour'
where member_id = public.u('aa01') and team_id = public.u('d1');

select public.tap_as(public.u('a1'));
select is(
  (select count(*) from public.club_member_teams where member_id = public.u('e5'))::int, 2,
  'admin/owner CLB đọc được tập ban của thành viên CLB mình');
select is(
  (select count(*) from public.club_member_teams where member_id = public.u('f2'))::int, 0,
  'owner CLB A không đọc được tập ban của CLB B');
reset role;
select public.tap_as(public.u('a4'));
select is(
  (select count(*) from public.club_member_teams where member_id = public.u('e5'))::int, 2,
  'admin CLB (ban d1) đọc được tập ban của cả CLB');
reset role;
select public.tap_as(public.u('a5'));
select is(
  (select count(*) from public.club_member_teams where member_id = public.u('e5'))::int, 2,
  'thành viên đọc được tập ban của chính mình');
select is(
  (select count(*) from public.club_member_teams where member_id <> public.u('e5'))::int, 0,
  'thành viên không đọc được tập ban của người khác');
select throws_ok(
  $$insert into public.club_member_teams (member_id, team_id) values (public.u('e5'), public.u('d4'))$$,
  '42501', null, 'authenticated không insert được');
select throws_ok(
  $$delete from public.club_member_teams where member_id = public.u('e5')$$,
  '42501', null, 'authenticated không delete được');
select throws_ok(
  $$update public.club_member_teams set team_id = public.u('d4') where member_id = public.u('e5')$$,
  '42501', null, 'authenticated không update được');
reset role;
select public.tap_as(public.u('b1'));
select is(
  (select count(*) from public.club_member_teams)::int, 1,
  'owner CLB B chỉ đọc được tập ban của CLB B');
reset role;
set local role anon;
select throws_ok($$select * from public.club_member_teams$$, '42501', null, 'anon không đọc được club_member_teams');
reset role;

-- ===========================================================================
-- 5. Giao việc: admin ban B giao cho người thuộc cả A và B
-- ===========================================================================
-- e3 (a3) là admin có ban chính d2. aa01 thuộc {d1,d2}, e5 thuộc {d1,d2}, aa03 thuộc {d2}, aa02 thuộc {d1}.
select public.tap_as(public.u('a3'));
select is(public.my_club_team(public.u('c1')), public.u('d2'), 'my_club_team vẫn là ban chính (d2)');
select lives_ok(
  $$select public.create_task(public.u('c1'), 'Giao người hai ban', null, now() + interval '5 days',
      array[public.u('aa01')], null)$$,
  'admin ban d2 giao được cho người thuộc cả d1 và d2');
select throws_ok(
  $$select public.create_task(public.u('c1'), 'Giao người ban khác', null, now() + interval '5 days',
      array[public.u('aa02')], null)$$,
  'P0001', 'Bạn chỉ được giao việc cho thành viên trong ban của mình',
  'admin ban d2 không giao được cho người chỉ thuộc d1');
select throws_ok(
  $$select public.create_task(public.u('c1'), 'Giao lẫn', null, now() + interval '5 days',
      array[public.u('aa01'), public.u('aa02')], null)$$,
  'P0001', 'Bạn chỉ được giao việc cho thành viên trong ban của mình', 'chỉ cần một người ngoài ban là bị chặn');
select lives_ok(
  $$select public.create_task(public.u('c1'), 'Giao cả ban', null, now() + interval '5 days',
      '{}'::uuid[], public.u('d2'))$$,
  'giao "cả ban" d2');
reset role;
select is(
  (select array_agg(ta.member_id order by ta.member_id) from public.task_assignees ta
   join public.tasks t on t.id = ta.task_id where t.title = 'Giao cả ban'),
  array[public.u('e3'), public.u('e5'), public.u('aa01'), public.u('aa03'), public.u('aa04'), public.u('aa05')],
  '"cả ban" d2 lấy mọi thành viên đang hoạt động có d2 trong tập (kể cả ban phụ)');

-- can_assign_task_member qua RLS insert vào task_assignees.
select public.tap_as(public.u('a3'));
select lives_ok(
  $$insert into public.task_assignees (task_id, member_id)
    select id, public.u('e3') from public.tasks where title = 'Giao người hai ban'$$,
  'admin ban d2 thêm được người nhận thuộc ban của mình (ban chính hoặc phụ)');
select throws_ok(
  $$insert into public.task_assignees (task_id, member_id)
    select id, public.u('aa02') from public.tasks where title = 'Giao người hai ban'$$,
  '42501', null, 'admin ban d2 không thêm được người chỉ thuộc d1 (RLS)');
select is(
  (select public.can_assign_task_member(id, public.u('e5')) from public.tasks where title = 'Giao người hai ban'),
  true, 'can_assign_task_member: người có d2 làm ban phụ');
select is(
  (select public.can_assign_task_member(id, public.u('aa02')) from public.tasks where title = 'Giao người hai ban'),
  false, 'can_assign_task_member: người chỉ d1 = false');
reset role;

-- ===========================================================================
-- 6. club_contribution
-- ===========================================================================
select public.tap_as(public.u('a1'));
select lives_ok(
  $$select public.create_task(public.u('c1'), 'Việc ban d1', null, now() + interval '5 days',
      array[public.u('aa01')], public.u('d1'))$$,
  'owner giao việc cho ban d1 (tasks.team_id = d1)');
select is(
  (select assigned from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days')
   where member_id = public.u('aa01')),
  3, 'club_contribution: owner đếm mọi việc của aa01 (2 việc ban d2 + 1 việc ban d1)');
select is(
  (select team_ids from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days')
   where member_id = public.u('aa01')),
  array[public.u('d1'), public.u('d2')],
  'club_contribution: team_ids có ban chính (d1) đứng đầu dù d2 có created_at cũ hơn');
select is(
  (select team_id from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days')
   where member_id = public.u('aa01')),
  public.u('d1'), 'club_contribution: cột team_id vẫn là ban chính');
select is(
  (select team_ids from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days')
   where member_id = public.u('e1')),
  '{}'::uuid[], 'club_contribution: không ban -> team_ids rỗng');
reset role;

select public.tap_as(public.u('a3'));
select is(
  (select array_agg(member_id order by member_id)
   from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days')),
  array[public.u('e3'), public.u('e5'), public.u('aa01'), public.u('aa03'), public.u('aa04'), public.u('aa05')],
  'club_contribution: admin ban d2 thấy người có d2 trong tập (kể cả ban phụ), không thấy người chỉ d1');
reset role;
select public.tap_as(public.u('a3'));
select is(
  (select assigned from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days')
   where member_id = public.u('aa01')),
  2, 'club_contribution: admin ban d2 chỉ đếm việc ban d2 của aa01, không đếm việc ban d1');
reset role;
select public.tap_as(public.u('a4'));
select is(
  (select assigned from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days')
   where member_id = public.u('aa01')),
  1, 'club_contribution: admin ban d1 chỉ đếm việc ban d1 của aa01, không đếm việc ban d2');
select is(
  (select array_agg(member_id order by member_id)
   from public.club_contribution(public.u('c1'), now() - interval '100 days', now() + interval '100 days')),
  array[public.u('e4'), public.u('e5'), public.u('e6'), public.u('aa01'), public.u('aa02'), public.u('aa04'), public.u('aa05')],
  'club_contribution: admin ban d1 thấy người có d1 trong tập');
reset role;

-- ===========================================================================
-- 7. import_members: THÊM ban
-- ===========================================================================
-- aa02 "Chỉ d1" (G2) ban chính d1; aa04 (G4) có tập {d1,d2}; g3 (G3) chỉ d2. Đặt lại aa04 về không ban.
set local role service_role;
select public.set_member_teams(public.u('aa04'), '{}'::uuid[]);
reset role;

select public.tap_as(public.u('a1'));
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Chỉ d1","student_code":"G2","team":"Ban B"}]'::jsonb),
  '{"inserted":0,"updated":1,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  'import: thành viên có ban d1 + cột Ban = Ban B -> updated');
reset role;
select is((select team_id from public.club_members where id = public.u('aa02')), public.u('d1'), 'import: ban chính giữ nguyên d1');
select is(public.tap_set(public.u('aa02')), array[public.u('d1'), public.u('d2')], 'import: ban mới được THÊM vào tập');

select public.tap_as(public.u('a1'));
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Chỉ d1","student_code":"G2","team":"ban b"}]'::jsonb),
  '{"inserted":0,"updated":0,"unchanged":1,"staff_team_skipped":0}'::jsonb,
  'import lại cùng ban đã có trong tập (kể cả ban phụ): unchanged');
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Không ban","student_code":"G4","team":"Ban D"}]'::jsonb),
  '{"inserted":0,"updated":1,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  'import: thành viên không ban + ban D -> updated');
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Mới","student_code":"N1","team":"Ban B"}]'::jsonb),
  '{"inserted":1,"updated":0,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  'import: thành viên mới có ban -> inserted');
reset role;
select is((select team_id from public.club_members where id = public.u('aa04')), public.u('d4'), 'import: ban chính chỉ đặt khi đang null');
select is(public.tap_set(public.u('aa04')), array[public.u('d4')], 'import: tập của người không ban = ban vừa thêm');
select is(
  (select public.tap_set(id) from public.club_members where student_code = 'N1' and club_id = public.u('c1')),
  array[public.u('d2')], 'import: thành viên mới có ban chính và tập là ban đó');

-- Dòng owner/admin: người không phải Chủ nhiệm không thêm được ban; Chủ nhiệm thì thêm được.
select public.tap_as(public.u('a3'));
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Admin d1","student_code":"E4","team":"Ban B"}]'::jsonb),
  '{"inserted":0,"updated":0,"unchanged":0,"staff_team_skipped":1}'::jsonb,
  'import: admin (không phải Chủ nhiệm) không thêm được ban cho admin khác -> staff_team_skipped (Đợt 7: dòng bỏ qua hoàn toàn)');
reset role;
select is(public.tap_set(public.u('e4')), array[public.u('d1')], 'import: tập của admin không đổi khi bị bỏ qua');
select public.tap_as(public.u('a1'));
select is(
  public.import_members(public.u('c1'), '[{"full_name":"Admin d1","student_code":"E4","team":"Ban B"}]'::jsonb),
  '{"inserted":0,"updated":1,"unchanged":0,"staff_team_skipped":0}'::jsonb,
  'import: Chủ nhiệm thêm được ban cho admin');
reset role;
select is(public.tap_set(public.u('e4')), array[public.u('d1'), public.u('d2')], 'import: tập của admin có thêm d2');
select is((select team_id from public.club_members where id = public.u('e4')), public.u('d1'), 'import: ban chính của admin không đổi');

-- ===========================================================================
-- 8. admit_applications: THÊM ban của vị trí vào tập (kể cả thành viên sẵn có)
-- ===========================================================================
insert into public.club_members (id, club_id, team_id, role, full_name, is_active, student_code, email) values
  (public.u('ad01'), public.u('c1'), public.u('d1'), 'member', 'Có sẵn ban A', true, 'AD1', 'ad1@x.com'),
  (public.u('ad02'), public.u('c1'), null,           'member', 'Có sẵn không ban', true, 'AD2', 'ad2@x.com');
insert into public.recruitment_campaigns (id, club_id, name) values (public.u('ca01'), public.u('c1'), 'Đợt tuyển');
insert into public.recruitment_positions (id, campaign_id, team_id, name) values
  (public.u('b001'), public.u('ca01'), public.u('d2'), 'Vị trí ban B');
insert into public.applications (id, campaign_id, position_id, full_name, email, student_code, status) values
  (public.u('ab01'), public.u('ca01'), public.u('b001'), 'Có sẵn ban A', 'ad1@x.com', 'AD1', 'passed'),
  (public.u('ab02'), public.u('ca01'), public.u('b001'), 'Có sẵn không ban', 'ad2@x.com', 'AD2', 'passed'),
  (public.u('ab03'), public.u('ca01'), public.u('b001'), 'Người mới', 'moi@x.com', 'AD3', 'passed');

select public.tap_as(public.u('a1'));
select is(
  public.admit_applications(array[public.u('ab01'), public.u('ab02'), public.u('ab03')]),
  '{"admitted":3,"skipped":0}'::jsonb, 'admit_applications kết nạp 3 đơn');
reset role;
select is(public.tap_set(public.u('ad01')), array[public.u('d1'), public.u('d2')], 'kết nạp thành viên ban A vào vị trí ban B: tập {A,B}');
select is((select team_id from public.club_members where id = public.u('ad01')), public.u('d1'), 'ban chính vẫn là A');
select is(public.tap_set(public.u('ad02')), array[public.u('d2')], 'thành viên sẵn có không ban: ban của vị trí vào tập');
select is((select team_id from public.club_members where id = public.u('ad02')), public.u('d2'), 'ban chính null thì đặt luôn');
select is(
  (select public.tap_set(id) from public.club_members where student_code = 'AD3' and club_id = public.u('c1')),
  array[public.u('d2')], 'thành viên mới: ban của vị trí là ban chính và là tập duy nhất');

-- ===========================================================================
-- 9. activate_term: đổi ban theo nhiệm kỳ = chuyển ban
-- ===========================================================================
insert into public.club_members (id, club_id, team_id, role, full_name, is_active, student_code) values
  (public.u('a701'), public.u('c1'), public.u('d1'), 'member', 'Đổi ban', true, 'AT1'),
  (public.u('a702'), public.u('c1'), public.u('d1'), 'member', 'Giữ ban', true, 'AT2'),
  (public.u('a703'), public.u('c1'), public.u('d1'), 'member', 'Không ghi ban', true, 'AT3');
insert into public.club_member_teams (member_id, team_id) values
  (public.u('a701'), public.u('d4')),
  (public.u('a702'), public.u('d4'));
insert into public.club_terms (id, club_id, name, status) values (public.u('7e01'), public.u('c1'), 'Nhiệm kỳ mới', 'draft');
insert into public.club_term_roles (term_id, member_id, role, team_id, permissions, is_head) values
  (public.u('7e01'), public.u('e1'),   'owner', null,           '{}', true),
  (public.u('7e01'), public.u('a701'), 'admin', public.u('d2'), '{}', false),
  (public.u('7e01'), public.u('a702'), 'admin', public.u('d1'), '{}', false),
  (public.u('7e01'), public.u('a703'), 'admin', null,           '{}', false);

select public.tap_as(public.u('a1'));
select lives_ok($$select public.activate_term(public.u('7e01'))$$, 'Chủ nhiệm kích hoạt nhiệm kỳ');
reset role;
select is((select team_id from public.club_members where id = public.u('a701')), public.u('d2'), 'đổi ban: ban chính là ban của nhiệm kỳ');
select is(public.tap_set(public.u('a701')), array[public.u('d2'), public.u('d4')], 'đổi ban: ban chính cũ bị gỡ, ban phụ d4 giữ nguyên');
select is(public.tap_set(public.u('a702')), array[public.u('d1'), public.u('d4')], 'nhiệm kỳ ghi đúng ban chính cũ: tập không đổi');
select is(public.tap_set(public.u('a703')), array[public.u('d1')], 'nhiệm kỳ không ghi ban: tập không đổi');

select * from finish();
rollback;
