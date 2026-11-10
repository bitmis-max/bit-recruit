begin;
select plan(7);

-- anon may only execute the two public applicant functions.
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege('anon', p.oid, 'execute')),
  array['get_application_by_token', 'submit_application'],
  'anon chỉ gọi được submit_application và get_application_by_token'
);

-- No trigger function is callable by anon or authenticated.
select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))),
  0,
  'hàm trigger không gọi trực tiếp được qua API'
);

-- Functions the app and RLS policies need stay executable by authenticated.
select ok(
  (select bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (
     'is_club_admin', 'is_club_member', 'is_club_owner', 'is_task_assignee', 'task_club_id',
     'team_belongs_to_club', 'can_delete_empty_interview_session',
     'create_task', 'apply_task_scan', 'club_contribution', 'set_my_task_done',
     'is_club_head', 'has_club_permission', 'my_club_team',
     'activate_term', 'admit_applications', 'update_my_member_profile',
     'create_application_form_from_template', 'save_application_form_questions')),
  'authenticated vẫn gọi được các hàm ứng dụng và RLS cần'
);

select ok(has_function_privilege('anon', 'public.submit_application(uuid, jsonb)', 'execute'), 'anon vẫn nộp đơn được');
select ok(not has_function_privilege('anon', 'public.is_club_admin(uuid)', 'execute'), 'anon không gọi is_club_admin');

select ok(not has_function_privilege('anon', 'public.is_club_head(uuid)', 'execute'), 'anon không gọi is_club_head');
select ok(
  not has_function_privilege('anon', 'public.has_club_permission(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.my_club_team(uuid)', 'execute'),
  'anon không gọi has_club_permission / my_club_team');

select * from finish();
rollback;
