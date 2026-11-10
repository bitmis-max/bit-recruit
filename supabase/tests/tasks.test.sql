-- pgTAP: giao việc, người nhận, đóng góp. Theo docs/CONTRACT.md mục 1 và 4.
-- Chạy: npx supabase test db   (cần npx supabase db reset để áp migration mới nhất)
begin;
select plan(137);

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
  ('00000000-0000-0000-0000-0000000000a5', 'member3@bit.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'ownerb@bit.test',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'memberb@bit.test', 'authenticated', 'authenticated');

insert into public.clubs (id, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'CLB A'),
  ('00000000-0000-0000-0000-0000000000c2', 'CLB B');

insert into public.teams (id, club_id, name) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'Ban Truyền thông'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 'Ban Trống'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c2', 'Ban của CLB B');

-- club_members: e1 owner A (a1), e2 admin A (a2), e3 member (a3), e4 member (a4), e8 member (a5, không có việc)
-- e5, e6 hoạt động + e7 ngừng hoạt động đều thuộc ban d1. f1 owner B, f2 member B.
insert into public.club_members (id, club_id, user_id, team_id, role, full_name, is_active, student_code) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', null, 'owner',  'Owner A',  true,  'OWN1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', null, 'admin',  'Admin A',  true,  'ADM1'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3', null, 'member', 'Member 1', true,  'MEM1'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a4', null, 'member', 'Member 2', true,  'MEM2'),
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000c1', null, '00000000-0000-0000-0000-0000000000d1', 'member', 'Ban viên 1', true,  'T1'),
  ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000c1', null, '00000000-0000-0000-0000-0000000000d1', 'member', 'Ban viên 2', true,  'T2'),
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000c1', null, '00000000-0000-0000-0000-0000000000d1', 'member', 'Ban viên nghỉ', false, 'T3'),
  ('00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a5', null, 'member', 'Member 3', true,  'MEM3'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', null, 'owner',  'Owner B',  true,  'OB1'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', null, 'member', 'Member B', true,  'OB2');

-- Việc dùng cho RLS / set_my_task_done (đều chưa tới hạn, hạn +10 ngày)
insert into public.tasks (id, club_id, title, due_at, status) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000c1', 'Task chính',            now() + interval '10 days', 'open'),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000c1', 'Task của người khác',   now() + interval '10 days', 'open'),
  ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-0000000000c1', 'Task đã đóng',          now() + interval '10 days', 'closed'),
  ('00000000-0000-0000-0000-00000000a004', '00000000-0000-0000-0000-0000000000c1', 'Task bị missed',        now() + interval '10 days', 'open'),
  ('00000000-0000-0000-0000-00000000a005', '00000000-0000-0000-0000-0000000000c2', 'Task của CLB B',        now() + interval '10 days', 'open'),
  ('00000000-0000-0000-0000-00000000a006', '00000000-0000-0000-0000-0000000000c1', 'Task để admin sửa',     now() + interval '10 days', 'open'),
  ('00000000-0000-0000-0000-00000000a007', '00000000-0000-0000-0000-0000000000c1', 'Task để xóa cascade',   now() + interval '10 days', 'open');

insert into public.task_assignees (task_id, member_id) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000e5'),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000e5'),
  ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-00000000a004', '00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-00000000a005', '00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-00000000a006', '00000000-0000-0000-0000-0000000000e4'),
  ('00000000-0000-0000-0000-00000000a007', '00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-00000000a007', '00000000-0000-0000-0000-0000000000e4');
update public.task_assignees set status = 'missed'
  where task_id = '00000000-0000-0000-0000-00000000a004' and member_id = '00000000-0000-0000-0000-0000000000e3';

-- Việc dùng cho club_contribution.
-- Cửa sổ W1 = [now()-100d, now()-50d), cửa sổ W2 = [now()+200d, now()+300d)
insert into public.tasks (id, club_id, title, due_at) values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000c1', 'K1', now() - interval '90 days'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-0000000000c1', 'K2', now() - interval '80 days'),
  ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-0000000000c1', 'K3 ngoài cửa sổ', now() - interval '30 days'),
  ('00000000-0000-0000-0000-00000000b004', '00000000-0000-0000-0000-0000000000c1', 'K4 đúng p_to (loại)', now() - interval '50 days'),
  ('00000000-0000-0000-0000-00000000b005', '00000000-0000-0000-0000-0000000000c1', 'K5 đúng p_from (nhận)', now() - interval '100 days'),
  ('00000000-0000-0000-0000-00000000b006', '00000000-0000-0000-0000-0000000000c1', 'K6 tương lai', now() + interval '250 days');

insert into public.task_assignees (task_id, member_id) values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000e4'),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000e5'),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000e6'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-0000000000e4'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-0000000000e5'),
  ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-0000000000e7'),
  ('00000000-0000-0000-0000-00000000b004', '00000000-0000-0000-0000-0000000000e7'),
  ('00000000-0000-0000-0000-00000000b005', '00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-00000000b006', '00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-00000000b006', '00000000-0000-0000-0000-0000000000e4'),
  ('00000000-0000-0000-0000-00000000b006', '00000000-0000-0000-0000-0000000000e5');

-- K1: e1 xong đúng hạn (completed_at = due, biên <=), e3 xong sớm, e4 xong trễ, e5 missed, e6 pending (đã quá hạn => bỏ lỡ)
update public.task_assignees set status = 'done'
  where task_id = '00000000-0000-0000-0000-00000000b001'
    and member_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4');
update public.task_assignees set status = 'missed'
  where task_id = '00000000-0000-0000-0000-00000000b001' and member_id = '00000000-0000-0000-0000-0000000000e5';
update public.task_assignees ta set completed_at = t.due_at
  from public.tasks t where t.id = ta.task_id and ta.task_id = '00000000-0000-0000-0000-00000000b001' and ta.member_id = '00000000-0000-0000-0000-0000000000e1';
update public.task_assignees ta set completed_at = t.due_at - interval '1 hour'
  from public.tasks t where t.id = ta.task_id and ta.task_id = '00000000-0000-0000-0000-00000000b001' and ta.member_id = '00000000-0000-0000-0000-0000000000e3';
update public.task_assignees ta set completed_at = t.due_at + interval '2 hours'
  from public.tasks t where t.id = ta.task_id and ta.task_id = '00000000-0000-0000-0000-00000000b001' and ta.member_id = '00000000-0000-0000-0000-0000000000e4';
-- K2: e3 xong trễ 1 ngày, e4 pending (quá hạn), e5 missed
update public.task_assignees set status = 'done'
  where task_id = '00000000-0000-0000-0000-00000000b002' and member_id = '00000000-0000-0000-0000-0000000000e3';
update public.task_assignees set status = 'missed'
  where task_id = '00000000-0000-0000-0000-00000000b002' and member_id = '00000000-0000-0000-0000-0000000000e5';
update public.task_assignees ta set completed_at = t.due_at + interval '1 day'
  from public.tasks t where t.id = ta.task_id and ta.task_id = '00000000-0000-0000-0000-00000000b002' and ta.member_id = '00000000-0000-0000-0000-0000000000e3';
-- K6 (tương lai): e3 pending chưa tới hạn, e4 xong (completed_at do trigger = now() <= due), e5 missed
update public.task_assignees set status = 'done'
  where task_id = '00000000-0000-0000-0000-00000000b006' and member_id = '00000000-0000-0000-0000-0000000000e4';
update public.task_assignees set status = 'missed'
  where task_id = '00000000-0000-0000-0000-00000000b006' and member_id = '00000000-0000-0000-0000-0000000000e5';

-- ===========================================================================
-- 0. Trigger trên task_assignees (chạy bằng postgres)
-- ===========================================================================
select isnt((select completed_at from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000b006' and member_id = '00000000-0000-0000-0000-0000000000e4'), null,
  'trigger: chuyển sang done thì completed_at được đặt');
select is((select completed_at from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000b006' and member_id = '00000000-0000-0000-0000-0000000000e4'), now(),
  'trigger: completed_at = now() lúc chuyển sang done');
select is((select completed_at from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000b001' and member_id = '00000000-0000-0000-0000-0000000000e4'),
  (select due_at + interval '2 hours' from public.tasks where id = '00000000-0000-0000-0000-00000000b001'),
  'trigger: sửa completed_at khi status vẫn là done thì giữ giá trị (dữ liệu ca trễ dựng được)');
select is((select completed_at from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000b001' and member_id = '00000000-0000-0000-0000-0000000000e5'), null,
  'trigger: chuyển sang missed thì completed_at null');
select is((select completed_at from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000b001' and member_id = '00000000-0000-0000-0000-0000000000e6'), null,
  'trigger: pending thì completed_at null');
select lives_ok(
  $$update public.task_assignees set status = 'pending' where task_id = '00000000-0000-0000-0000-00000000b002' and member_id = '00000000-0000-0000-0000-0000000000e3'$$,
  'postgres đổi done -> pending');
select is((select completed_at from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000b002' and member_id = '00000000-0000-0000-0000-0000000000e3'), null,
  'trigger: rời khỏi done thì completed_at về null');
-- khôi phục ca K2/e3 cho phần club_contribution
update public.task_assignees set status = 'done' where task_id = '00000000-0000-0000-0000-00000000b002' and member_id = '00000000-0000-0000-0000-0000000000e3';
update public.task_assignees ta set completed_at = t.due_at + interval '1 day'
  from public.tasks t where t.id = ta.task_id and ta.task_id = '00000000-0000-0000-0000-00000000b002' and ta.member_id = '00000000-0000-0000-0000-0000000000e3';

select throws_like(
  $$insert into public.task_assignees (task_id, member_id) values
    ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000f2')$$, '%',
  'trigger: người nhận khác CLB với task bị chặn');
select throws_like(
  $$insert into public.tasks (club_id, title, due_at) values
    ('00000000-0000-0000-0000-0000000000c1', '   ', now())$$, '%',
  'tasks.title chỉ có khoảng trắng bị chặn (check)');
select throws_like(
  $$insert into public.tasks (club_id, title, due_at) values
    ('00000000-0000-0000-0000-0000000000c1', repeat('x', 201), now())$$, '%',
  'tasks.title dài hơn 200 ký tự bị chặn (check)');
select throws_like(
  $$insert into public.tasks (club_id, title, due_at, status) values
    ('00000000-0000-0000-0000-0000000000c1', 'Sai status', now(), 'abc')$$, '%',
  'tasks.status ngoài open/closed bị chặn (check)');
select throws_like(
  $$update public.task_assignees set status = 'abc' where task_id = '00000000-0000-0000-0000-00000000a001'$$, '%',
  'task_assignees.status ngoài pending/done/missed bị chặn (check)');

-- ===========================================================================
-- 1. RLS đọc
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a3'); -- member 1 (e3)
select is((select count(*) from public.tasks where id = '00000000-0000-0000-0000-00000000a001')::int, 1, 'member thấy việc được giao cho mình');
select is((select count(*) from public.tasks where id = '00000000-0000-0000-0000-00000000a003')::int, 1, 'member thấy cả việc đã đóng được giao cho mình');
select is((select count(*) from public.tasks where id = '00000000-0000-0000-0000-00000000a002')::int, 0, 'member KHÔNG thấy việc chỉ giao cho người khác');
select is((select count(*) from public.tasks where id = '00000000-0000-0000-0000-00000000a006')::int, 0, 'member KHÔNG thấy việc của người khác (a006)');
select is((select count(*) from public.tasks where club_id = '00000000-0000-0000-0000-0000000000c2')::int, 0, 'member KHÔNG thấy việc của CLB khác');
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a001')::int, 1, 'member chỉ thấy 1 dòng người nhận trong việc có 2 người');
select is((select count(*) from public.task_assignees where member_id <> '00000000-0000-0000-0000-0000000000e3')::int, 0, 'member KHÔNG thấy dòng người nhận của người khác');
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a002')::int, 0, 'member KHÔNG thấy người nhận của việc không liên quan');

reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000a5'); -- member không có việc nào (e8)
select is((select count(*) from public.tasks)::int, 0, 'member chưa có việc nào thì thấy 0 tasks');
select is((select count(*) from public.task_assignees)::int, 0, 'member chưa có việc nào thì thấy 0 task_assignees');

reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000b2'); -- member CLB B (f2)
select is((select count(*) from public.tasks)::int, 1, 'member CLB B chỉ thấy việc CLB B của mình');
select is((select count(*) from public.tasks where club_id = '00000000-0000-0000-0000-0000000000c1')::int, 0, 'member CLB B KHÔNG thấy việc CLB A');

reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A (e2)
select is((select count(*) from public.tasks where club_id = '00000000-0000-0000-0000-0000000000c1')::int, 12, 'admin CLB A thấy mọi việc của CLB A (12)');
select is((select count(*) from public.tasks where club_id = '00000000-0000-0000-0000-0000000000c2')::int, 0, 'admin CLB A KHÔNG thấy việc CLB B');
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a001')::int, 2, 'admin thấy mọi người nhận của việc');
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a005')::int, 0, 'admin CLB A KHÔNG thấy người nhận của việc CLB B');

reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000b1'); -- owner B
select is((select count(*) from public.tasks where club_id = '00000000-0000-0000-0000-0000000000c1')::int, 0, 'admin CLB B KHÔNG thấy việc CLB A');
select is((select count(*) from public.tasks)::int, 1, 'owner CLB B thấy việc của CLB B');

-- ===========================================================================
-- 2. Member không ghi trực tiếp được (lỗi hoặc 0 dòng, nhưng dữ liệu không đổi)
-- ===========================================================================
reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000a3'); -- member 1
do $$ begin
  update public.task_assignees set status = 'done', note = 'tự sửa' where task_id = '00000000-0000-0000-0000-00000000a001' and member_id = '00000000-0000-0000-0000-0000000000e3';
exception when others then null; end $$;
do $$ begin
  update public.task_assignees set status = 'done' where task_id = '00000000-0000-0000-0000-00000000a004' and member_id = '00000000-0000-0000-0000-0000000000e3';
exception when others then null; end $$;
do $$ begin
  update public.tasks set title = 'Bị member sửa', status = 'closed' where id = '00000000-0000-0000-0000-00000000a001';
exception when others then null; end $$;
do $$ begin
  insert into public.tasks (club_id, title, due_at) values ('00000000-0000-0000-0000-0000000000c1', 'Member chèn lậu', now());
exception when others then null; end $$;
do $$ begin
  insert into public.task_assignees (task_id, member_id) values ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000e3');
exception when others then null; end $$;
do $$ begin
  delete from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a001';
exception when others then null; end $$;
do $$ begin
  delete from public.tasks where id = '00000000-0000-0000-0000-00000000a001';
exception when others then null; end $$;

reset role;
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a001' and member_id = '00000000-0000-0000-0000-0000000000e3'), 'pending', 'member KHÔNG tự đổi được task_assignees.status');
select is((select note from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a001' and member_id = '00000000-0000-0000-0000-0000000000e3'), null, 'member KHÔNG tự ghi được task_assignees.note');
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a004' and member_id = '00000000-0000-0000-0000-0000000000e3'), 'missed', 'member KHÔNG gỡ được trạng thái missed bằng update trực tiếp');
select is((select title from public.tasks where id = '00000000-0000-0000-0000-00000000a001'), 'Task chính', 'member KHÔNG sửa được tasks');
select is((select status from public.tasks where id = '00000000-0000-0000-0000-00000000a001'), 'open', 'member KHÔNG đóng được task');
select is((select count(*) from public.tasks where title = 'Member chèn lậu')::int, 0, 'member KHÔNG insert được tasks');
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a002' and member_id = '00000000-0000-0000-0000-0000000000e3')::int, 0, 'member KHÔNG insert được task_assignees');
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a001')::int, 2, 'member KHÔNG xóa được task_assignees');
select is((select count(*) from public.tasks where id = '00000000-0000-0000-0000-00000000a001')::int, 1, 'member KHÔNG xóa được tasks');

-- admin CLB khác cũng không ghi được vào việc của CLB A
select public.tap_as('00000000-0000-0000-0000-0000000000b1'); -- owner B
do $$ begin
  update public.tasks set title = 'Bị CLB B sửa' where id = '00000000-0000-0000-0000-00000000a001';
exception when others then null; end $$;
do $$ begin
  update public.task_assignees set status = 'done' where task_id = '00000000-0000-0000-0000-00000000a001';
exception when others then null; end $$;
do $$ begin
  delete from public.tasks where id = '00000000-0000-0000-0000-00000000a001';
exception when others then null; end $$;
do $$ begin
  insert into public.task_assignees (task_id, member_id) values ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000e3');
exception when others then null; end $$;
reset role;
select is((select title from public.tasks where id = '00000000-0000-0000-0000-00000000a001'), 'Task chính', 'admin CLB khác KHÔNG sửa được tasks');
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a001' and status = 'pending')::int, 2, 'admin CLB khác KHÔNG đổi được trạng thái người nhận');
select is((select count(*) from public.tasks where id = '00000000-0000-0000-0000-00000000a001')::int, 1, 'admin CLB khác KHÔNG xóa được tasks');
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a002' and member_id = '00000000-0000-0000-0000-0000000000e3')::int, 0, 'admin CLB khác KHÔNG thêm được người nhận vào việc CLB A');

-- ===========================================================================
-- 3. Admin ghi trực tiếp: được status/note, không được cột còn lại
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select lives_ok(
  $$update public.task_assignees set status = 'done', note = 'Ban chủ chốt xác nhận' where task_id = '00000000-0000-0000-0000-00000000a006' and member_id = '00000000-0000-0000-0000-0000000000e4'$$,
  'admin update được task_assignees.status và note');
reset role;
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a006' and member_id = '00000000-0000-0000-0000-0000000000e4'), 'done', 'admin đổi status thành công');
select is((select note from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a006' and member_id = '00000000-0000-0000-0000-0000000000e4'), 'Ban chủ chốt xác nhận', 'admin ghi note thành công');
select isnt((select completed_at from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a006' and member_id = '00000000-0000-0000-0000-0000000000e4'), null, 'admin đổi sang done: trigger đặt completed_at');

select public.tap_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$update public.task_assignees set status = 'missed' where task_id = '00000000-0000-0000-0000-00000000a006' and member_id = '00000000-0000-0000-0000-0000000000e4'$$,
  'admin đổi done -> missed');
reset role;
select is((select completed_at from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a006' and member_id = '00000000-0000-0000-0000-0000000000e4'), null, 'admin đổi sang missed: trigger xóa completed_at');

select public.tap_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$update public.task_assignees set reminded_before_at = now() where task_id = '00000000-0000-0000-0000-00000000a006'$$,
  '42501', null, 'admin KHÔNG ghi được reminded_before_at');
select throws_ok(
  $$update public.task_assignees set reminded_overdue_at = now() where task_id = '00000000-0000-0000-0000-00000000a006'$$,
  '42501', null, 'admin KHÔNG ghi được reminded_overdue_at');
select throws_ok(
  $$update public.task_assignees set completed_at = now() where task_id = '00000000-0000-0000-0000-00000000a006'$$,
  '42501', null, 'admin KHÔNG ghi trực tiếp được completed_at');
select throws_ok(
  $$update public.task_assignees set member_id = '00000000-0000-0000-0000-0000000000e3' where task_id = '00000000-0000-0000-0000-00000000a006'$$,
  '42501', null, 'admin KHÔNG đổi được member_id của người nhận');
select throws_ok(
  $$update public.tasks set club_id = '00000000-0000-0000-0000-0000000000c2' where id = '00000000-0000-0000-0000-00000000a006'$$,
  '42501', null, 'admin KHÔNG đổi được tasks.club_id');
select throws_ok(
  $$update public.tasks set created_by = null where id = '00000000-0000-0000-0000-00000000a006'$$,
  '42501', null, 'admin KHÔNG đổi được tasks.created_by');
select lives_ok(
  $$update public.tasks set title = 'Tên mới', description = 'Mô tả mới', due_at = now() + interval '11 days', status = 'closed' where id = '00000000-0000-0000-0000-00000000a006'$$,
  'admin update được tasks.title/description/due_at/status');
reset role;
select is((select title from public.tasks where id = '00000000-0000-0000-0000-00000000a006'), 'Tên mới', 'admin đổi title thành công');
select is((select status from public.tasks where id = '00000000-0000-0000-0000-00000000a006'), 'closed', 'admin đóng việc thành công');

-- Admin thêm / xóa người nhận trực tiếp
select public.tap_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$insert into public.task_assignees (task_id, member_id) values ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000e6')$$,
  'admin thêm được người nhận');
select lives_ok(
  $$delete from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a002' and member_id = '00000000-0000-0000-0000-0000000000e6'$$,
  'admin xóa được người nhận');
reset role;
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a002')::int, 1, 'sau thêm rồi xóa, việc a002 còn 1 người nhận');

-- ===========================================================================
-- 4. Xóa task thì cascade người nhận
-- ===========================================================================
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a007')::int, 2, 'trước khi xóa: a007 có 2 người nhận');
select public.tap_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$delete from public.tasks where id = '00000000-0000-0000-0000-00000000a007'$$,
  'admin xóa được task');
reset role;
select is((select count(*) from public.tasks where id = '00000000-0000-0000-0000-00000000a007')::int, 0, 'task đã bị xóa');
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a007')::int, 0, 'xóa task thì người nhận bị xóa theo (cascade)');

-- ===========================================================================
-- 5. create_task
-- ===========================================================================
-- 5a. Bị chặn
select public.tap_as('00000000-0000-0000-0000-0000000000a3'); -- member
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Member tạo', null, now() + interval '1 day', array['00000000-0000-0000-0000-0000000000e4']::uuid[], null)$$, '%',
  'create_task: member thường bị chặn');
reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000b1'); -- owner CLB B
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Admin CLB khác tạo', null, now() + interval '1 day', array['00000000-0000-0000-0000-0000000000e4']::uuid[], null)$$, '%',
  'create_task: admin của CLB khác bị chặn');
reset role;

select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Người nhận CLB khác', null, now() + interval '1 day', array['00000000-0000-0000-0000-0000000000f2']::uuid[], null)$$, '%',
  'create_task: người nhận thuộc CLB khác bị lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Lẫn người CLB khác', null, now() + interval '1 day', array['00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f2']::uuid[], null)$$, '%',
  'create_task: danh sách có một người CLB khác thì cả lệnh lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Người nhận ngừng hoạt động', null, now() + interval '1 day', array['00000000-0000-0000-0000-0000000000e7']::uuid[], null)$$, '%',
  'create_task: người nhận đã ngừng hoạt động bị lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Id không tồn tại', null, now() + interval '1 day', array['00000000-0000-0000-0000-00000000dead']::uuid[], null)$$, '%',
  'create_task: member id không tồn tại bị lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Không người nhận', null, now() + interval '1 day', array[]::uuid[], null)$$, '%',
  'create_task: mảng người nhận rỗng và không có ban thì lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Null người nhận', null, now() + interval '1 day', null, null)$$, '%',
  'create_task: p_member_ids null và không có ban thì lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Ban trống', null, now() + interval '1 day', array[]::uuid[], '00000000-0000-0000-0000-0000000000d2')$$, '%',
  'create_task: ban không có thành viên nào thì không có người nhận => lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Ban của CLB khác', null, now() + interval '1 day', array[]::uuid[], '00000000-0000-0000-0000-0000000000d3')$$, '%',
  'create_task: ban của CLB khác thì không tạo được');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', '   ', null, now() + interval '1 day', array['00000000-0000-0000-0000-0000000000e4']::uuid[], null)$$, '%',
  'create_task: tiêu đề rỗng bị lỗi');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Hạn quá khứ', null, now() - interval '1 day', array['00000000-0000-0000-0000-0000000000e4']::uuid[], null)$$, '%Hạn chót phải ở tương lai%',
  'create_task: p_due_at trong quá khứ bị lỗi "Hạn chót phải ở tương lai"');
select throws_like(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Hạn đúng bây giờ', null, now(), array['00000000-0000-0000-0000-0000000000e4']::uuid[], null)$$, '%Hạn chót phải ở tương lai%',
  'create_task: p_due_at = now() bị lỗi "Hạn chót phải ở tương lai"');
reset role;
select is((select count(*) from public.tasks where title in ('Member tạo', 'Admin CLB khác tạo', 'Người nhận CLB khác', 'Lẫn người CLB khác', 'Người nhận ngừng hoạt động', 'Id không tồn tại', 'Không người nhận', 'Null người nhận', 'Ban trống', 'Ban của CLB khác', 'Hạn quá khứ', 'Hạn đúng bây giờ'))::int, 0,
  'các lần create_task lỗi không để lại task nào');

-- 5b. Thành công
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select lives_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Giao theo ban', 'Mô tả việc', now() + interval '3 days', array[]::uuid[], '00000000-0000-0000-0000-0000000000d1')$$,
  'create_task: admin giao theo ban (p_team_id)');
select lives_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Giao lẻ + ban', null, now() + interval '3 days', array['00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e5']::uuid[], '00000000-0000-0000-0000-0000000000d1')$$,
  'create_task: người nhận lẻ trùng một phần với ban (không lỗi trùng khóa)');
select lives_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Giao lẻ', null, now() + interval '3 days', array['00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4']::uuid[], null)$$,
  'create_task: giao cho danh sách thành viên');
select isnt(
  public.create_task('00000000-0000-0000-0000-0000000000c1', 'Trả về id', null, now() + interval '3 days', array['00000000-0000-0000-0000-0000000000e4']::uuid[], null),
  null, 'create_task trả về id');
reset role;

select results_eq(
  $$select ta.member_id from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Giao theo ban' order by ta.member_id$$,
  $$values ('00000000-0000-0000-0000-0000000000e5'::uuid), ('00000000-0000-0000-0000-0000000000e6'::uuid)$$,
  'giao theo ban: chỉ thêm thành viên đang hoạt động của ban (e5, e6), KHÔNG thêm e7 đã ngừng hoạt động');
select is((select count(*) from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Giao theo ban' and ta.member_id = '00000000-0000-0000-0000-0000000000e7')::int, 0, 'giao theo ban: người ngừng hoạt động không được thêm');
select results_eq(
  $$select ta.member_id from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Giao lẻ + ban' order by ta.member_id$$,
  $$values ('00000000-0000-0000-0000-0000000000e3'::uuid), ('00000000-0000-0000-0000-0000000000e5'::uuid), ('00000000-0000-0000-0000-0000000000e6'::uuid)$$,
  'giao lẻ + ban: hợp của hai nguồn, không trùng');
select results_eq(
  $$select ta.member_id from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Giao lẻ' order by ta.member_id$$,
  $$values ('00000000-0000-0000-0000-0000000000e3'::uuid), ('00000000-0000-0000-0000-0000000000e4'::uuid)$$,
  'giao lẻ: đúng danh sách');
select is((select count(*) from public.task_assignees ta join public.tasks t on t.id = ta.task_id where t.title = 'Giao theo ban' and ta.status = 'pending')::int, 2, 'người nhận mới có status pending');
select is((select created_by from public.tasks where title = 'Giao theo ban'), '00000000-0000-0000-0000-0000000000e2'::uuid, 'created_by = dòng club_members của người gọi (admin e2)');
select is((select status from public.tasks where title = 'Giao theo ban'), 'open', 'task mới có status open');
select is((select club_id from public.tasks where title = 'Giao theo ban'), '00000000-0000-0000-0000-0000000000c1'::uuid, 'task mới thuộc đúng CLB');
select is((select description from public.tasks where title = 'Giao theo ban'), 'Mô tả việc', 'description được lưu');

select public.tap_as('00000000-0000-0000-0000-0000000000a1'); -- owner A cũng tạo được
select lives_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Owner tạo', null, now() + interval '2 days', array['00000000-0000-0000-0000-0000000000e4']::uuid[], null)$$,
  'create_task: owner tạo được');
reset role;
select is((select created_by from public.tasks where title = 'Owner tạo'), '00000000-0000-0000-0000-0000000000e1'::uuid, 'created_by = owner e1');

-- ===========================================================================
-- 6. set_my_task_done
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a3'); -- member 1 (e3)
select lives_ok(
  $$select public.set_my_task_done('00000000-0000-0000-0000-00000000a001', true)$$,
  'set_my_task_done(true): người nhận đánh dấu xong');
reset role;
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a001' and member_id = '00000000-0000-0000-0000-0000000000e3'), 'done', 'status -> done');
select isnt((select completed_at from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a001' and member_id = '00000000-0000-0000-0000-0000000000e3'), null, 'completed_at được đặt bởi trigger');
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a001' and member_id = '00000000-0000-0000-0000-0000000000e5'), 'pending', 'dòng của người khác (e5) KHÔNG bị đổi');

select public.tap_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(
  $$select public.set_my_task_done('00000000-0000-0000-0000-00000000a001', false)$$,
  'set_my_task_done(false): bỏ đánh dấu');
reset role;
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a001' and member_id = '00000000-0000-0000-0000-0000000000e3'), 'pending', 'status -> pending');
select is((select completed_at from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a001' and member_id = '00000000-0000-0000-0000-0000000000e3'), null, 'completed_at về null');

select public.tap_as('00000000-0000-0000-0000-0000000000a3');
select throws_like(
  $$select public.set_my_task_done('00000000-0000-0000-0000-00000000a003', true)$$, '%',
  'set_my_task_done: task đã đóng thì lỗi');
select throws_like(
  $$select public.set_my_task_done('00000000-0000-0000-0000-00000000a004', true)$$, '%đã bị đánh dấu chưa hoàn thành%',
  'set_my_task_done: dòng missed thì lỗi với thông báo "đã bị đánh dấu chưa hoàn thành"');
select throws_like(
  $$select public.set_my_task_done('00000000-0000-0000-0000-00000000a004', false)$$, '%đã bị đánh dấu chưa hoàn thành%',
  'set_my_task_done(false): dòng missed cũng không đổi được');
select throws_like(
  $$select public.set_my_task_done('00000000-0000-0000-0000-00000000a002', true)$$, '%',
  'set_my_task_done: không phải người nhận của task thì lỗi');
select throws_like(
  $$select public.set_my_task_done('00000000-0000-0000-0000-00000000dead', true)$$, '%',
  'set_my_task_done: task không tồn tại thì lỗi');
reset role;
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a003' and member_id = '00000000-0000-0000-0000-0000000000e3'), 'pending', 'task đóng: trạng thái không đổi');
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a004' and member_id = '00000000-0000-0000-0000-0000000000e3'), 'missed', 'dòng missed vẫn là missed');
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a002' and member_id = '00000000-0000-0000-0000-0000000000e5'), 'pending', 'task của người khác: không đổi');

select public.tap_as('00000000-0000-0000-0000-0000000000a4'); -- member 2 (e4), không phải người nhận a001
select throws_like(
  $$select public.set_my_task_done('00000000-0000-0000-0000-00000000a001', true)$$, '%',
  'set_my_task_done: member khác (không được giao) bị lỗi');
reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000b2'); -- member CLB B
select throws_like(
  $$select public.set_my_task_done('00000000-0000-0000-0000-00000000a001', true)$$, '%',
  'set_my_task_done: member CLB khác bị lỗi');
reset role;
select is((select count(*) from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a001' and status = 'pending')::int, 2, 'a001: hai người nhận vẫn pending sau các lần gọi sai');

-- 6b. Người nhận đã ngừng hoạt động (is_active = false) không đánh dấu được
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a6', 'inactive@bit.test', 'authenticated', 'authenticated');
update public.club_members set user_id = '00000000-0000-0000-0000-0000000000a6' where id = '00000000-0000-0000-0000-0000000000e7'; -- e7 is_active = false
insert into public.tasks (id, club_id, title, due_at, status) values
  ('00000000-0000-0000-0000-00000000a008', '00000000-0000-0000-0000-0000000000c1', 'Task cho người đã nghỉ', now() + interval '10 days', 'open');
insert into public.task_assignees (task_id, member_id) values
  ('00000000-0000-0000-0000-00000000a008', '00000000-0000-0000-0000-0000000000e7');
select public.tap_as('00000000-0000-0000-0000-0000000000a6');
select throws_like(
  $$select public.set_my_task_done('00000000-0000-0000-0000-00000000a008', true)$$, '%',
  'set_my_task_done: thành viên is_active = false (vẫn là người nhận) bị lỗi');
reset role;
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a008' and member_id = '00000000-0000-0000-0000-0000000000e7'), 'pending', 'người nhận ngừng hoạt động: dòng không đổi');
update public.club_members set is_active = true where id = '00000000-0000-0000-0000-0000000000e7';
select public.tap_as('00000000-0000-0000-0000-0000000000a6');
select lives_ok(
  $$select public.set_my_task_done('00000000-0000-0000-0000-00000000a008', true)$$,
  'đối chứng: bật lại is_active thì set_my_task_done chạy được');
reset role;
select is((select status from public.task_assignees where task_id = '00000000-0000-0000-0000-00000000a008' and member_id = '00000000-0000-0000-0000-0000000000e7'), 'done', 'đối chứng: đã chuyển sang done');
update public.club_members set is_active = false where id = '00000000-0000-0000-0000-0000000000e7';

-- ===========================================================================
-- 7. club_contribution
-- ===========================================================================
-- quyền
select public.tap_as('00000000-0000-0000-0000-0000000000a3'); -- member
select throws_like(
  $$select * from public.club_contribution('00000000-0000-0000-0000-0000000000c1', now() - interval '100 days', now() - interval '50 days')$$, '%',
  'club_contribution: member bị chặn');
reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000b1'); -- owner CLB B
select throws_like(
  $$select * from public.club_contribution('00000000-0000-0000-0000-0000000000c1', now() - interval '100 days', now() - interval '50 days')$$, '%',
  'club_contribution: admin CLB khác bị chặn');
reset role;

-- số liệu cửa sổ W1 [now-100d, now-50d): K1, K2, K5 tính; K3 (ngoài), K4 (đúng p_to) bị loại
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select results_eq(
  $$select member_id, assigned, done_on_time, done_late, missed, pending
    from public.club_contribution('00000000-0000-0000-0000-0000000000c1', now() - interval '100 days', now() - interval '50 days')
    order by member_id$$,
  $$values
    ('00000000-0000-0000-0000-0000000000e1'::uuid, 1, 1, 0, 0, 0),
    ('00000000-0000-0000-0000-0000000000e2'::uuid, 1, 0, 0, 1, 0),
    ('00000000-0000-0000-0000-0000000000e3'::uuid, 2, 1, 1, 0, 0),
    ('00000000-0000-0000-0000-0000000000e4'::uuid, 2, 0, 1, 1, 0),
    ('00000000-0000-0000-0000-0000000000e5'::uuid, 2, 0, 0, 2, 0),
    ('00000000-0000-0000-0000-0000000000e6'::uuid, 1, 0, 0, 1, 0),
    ('00000000-0000-0000-0000-0000000000e7'::uuid, 0, 0, 0, 0, 0),
    ('00000000-0000-0000-0000-0000000000e8'::uuid, 0, 0, 0, 0, 0)$$,
  'club_contribution W1: đúng từng trường hợp (đúng hạn kể cả biên =, trễ, missed, pending quá hạn tính là bỏ lỡ, loại việc ngoài cửa sổ và đúng p_to, nhận đúng p_from, trả cả thành viên 0 việc)');
select is(
  (select count(*) from public.club_contribution('00000000-0000-0000-0000-0000000000c1', now() - interval '100 days', now() - interval '50 days'))::int,
  8, 'club_contribution trả mọi thành viên của CLB A (8) và không có người CLB B');
select is(
  (select count(*) from public.club_contribution('00000000-0000-0000-0000-0000000000c1', now() - interval '100 days', now() - interval '50 days')
    where assigned <> done_on_time + done_late + missed + pending)::int,
  0, 'assigned = done_on_time + done_late + missed + pending ở mọi dòng');
select results_eq(
  $$select full_name, team_id, is_active from public.club_contribution('00000000-0000-0000-0000-0000000000c1', now() - interval '100 days', now() - interval '50 days')
    where member_id in ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000e7') order by member_id$$,
  $$values ('Ban viên 1'::text, '00000000-0000-0000-0000-0000000000d1'::uuid, true), ('Ban viên nghỉ'::text, '00000000-0000-0000-0000-0000000000d1'::uuid, false)$$,
  'club_contribution trả đúng full_name, team_id, is_active');
select is(
  (select role::text from public.club_contribution('00000000-0000-0000-0000-0000000000c1', now() - interval '100 days', now() - interval '50 days') where member_id = '00000000-0000-0000-0000-0000000000e2'),
  'admin', 'club_contribution trả đúng role');

-- cửa sổ W2 [now+200d, now+300d): K6 (hạn tương lai)
select results_eq(
  $$select member_id, assigned, done_on_time, done_late, missed, pending
    from public.club_contribution('00000000-0000-0000-0000-0000000000c1', now() + interval '200 days', now() + interval '300 days')
    order by member_id$$,
  $$values
    ('00000000-0000-0000-0000-0000000000e1'::uuid, 0, 0, 0, 0, 0),
    ('00000000-0000-0000-0000-0000000000e2'::uuid, 0, 0, 0, 0, 0),
    ('00000000-0000-0000-0000-0000000000e3'::uuid, 1, 0, 0, 0, 1),
    ('00000000-0000-0000-0000-0000000000e4'::uuid, 1, 1, 0, 0, 0),
    ('00000000-0000-0000-0000-0000000000e5'::uuid, 1, 0, 0, 1, 0),
    ('00000000-0000-0000-0000-0000000000e6'::uuid, 0, 0, 0, 0, 0),
    ('00000000-0000-0000-0000-0000000000e7'::uuid, 0, 0, 0, 0, 0),
    ('00000000-0000-0000-0000-0000000000e8'::uuid, 0, 0, 0, 0, 0)$$,
  'club_contribution W2: pending chưa tới hạn là pending (không phải bỏ lỡ), done sớm là đúng hạn, missed là missed');
-- cửa sổ không có việc nào: vẫn trả mọi thành viên với 0
select is(
  (select count(*) from public.club_contribution('00000000-0000-0000-0000-0000000000c1', now() + interval '1000 days', now() + interval '1100 days') where assigned = 0)::int,
  8, 'club_contribution: cửa sổ rỗng vẫn trả 8 thành viên với assigned = 0');
reset role;

-- owner cũng gọi được
select public.tap_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$select * from public.club_contribution('00000000-0000-0000-0000-0000000000c1', now() - interval '100 days', now() - interval '50 days')$$,
  'club_contribution: owner gọi được');
reset role;

-- 7b. club_contribution với task đã đóng (closed)
-- W3 = [now-300d, now-200d): C1 closed, C2 open. W4 = [now+400d, now+500d): C3 closed chưa tới hạn.
insert into public.tasks (id, club_id, title, due_at, status) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000c1', 'C1 closed quá hạn', now() - interval '250 days', 'closed'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000c1', 'C2 open quá hạn',   now() - interval '240 days', 'open'),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000c1', 'C3 closed tương lai', now() + interval '450 days', 'closed');
insert into public.task_assignees (task_id, member_id) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000e4'),
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000e5'),
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000e6'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000e4');
-- C1: e3 pending (không đếm), e4 done đúng hạn, e5 missed, e6 done trễ
update public.task_assignees set status = 'done'
  where task_id = '00000000-0000-0000-0000-00000000c001' and member_id in ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e6');
update public.task_assignees set status = 'missed'
  where task_id = '00000000-0000-0000-0000-00000000c001' and member_id = '00000000-0000-0000-0000-0000000000e5';
update public.task_assignees ta set completed_at = t.due_at - interval '1 hour'
  from public.tasks t where t.id = ta.task_id and ta.task_id = '00000000-0000-0000-0000-00000000c001' and ta.member_id = '00000000-0000-0000-0000-0000000000e4';
update public.task_assignees ta set completed_at = t.due_at + interval '1 hour'
  from public.tasks t where t.id = ta.task_id and ta.task_id = '00000000-0000-0000-0000-00000000c001' and ta.member_id = '00000000-0000-0000-0000-0000000000e6';

select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select results_eq(
  $$select member_id, assigned, done_on_time, done_late, missed, pending
    from public.club_contribution('00000000-0000-0000-0000-0000000000c1', now() - interval '300 days', now() - interval '200 days')
    order by member_id$$,
  $$values
    ('00000000-0000-0000-0000-0000000000e1'::uuid, 0, 0, 0, 0, 0),
    ('00000000-0000-0000-0000-0000000000e2'::uuid, 0, 0, 0, 0, 0),
    ('00000000-0000-0000-0000-0000000000e3'::uuid, 1, 0, 0, 1, 0),
    ('00000000-0000-0000-0000-0000000000e4'::uuid, 1, 1, 0, 0, 0),
    ('00000000-0000-0000-0000-0000000000e5'::uuid, 1, 0, 0, 1, 0),
    ('00000000-0000-0000-0000-0000000000e6'::uuid, 1, 0, 1, 0, 0),
    ('00000000-0000-0000-0000-0000000000e7'::uuid, 0, 0, 0, 0, 0),
    ('00000000-0000-0000-0000-0000000000e8'::uuid, 0, 0, 0, 0, 0)$$,
  'club_contribution W3: pending của task closed (quá hạn) KHÔNG đếm; done và missed của task closed vẫn đếm; pending + task open + quá hạn vẫn là missed');
select results_eq(
  $$select member_id, assigned, done_on_time, done_late, missed, pending
    from public.club_contribution('00000000-0000-0000-0000-0000000000c1', now() + interval '400 days', now() + interval '500 days')
    where member_id in ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4') order by member_id$$,
  $$values
    ('00000000-0000-0000-0000-0000000000e3'::uuid, 0, 0, 0, 0, 0),
    ('00000000-0000-0000-0000-0000000000e4'::uuid, 0, 0, 0, 0, 0)$$,
  'club_contribution W4: pending của task closed chưa tới hạn cũng KHÔNG đếm (assigned = 0, pending = 0)');
reset role;

-- ===========================================================================
-- 8. clubs.mail_sender_user_id: authenticated không ghi được, service_role ghi được
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a1'); -- owner A
select throws_ok(
  $$update public.clubs set mail_sender_user_id = '00000000-0000-0000-0000-0000000000a1' where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'owner (authenticated) KHÔNG update được clubs.mail_sender_user_id');
reset role;
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select throws_ok(
  $$update public.clubs set mail_sender_user_id = '00000000-0000-0000-0000-0000000000a2' where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'admin (authenticated) KHÔNG update được clubs.mail_sender_user_id');
reset role;
select is((select mail_sender_user_id from public.clubs where id = '00000000-0000-0000-0000-0000000000c1'), null, 'mail_sender_user_id vẫn null sau các lần thử');
set local role service_role;
select lives_ok(
  $$update public.clubs set mail_sender_user_id = '00000000-0000-0000-0000-0000000000a2' where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'service_role update được clubs.mail_sender_user_id');
reset role;
select is((select mail_sender_user_id from public.clubs where id = '00000000-0000-0000-0000-0000000000c1'), '00000000-0000-0000-0000-0000000000a2'::uuid, 'mail_sender_user_id đã được service_role đặt');

-- ===========================================================================
-- 9. anon không gọi được 3 hàm
-- ===========================================================================
set local role anon;
select throws_ok(
  $$select public.create_task('00000000-0000-0000-0000-0000000000c1', 'Anon', null, now(), array['00000000-0000-0000-0000-0000000000e4']::uuid[], null)$$,
  '42501', null, 'anon không execute được create_task');
select throws_ok(
  $$select public.set_my_task_done('00000000-0000-0000-0000-00000000a001', true)$$,
  '42501', null, 'anon không execute được set_my_task_done');
select throws_ok(
  $$select * from public.club_contribution('00000000-0000-0000-0000-0000000000c1', now() - interval '100 days', now())$$,
  '42501', null, 'anon không execute được club_contribution');
reset role;
select is((select count(*) from public.tasks where title = 'Anon')::int, 0, 'anon không tạo được task');

select * from finish();
rollback;
