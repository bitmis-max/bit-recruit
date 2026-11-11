begin;
select plan(5);

-- anon không còn quyền ghi trực tiếp vào bảng nào của public.
select is(
  (select count(*)::int
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'insert')
          or has_table_privilege('anon', c.oid, 'update')
          or has_table_privilege('anon', c.oid, 'delete')
          or has_table_privilege('anon', c.oid, 'truncate'))),
  0,
  'anon không ghi trực tiếp được bảng nào'
);

-- Trang công khai vẫn đọc được (RLS quyết định dòng nào).
select ok(has_table_privilege('anon', 'public.events', 'select'), 'anon vẫn đọc được events');

-- Không còn policy nào cho tải lên bucket mẫu.
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(thumbnails|videos)'),
  0,
  'không còn policy cho bucket thumbnails/videos'
);

-- Đơn quá 100 KB bị từ chối trước mọi kiểm tra khác.
set local role anon;
select throws_ok(
  $$select public.submit_application(gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('question_id', gen_random_uuid(), 'text', repeat('a', 100001))))$$,
  'P0001',
  'Đơn ứng tuyển quá dài. Hãy rút gọn câu trả lời rồi gửi lại.',
  'đơn quá 100 KB bị từ chối'
);
select throws_ok(
  $$select public.submit_application(gen_random_uuid(),
      (select jsonb_agg(jsonb_build_object('question_id', gen_random_uuid(), 'text', 'x')) from generate_series(1, 201)))$$,
  'P0001',
  'Đơn ứng tuyển quá dài. Hãy rút gọn câu trả lời rồi gửi lại.',
  'đơn quá 200 câu trả lời bị từ chối'
);
reset role;

select * from finish();
rollback;
