-- pgTAP: import_applications (import ứng viên từ Excel). Theo docs/CONTRACT.md mục 5.
-- Chạy: npx supabase test db   (cần npx supabase db reset để áp migration 20261114000000_import_applications.sql)
begin;
select plan(97);

-- ---------------------------------------------------------------------------
-- Helper / view (mất khi rollback)
-- ---------------------------------------------------------------------------
create function public.tap_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

-- Bảng nhận kết quả jsonb của các lần gọi (authenticated ghi được)
create table public.tap_res (tag text primary key, r jsonb);
grant all on public.tap_res to authenticated, anon;

-- Lần gọi "chuẩn" dùng cho camp1: 7 dòng, đủ các trường hợp. plpgsql để không phụ thuộc hàm đã tồn tại lúc tạo.
create function public.tap_main_call(p_campaign uuid) returns jsonb language plpgsql as $fn$
begin
  return public.import_applications(
    p_campaign,
    '  Form import  ',
    'Mô tả import',
    array['Tại sao bạn muốn tham gia?', 'Kỹ năng', '', '   ', 'Họ tên'],
    '[
      {"position":"Truyền thông","session":"Ca sáng","full_name":"  Nguyen A  ","email":"A@Example.COM","phone":"   ","student_code":"S1","class_name":null,
       "answers":{"Tại sao bạn muốn tham gia?":"Vì yêu thích","Kỹ năng":"Photoshop"}},
      {"position":"Truyền thông","session":"Ca sáng","full_name":"Trùng DB","email":"dup@x.com",
       "answers":{"Kỹ năng":"Không được lưu"}},
      {"position":"Kỹ thuật","session":"Ca chiều","full_name":"Bao B","email":"b@example.com","phone":"0900000001",
       "answers":{"Kỹ năng":"React","Tại sao bạn muốn tham gia?":"   ","Họ tên":""}},
      {"position":"Kỹ thuật","session":"Ca chiều","full_name":"Trùng file","email":"B@EXAMPLE.com",
       "answers":{"Kỹ năng":"Vue"}},
      {"position":"Truyền thông","full_name":"No Email 1","email":null,"answers":{}},
      {"position":"Truyền thông","full_name":"No Email 2","email":"","answers":{}},
      {"position":"Kỹ thuật","full_name":"Khác vị trí","email":"a@example.com","answers":{}}
    ]'::jsonb);
end $fn$;

create view public.tap_q as
  select p.campaign_id, p.name as pos, f.id as form_id, f.name as form_name, f.description as form_desc,
         q.id as qid, q.question_text, q.question_type::text as qtype, q.field_key, q.is_required, q.order_index
  from public.recruitment_positions p
  join public.application_forms f on f.position_id = p.id
  join public.form_questions q on q.form_id = f.id;

create view public.tap_a as
  select ap.campaign_id, ap.id as app_id, ap.full_name, ap.email, ap.position_id, f.position_id as q_position_id,
         q.form_id, q.question_text, aa.answer_text
  from public.applications ap
  join public.application_answers aa on aa.application_id = ap.id
  join public.form_questions q on q.id = aa.question_id
  join public.application_forms f on f.id = q.form_id;

-- ---------------------------------------------------------------------------
-- Dữ liệu nền (chạy bằng quyền postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@bit.test',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@bit.test',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'member@bit.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'ownerb@bit.test', 'authenticated', 'authenticated');

insert into public.clubs (id, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'CLB A'),
  ('00000000-0000-0000-0000-0000000000c2', 'CLB B');

-- e1 owner A, e2 admin A, e3 member A, f1 owner B
insert into public.club_members (id, club_id, user_id, team_id, role, full_name, is_active, student_code) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', null, 'owner',  'Owner A',  true, 'OWN1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', null, 'admin',  'Admin A',  true, 'ADM1'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3', null, 'member', 'Member 1', true, 'MEM1'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', null, 'owner',  'Owner B',  true, 'OB1');

-- ca01: đợt của CLB A (đã có dữ liệu). ca02: CLB B. ca03: owner A import. ca04: thử dữ liệu sai (phải luôn rỗng). ca05: thử biên 2000 dòng / 100 câu.
insert into public.recruitment_campaigns (id, club_id, name) values
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000c1', 'Đợt 1 CLB A'),
  ('00000000-0000-0000-0000-00000000ca02', '00000000-0000-0000-0000-0000000000c2', 'Đợt CLB B'),
  ('00000000-0000-0000-0000-00000000ca03', '00000000-0000-0000-0000-0000000000c1', 'Đợt owner import'),
  ('00000000-0000-0000-0000-00000000ca04', '00000000-0000-0000-0000-0000000000c1', 'Đợt dữ liệu sai'),
  ('00000000-0000-0000-0000-00000000ca05', '00000000-0000-0000-0000-0000000000c1', 'Đợt giới hạn');

-- camp1 có sẵn: vị trí Truyền thông (form + 2 câu hỏi + ca "Ca sáng" + 1 đơn dup@x.com), vị trí Nội dung (không form, có ca "Ca chiều")
insert into public.recruitment_positions (id, campaign_id, name) values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000ca01', 'Truyền thông'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000ca01', 'Nội dung');
insert into public.application_forms (id, position_id, name, description) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000b001', 'Form có sẵn', 'Mô tả cũ');
insert into public.form_questions (id, form_id, question_text, field_key, order_index) values
  ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000f001', 'Tại sao bạn muốn tham gia?', null, 0),
  ('00000000-0000-0000-0000-00000000e102', '00000000-0000-0000-0000-00000000f001', 'Họ tên', 'full_name', 1);
insert into public.interview_sessions (id, campaign_id, position_id, round, start_time, end_time, note) values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000b001', 2, '2026-12-01 09:00:00+00', '2026-12-01 10:00:00+00', 'Ca sáng'),
  ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000b002', 1, '2026-12-02 09:00:00+00', '2026-12-02 10:00:00+00', 'Ca chiều');
insert into public.applications (id, campaign_id, position_id, full_name, email) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000b001', 'Đơn có sẵn', 'dup@x.com');

-- ===========================================================================
-- 1. Quyền
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a3'); -- member thường của CLB A
select throws_like(
  $$select public.tap_main_call('00000000-0000-0000-0000-00000000ca01')$$, '%',
  'quyền: member thường bị chặn');
reset role;

select public.tap_as('00000000-0000-0000-0000-0000000000b1'); -- owner CLB B
select throws_like(
  $$select public.tap_main_call('00000000-0000-0000-0000-00000000ca01')$$, '%',
  'quyền: admin/owner của CLB khác bị chặn');
reset role;

select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select throws_like(
  $$select public.tap_main_call('00000000-0000-0000-0000-00000000ca02')$$, '%',
  'quyền: admin CLB A không import vào đợt của CLB B');
select throws_like(
  $$select public.tap_main_call('00000000-0000-0000-0000-00000000dead')$$, '%',
  'quyền: đợt tuyển không tồn tại bị lỗi');
reset role;

set local role anon;
select throws_ok(
  $$select public.import_applications('00000000-0000-0000-0000-00000000ca01', null, null, array[]::text[], '[]'::jsonb)$$,
  '42501', null, 'quyền: anon không execute được import_applications');
reset role;

select is((select count(*) from public.recruitment_positions where campaign_id in ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000ca02'))::int, 2,
  'quyền: các lần bị chặn không tạo vị trí nào (vẫn 2 vị trí có sẵn của camp1)');
select is((select count(*) from public.applications where campaign_id in ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000ca02'))::int, 1,
  'quyền: các lần bị chặn không tạo đơn nào (vẫn 1 đơn có sẵn)');

-- ===========================================================================
-- 2. Lần import đầu vào camp1 (admin A): tạo mới + dùng lại
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select lives_ok(
  $$insert into public.tap_res select 'run1', public.tap_main_call('00000000-0000-0000-0000-00000000ca01')$$,
  'admin CLB A import được vào đợt của CLB mình');
reset role;

-- 2a. jsonb trả về
select is((select r from public.tap_res where tag = 'run1'),
  '{"imported":5,"skipped_duplicates":2,"positions_created":1,"forms_created":1,"sessions_created":1}'::jsonb,
  'jsonb: đúng số đếm (5 nhập, 2 trùng, 1 vị trí, 1 form, 1 ca mới)');
select is((select array(select k from jsonb_object_keys(r) k order by k) from public.tap_res where tag = 'run1'),
  array['forms_created', 'imported', 'positions_created', 'sessions_created', 'skipped_duplicates'],
  'jsonb: đúng 5 khóa, không thừa không thiếu');

-- 2b. Vị trí
select is((select count(*) from public.recruitment_positions where campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 3,
  'vị trí: camp1 có 3 vị trí (Truyền thông, Nội dung có sẵn + Kỹ thuật mới)');
select is((select count(*) from public.recruitment_positions where campaign_id = '00000000-0000-0000-0000-00000000ca01' and name = 'Truyền thông')::int, 1,
  'vị trí: dùng lại "Truyền thông" có sẵn, không tạo trùng');
select is((select id from public.recruitment_positions where campaign_id = '00000000-0000-0000-0000-00000000ca01' and name = 'Truyền thông'),
  '00000000-0000-0000-0000-00000000b001'::uuid, 'vị trí: "Truyền thông" vẫn là dòng cũ (cùng id)');
select is((select count(*) from public.recruitment_positions where campaign_id = '00000000-0000-0000-0000-00000000ca01' and name = 'Kỹ thuật' and team_id is null)::int, 1,
  'vị trí: tạo mới "Kỹ thuật" với team_id null');

-- 2c. Form
select is((select count(*) from public.application_forms f join public.recruitment_positions p on p.id = f.position_id where p.campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 2,
  'form: camp1 có 2 form (Truyền thông có sẵn + Kỹ thuật mới; Nội dung không có)');
select results_eq(
  $$select form_name, form_desc from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca01' and pos = 'Kỹ thuật' limit 1$$,
  $$values ('Form import'::text, 'Mô tả import'::text)$$,
  'form: form mới có tên đã trim và mô tả theo tham số');
select results_eq(
  $$select form_name, form_desc from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca01' and pos = 'Truyền thông' limit 1$$,
  $$values ('Form có sẵn'::text, 'Mô tả cũ'::text)$$,
  'form: form có sẵn của Truyền thông giữ nguyên tên/mô tả');

-- 2d. Câu hỏi
select results_eq(
  $$select question_text from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca01' and pos = 'Kỹ thuật' order by order_index$$,
  $$values ('Tại sao bạn muốn tham gia?'::text), ('Kỹ năng'::text), ('Họ tên'::text)$$,
  'câu hỏi: form mới có 3 câu theo thứ tự p_questions, bỏ phần tử rỗng/khoảng trắng');
select is((select count(*) from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca01' and pos = 'Kỹ thuật'
             and qtype = 'text' and not is_required and field_key is null)::int, 3,
  'câu hỏi: câu mới là text, không bắt buộc, field_key null');
select is((select count(*) from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca01' and pos = 'Truyền thông')::int, 4,
  'câu hỏi: form Truyền thông có 4 câu (2 có sẵn + "Kỹ năng" + "Họ tên" field_key null)');
select is((select count(*) from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca01' and pos = 'Truyền thông' and question_text = 'Tại sao bạn muốn tham gia?')::int, 1,
  'câu hỏi: dùng lại câu "Tại sao..." có sẵn, không tạo trùng');
select is((select qid from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca01' and pos = 'Truyền thông' and question_text = 'Tại sao bạn muốn tham gia?'),
  '00000000-0000-0000-0000-00000000e101'::uuid, 'câu hỏi: câu "Tại sao..." vẫn là dòng cũ (cùng id)');
select is((select count(*) from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca01' and pos = 'Truyền thông' and question_text = 'Họ tên' and field_key = 'full_name')::int, 1,
  'câu hỏi: câu "Họ tên" có field_key giữ nguyên');
select is((select count(*) from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca01' and pos = 'Truyền thông' and question_text = 'Họ tên' and field_key is null)::int, 1,
  'câu hỏi: câu "Họ tên" riêng (field_key null) được thêm, không dùng nhầm câu field_key');
select is((select count(*) from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca01' and pos = 'Truyền thông' and question_text = 'Kỹ năng' and order_index > 1)::int, 1,
  'câu hỏi: câu mới của form có sẵn được nối tiếp order_index (> 1)');
select is((select count(*) from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca01' and btrim(question_text) = '')::int, 0,
  'câu hỏi: không có câu rỗng');

-- 2e. Ca phỏng vấn
select is((select count(*) from public.interview_sessions where campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 3,
  'ca: camp1 có 3 ca (2 có sẵn + 1 mới)');
select is((select count(*) from public.interview_sessions where campaign_id = '00000000-0000-0000-0000-00000000ca01'
             and position_id = '00000000-0000-0000-0000-00000000b001' and note = 'Ca sáng')::int, 1,
  'ca: dùng lại "Ca sáng" của Truyền thông, không tạo trùng');
select is((select start_time from public.interview_sessions where id = '00000000-0000-0000-0000-000000005001'), '2026-12-01 09:00:00+00'::timestamptz,
  'ca: ca có sẵn không bị sửa giờ');
select is((select round from public.interview_sessions where id = '00000000-0000-0000-0000-000000005001'), 2,
  'ca: ca có sẵn không bị sửa round');
select is((select count(*) from public.interview_sessions s join public.recruitment_positions p on p.id = s.position_id
             where s.campaign_id = '00000000-0000-0000-0000-00000000ca01' and p.name = 'Kỹ thuật' and s.note = 'Ca chiều')::int, 1,
  'ca: "Ca chiều" của Kỹ thuật được tạo mới dù vị trí Nội dung đã có ca cùng tên (tìm theo vị trí)');
select is((select count(*) from public.interview_sessions where id = '00000000-0000-0000-0000-000000005002' and note = 'Ca chiều')::int, 1,
  'ca: "Ca chiều" của Nội dung giữ nguyên');
select results_eq(
  $$select s.round, s.end_time - s.start_time from public.interview_sessions s join public.recruitment_positions p on p.id = s.position_id
    where s.campaign_id = '00000000-0000-0000-0000-00000000ca01' and p.name = 'Kỹ thuật' and s.note = 'Ca chiều'$$,
  $$values (1, interval '1 hour')$$,
  'ca: ca mới là round 1, dài 1 giờ');

-- 2f. Đơn
select is((select count(*) from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 6,
  'đơn: camp1 có 6 đơn (1 có sẵn + 5 nhập)');
select is((select count(*) from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and email = 'dup@x.com')::int, 1,
  'đơn: email đã có trong DB (cùng vị trí) bị bỏ qua');
select is((select count(*) from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and full_name = 'Trùng DB')::int, 0,
  'đơn: dòng trùng DB không để lại đơn');
select is((select count(*) from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and email = 'b@example.com')::int, 1,
  'đơn: email lặp trong file (khác hoa/thường) chỉ giữ 1 đơn');
select is((select full_name from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and email = 'b@example.com'), 'Bao B',
  'đơn: giữ dòng đầu tiên của cặp trùng trong file');
select is((select count(*) from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and full_name = 'Trùng file')::int, 0,
  'đơn: dòng lặp trong file không để lại đơn');
select is((select count(*) from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and email = 'a@example.com')::int, 2,
  'đơn: cùng email ở hai vị trí khác nhau đều được nhập');
select is((select count(*) from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and email <> lower(email))::int, 0,
  'đơn: email luôn viết thường');
select is((select email from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and full_name = 'Nguyen A'), 'a@example.com',
  'đơn: email "A@Example.COM" thành "a@example.com"');
select is((select count(*) from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and full_name like 'No Email%')::int, 2,
  'đơn: hai đơn không email đều được nhập (không coi là trùng)');
select is((select count(*) from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and email = '')::int, 0,
  'đơn: email chuỗi rỗng thành null');
select is((select email from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and full_name = 'No Email 2'), null,
  'đơn: "No Email 2" có email null');
select results_eq(
  $$select full_name, phone, student_code, class_name from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and email = 'a@example.com' and position_id = '00000000-0000-0000-0000-00000000b001'$$,
  $$values ('Nguyen A'::text, null::text, 'S1'::text, null::text)$$,
  'đơn: họ tên được trim; phone toàn khoảng trắng thành null; student_code giữ; class_name null');
select is((select position_id from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and email = 'b@example.com'),
  (select id from public.recruitment_positions where campaign_id = '00000000-0000-0000-0000-00000000ca01' and name = 'Kỹ thuật'),
  'đơn: đơn "Bao B" gắn vào vị trí Kỹ thuật vừa tạo');
select is((select count(*) from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01' and id <> '00000000-0000-0000-0000-000000000a01' and status <> 'submitted')::int, 0,
  'đơn: đơn nhập có status mặc định (submitted)');

-- 2g. Câu trả lời
select is((select count(*) from public.tap_a where campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 3,
  'câu trả lời: tổng 3 (2 của Nguyen A + 1 của Bao B); giá trị rỗng/khoảng trắng không tạo câu trả lời');
select results_eq(
  $$select question_text, answer_text from public.tap_a where campaign_id = '00000000-0000-0000-0000-00000000ca01' and full_name = 'Nguyen A' order by question_text$$,
  $$values ('Kỹ năng'::text, 'Photoshop'::text), ('Tại sao bạn muốn tham gia?'::text, 'Vì yêu thích'::text)$$,
  'câu trả lời: Nguyen A đúng câu hỏi, đúng nội dung');
select is((select count(*) from public.tap_a where campaign_id = '00000000-0000-0000-0000-00000000ca01' and full_name = 'Nguyen A' and form_id = '00000000-0000-0000-0000-00000000f001')::int, 2,
  'câu trả lời: Nguyen A gắn vào câu hỏi của form Truyền thông');
select results_eq(
  $$select question_text, answer_text from public.tap_a where campaign_id = '00000000-0000-0000-0000-00000000ca01' and full_name = 'Bao B'$$,
  $$values ('Kỹ năng'::text, 'React'::text)$$,
  'câu trả lời: Bao B chỉ có "Kỹ năng"=React (hai giá trị rỗng không tạo câu trả lời)');
select is((select count(*) from public.tap_a where campaign_id = '00000000-0000-0000-0000-00000000ca01' and full_name = 'Bao B' and form_id <> '00000000-0000-0000-0000-00000000f001')::int, 1,
  'câu trả lời: Bao B gắn vào câu hỏi của form Kỹ thuật, không phải form Truyền thông');
select is((select count(*) from public.tap_a where campaign_id = '00000000-0000-0000-0000-00000000ca01' and position_id <> q_position_id)::int, 0,
  'câu trả lời: mọi câu trả lời thuộc câu hỏi của form đúng vị trí của đơn');
select is((select count(*) from public.tap_a where campaign_id = '00000000-0000-0000-0000-00000000ca01' and (answer_text is null or btrim(answer_text) = ''))::int, 0,
  'câu trả lời: không có câu trả lời rỗng/null');
select is((select count(*) from public.tap_a where campaign_id = '00000000-0000-0000-0000-00000000ca01' and answer_text in ('Không được lưu', 'Vue'))::int, 0,
  'câu trả lời: dòng bị bỏ qua vì trùng không lưu câu trả lời');

-- 2h. Phân ca
select is((select count(*) from public.interview_assignments ia join public.interview_sessions s on s.id = ia.session_id where s.campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 2,
  'phân ca: camp1 có 2 assignment (chỉ dòng có session và không bị bỏ qua)');
select is((select ia.session_id from public.interview_assignments ia join public.applications a on a.id = ia.application_id
             where a.campaign_id = '00000000-0000-0000-0000-00000000ca01' and a.full_name = 'Nguyen A'),
  '00000000-0000-0000-0000-000000005001'::uuid, 'phân ca: Nguyen A vào ca "Ca sáng" có sẵn');
select is((select s.note || '/' || p.name from public.interview_assignments ia
             join public.applications a on a.id = ia.application_id
             join public.interview_sessions s on s.id = ia.session_id
             join public.recruitment_positions p on p.id = s.position_id
             where a.campaign_id = '00000000-0000-0000-0000-00000000ca01' and a.full_name = 'Bao B'),
  'Ca chiều/Kỹ thuật', 'phân ca: Bao B vào ca "Ca chiều" của Kỹ thuật (không phải của Nội dung)');
select is((select ia.status::text from public.interview_assignments ia join public.applications a on a.id = ia.application_id
             where a.campaign_id = '00000000-0000-0000-0000-00000000ca01' and a.full_name = 'Nguyen A'),
  'scheduled', 'phân ca: assignment mới có status mặc định (scheduled)');
select is((select count(*) from public.interview_assignments ia join public.applications a on a.id = ia.application_id
             where a.campaign_id = '00000000-0000-0000-0000-00000000ca01' and (a.full_name like 'No Email%' or a.full_name = 'Khác vị trí'))::int, 0,
  'phân ca: dòng không có session thì không có assignment');

-- ===========================================================================
-- 3. Import lại cùng file: dùng lại mọi thứ, chỉ đơn không email được thêm
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$insert into public.tap_res select 'run2', public.tap_main_call('00000000-0000-0000-0000-00000000ca01')$$,
  'import lần 2 cùng file chạy được');
reset role;
select is((select r from public.tap_res where tag = 'run2'),
  '{"imported":2,"skipped_duplicates":5,"positions_created":0,"forms_created":0,"sessions_created":0}'::jsonb,
  'lần 2: 5 đơn có email bị bỏ qua, 2 đơn không email vẫn nhập, không tạo mới vị trí/form/ca');
select is((select count(*) from public.recruitment_positions where campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 3, 'lần 2: vẫn 3 vị trí');
select is((select count(*) from public.application_forms f join public.recruitment_positions p on p.id = f.position_id where p.campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 2, 'lần 2: vẫn 2 form');
select is((select count(*) from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 7, 'lần 2: vẫn 7 câu hỏi (4 + 3), không thêm trùng');
select is((select count(*) from public.interview_sessions where campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 3, 'lần 2: vẫn 3 ca');
select is((select count(*) from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 8, 'lần 2: 8 đơn (6 + 2 đơn không email)');
select is((select count(*) from public.tap_a where campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 3, 'lần 2: vẫn 3 câu trả lời');
select is((select count(*) from public.interview_assignments ia join public.interview_sessions s on s.id = ia.session_id where s.campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 2, 'lần 2: vẫn 2 assignment');

-- ===========================================================================
-- 4. Owner import vào camp3: tên form mặc định, tách dữ liệu theo đợt
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a1'); -- owner A
select lives_ok(
  $$insert into public.tap_res select 'run3', public.import_applications(
      '00000000-0000-0000-0000-00000000ca03', '   ', null, array['Q1'],
      '[{"position":"Truyền thông","session":"S1","full_name":"Owner Row","email":"o@x.com","answers":{"Q1":"A1"}}]'::jsonb)$$,
  'owner của CLB import được');
reset role;
select is((select r from public.tap_res where tag = 'run3'),
  '{"imported":1,"skipped_duplicates":0,"positions_created":1,"forms_created":1,"sessions_created":1}'::jsonb,
  'camp3: vị trí cùng tên ở đợt khác vẫn được tạo mới (tìm theo đợt), form và ca cũng mới');
select is((select form_name from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca03' limit 1), 'Biểu mẫu import',
  'camp3: p_form_name rỗng thì dùng "Biểu mẫu import"');
select is((select form_desc from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca03' limit 1), null,
  'camp3: p_form_description null thì description null');
select results_eq(
  $$select question_text, answer_text from public.tap_a where campaign_id = '00000000-0000-0000-0000-00000000ca03'$$,
  $$values ('Q1'::text, 'A1'::text)$$,
  'camp3: câu trả lời đúng câu hỏi');
select is((select count(*) from public.recruitment_positions where campaign_id = '00000000-0000-0000-0000-00000000ca01')::int, 3,
  'camp3: không làm đổi vị trí của camp1');
select is((select count(*) from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca01' and question_text = 'Q1')::int, 0,
  'camp3: không thêm câu hỏi vào form của camp1');

-- ===========================================================================
-- 5. Dữ liệu sai => lỗi "Dòng N" và không ghi gì (camp4 phải luôn rỗng)
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a2'); -- admin A
select throws_like(
  $$select public.import_applications('00000000-0000-0000-0000-00000000ca04', 'F', 'D', array['Q1'],
    '[{"position":"P1","session":"S1","full_name":"A","email":"a@x.com","answers":{"Q1":"x"}},
      {"position":"P1","session":"S1","full_name":"B","email":"b@x.com","answers":{"Q1":"y"}},
      {"full_name":"Thiếu position","email":"c@x.com","answers":{}}]'::jsonb)$$,
  '%Dòng 3%', 'sai: dòng 3 thiếu position => lỗi chứa "Dòng 3"');
select throws_like(
  $$select public.import_applications('00000000-0000-0000-0000-00000000ca04', 'F', 'D', array['Q1'],
    '[{"position":"P1","email":"a@x.com","answers":{}},
      {"position":"   ","email":"b@x.com","answers":{}}]'::jsonb)$$,
  '%Dòng 2%', 'sai: position toàn khoảng trắng ở dòng 2 => "Dòng 2"');
select throws_like(
  $$select public.import_applications('00000000-0000-0000-0000-00000000ca04', 'F', 'D', array['Q1'],
    jsonb_build_array(jsonb_build_object('position', repeat('p', 201), 'email', 'a@x.com', 'answers', '{}'::jsonb)))$$,
  '%Dòng 1%', 'sai: position dài 201 ký tự => "Dòng 1"');
select throws_like(
  $$select public.import_applications('00000000-0000-0000-0000-00000000ca04', 'F', 'D', array['Q1'],
    jsonb_build_array(jsonb_build_object('position', 'P1', 'session', repeat('s', 201), 'email', 'a@x.com', 'answers', '{}'::jsonb)))$$,
  '%Dòng 1%', 'sai: session dài 201 ký tự => "Dòng 1"');
select throws_like(
  $$select public.import_applications('00000000-0000-0000-0000-00000000ca04', 'F', 'D', array['Q1'],
    '[{"position":"P1","email":"a@x.com","answers":{}},
      {"position":"P1","email":123,"answers":{}}]'::jsonb)$$,
  '%Dòng 2%', 'sai: email không phải chuỗi ở dòng 2 => "Dòng 2"');
select throws_like(
  $$select public.import_applications('00000000-0000-0000-0000-00000000ca04', 'F', 'D', array['Q1'],
    '[{"position":"P1","email":"a@x.com","answers":{}}, "không phải object"]'::jsonb)$$,
  '%Dòng 2%', 'sai: phần tử không phải object ở dòng 2 => "Dòng 2"');
select throws_like(
  $$select public.import_applications('00000000-0000-0000-0000-00000000ca04', 'F', 'D', array['Q1'],
    '{"position":"P1"}'::jsonb)$$,
  '%', 'sai: p_rows không phải mảng => lỗi');

-- Giới hạn: > 2000 dòng, > 100 câu hỏi, câu hỏi > 500 ký tự
select throws_like(
  $$select public.import_applications('00000000-0000-0000-0000-00000000ca04', 'F', 'D', array['Q1'],
    (select jsonb_agg(jsonb_build_object('position', 'P1', 'email', 'e' || g || '@x.com', 'answers', '{}'::jsonb)) from generate_series(1, 2001) g))$$,
  '%', 'giới hạn: 2001 dòng bị lỗi');
select throws_like(
  $$select public.import_applications('00000000-0000-0000-0000-00000000ca04', 'F', 'D',
    (select array_agg('Q' || g) from generate_series(1, 101) g),
    '[{"position":"P1","email":"a@x.com","answers":{}}]'::jsonb)$$,
  '%', 'giới hạn: 101 câu hỏi bị lỗi');
select throws_like(
  $$select public.import_applications('00000000-0000-0000-0000-00000000ca04', 'F', 'D', array[repeat('q', 501)],
    '[{"position":"P1","email":"a@x.com","answers":{}}]'::jsonb)$$,
  '%', 'giới hạn: câu hỏi dài 501 ký tự bị lỗi');
reset role;

select is((select count(*) from public.recruitment_positions where campaign_id = '00000000-0000-0000-0000-00000000ca04')::int, 0, 'sai/giới hạn: không có vị trí nào được ghi (camp4)');
select is((select count(*) from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca04')::int, 0, 'sai/giới hạn: không có form/câu hỏi nào được ghi (camp4)');
select is((select count(*) from public.application_forms f join public.recruitment_positions p on p.id = f.position_id where p.campaign_id = '00000000-0000-0000-0000-00000000ca04')::int, 0, 'sai/giới hạn: không có form nào được ghi (camp4)');
select is((select count(*) from public.applications where campaign_id = '00000000-0000-0000-0000-00000000ca04')::int, 0, 'sai/giới hạn: không có đơn nào được ghi (camp4)');
select is((select count(*) from public.tap_a where campaign_id = '00000000-0000-0000-0000-00000000ca04')::int, 0, 'sai/giới hạn: không có câu trả lời nào được ghi (camp4)');
select is((select count(*) from public.interview_sessions where campaign_id = '00000000-0000-0000-0000-00000000ca04')::int, 0, 'sai/giới hạn: không có ca nào được ghi (camp4)');
select is((select count(*) from public.interview_assignments ia join public.interview_sessions s on s.id = ia.session_id where s.campaign_id = '00000000-0000-0000-0000-00000000ca04')::int, 0, 'sai/giới hạn: không có assignment nào được ghi (camp4)');

-- ===========================================================================
-- 6. Biên chấp nhận được: đúng 2000 dòng + đúng 100 câu hỏi (camp5)
-- ===========================================================================
select public.tap_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$insert into public.tap_res select 'run5', public.import_applications(
      '00000000-0000-0000-0000-00000000ca05', 'F', null,
      (select array_agg('Q' || g order by g) from generate_series(1, 100) g),
      (select jsonb_agg(jsonb_build_object('position', 'P' || (g % 3), 'email', 'u' || g || '@x.com', 'answers', '{}'::jsonb)) from generate_series(1, 2000) g))$$,
  'giới hạn: đúng 2000 dòng và 100 câu hỏi vẫn chạy được');
reset role;
select is((select r from public.tap_res where tag = 'run5'),
  '{"imported":2000,"skipped_duplicates":0,"positions_created":3,"forms_created":3,"sessions_created":0}'::jsonb,
  'giới hạn: 2000 đơn, 3 vị trí, 3 form, 0 ca');
select is((select count(*) from public.tap_q where campaign_id = '00000000-0000-0000-0000-00000000ca05')::int, 300, 'giới hạn: 3 form x 100 câu hỏi = 300');

select * from finish();
rollback;
