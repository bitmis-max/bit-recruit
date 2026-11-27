begin;
select plan(6);

select has_column('public', 'teams', 'duties', 'teams có cột duties');
select has_column('public', 'teams', 'fit_for', 'teams có cột fit_for');

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-00000000a801', 'CLB test team profile');

-- Ban mới mặc định danh sách việc rỗng.
insert into public.teams (id, club_id, name) values
  ('00000000-0000-0000-0000-00000000b801', '00000000-0000-0000-0000-00000000a801', 'Ban test');
select is((select duties from public.teams where id = '00000000-0000-0000-0000-00000000b801'), '{}'::text[], 'duties mặc định rỗng');

-- Tối đa 6 việc.
select throws_ok(
  $$update public.teams set duties = array['1','2','3','4','5','6','7'] where id = '00000000-0000-0000-0000-00000000b801'$$,
  '23514', null, 'không cho quá 6 việc'
);

-- fit_for tối đa 300 ký tự.
select throws_ok(
  $$update public.teams set fit_for = repeat('a', 301) where id = '00000000-0000-0000-0000-00000000b801'$$,
  '23514', null, 'fit_for không quá 300 ký tự'
);

-- anon đọc được cột mới (trang Giới thiệu là trang công khai).
select ok(has_column_privilege('anon', 'public.teams', 'duties', 'select')
          and has_column_privilege('anon', 'public.teams', 'fit_for', 'select'),
          'anon đọc được duties và fit_for');

select * from finish();
rollback;
