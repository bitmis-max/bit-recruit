-- Vai trò thành viên, nhiệm kỳ và kết nạp ứng viên.
-- Xem docs/CONTRACT.md (mục 2) và docs/database.md.
--   * club_role: 'organizer' -> 'member'
--   * club_members: email, phone, facebook_url, title
--   * applications: facebook_url, admitted_member_id
--   * club_terms, club_term_roles (nhiệm kỳ Ban chủ nhiệm / Ban chủ chốt)
--   * is_club_owner, activate_term, admit_applications, update_my_member_profile
--   * trigger bảo vệ "còn ít nhất 1 owner đang hoạt động có tài khoản"
--   * RLS: chỉ admin đọc applications, application_answers, interview_assignments

begin;

-- ---------------------------------------------------------------------------
-- 1. Enum club_role: organizer -> member
-- ---------------------------------------------------------------------------

alter type public.club_role rename value 'organizer' to 'member';
alter table public.club_members alter column role set default 'member';

-- ---------------------------------------------------------------------------
-- 2. Cột mới
-- ---------------------------------------------------------------------------

alter table public.club_members
  add column email text,
  add column phone text,
  add column facebook_url text,
  add column title text;

alter table public.club_members
  add constraint club_members_facebook_url_format
  check (facebook_url is null or facebook_url ~ '^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+');

create unique index club_members_club_email_unique
  on public.club_members (club_id, lower(email))
  where email is not null;

alter table public.applications
  add column facebook_url text,
  add column admitted_member_id uuid references public.club_members(id) on delete set null;

alter table public.applications
  add constraint applications_facebook_url_format
  check (facebook_url is null or facebook_url ~ '^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+');

create index applications_admitted_member_idx on public.applications (admitted_member_id)
  where admitted_member_id is not null;

alter table public.form_questions drop constraint if exists form_questions_field_key_check;
alter table public.form_questions
  add constraint form_questions_field_key_check
  check (field_key is null or field_key in ('full_name', 'email', 'phone', 'student_code', 'class_name', 'facebook_url'));

alter table public.form_template_questions drop constraint if exists form_template_questions_field_key_check;
alter table public.form_template_questions
  add constraint form_template_questions_field_key_check
  check (field_key is null or field_key in ('full_name', 'email', 'phone', 'student_code', 'class_name', 'facebook_url'));

-- ---------------------------------------------------------------------------
-- 3. Bảng nhiệm kỳ
-- ---------------------------------------------------------------------------

create table public.club_terms (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  status text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  activated_at timestamptz,
  activated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);

create index club_terms_club_idx on public.club_terms (club_id);
create unique index club_terms_one_active_idx on public.club_terms (club_id) where status = 'active';

create table public.club_term_roles (
  term_id uuid not null references public.club_terms(id) on delete cascade,
  member_id uuid not null references public.club_members(id) on delete cascade,
  role public.club_role not null check (role in ('owner', 'admin')),
  title text,
  team_id uuid references public.teams(id) on delete set null,
  primary key (term_id, member_id)
);

create index club_term_roles_member_idx on public.club_term_roles (member_id);

-- Thành viên và ban phải cùng CLB với nhiệm kỳ.
create or replace function public.enforce_term_role_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  -- ON DELETE SET NULL của teams (kể cả khi xóa cả CLB) chỉ đặt team_id = null: bỏ qua.
  if tg_op = 'UPDATE'
    and new.term_id = old.term_id
    and new.member_id = old.member_id
    and new.team_id is null then
    return new;
  end if;

  select t.club_id into v_club_id from public.club_terms t where t.id = new.term_id;

  if v_club_id is null or not exists (
    select 1 from public.club_members m
    where m.id = new.member_id and m.club_id = v_club_id
  ) then
    raise exception 'Thành viên phải thuộc cùng CLB với nhiệm kỳ';
  end if;

  if not public.team_belongs_to_club(new.team_id, v_club_id) then
    raise exception 'Ban phải thuộc cùng CLB với nhiệm kỳ';
  end if;

  return new;
end;
$$;

create trigger club_term_roles_club_check
  before insert or update of term_id, member_id, team_id on public.club_term_roles
  for each row execute function public.enforce_term_role_club();

-- ---------------------------------------------------------------------------
-- 4. Hàm phân quyền và nghiệp vụ
-- ---------------------------------------------------------------------------

create or replace function public.is_club_owner(p_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.club_members m
    where m.user_id = auth.uid()
      and m.club_id = p_club_id
      and m.is_active
      and m.role = 'owner'
  );
$$;

revoke all on function public.is_club_owner(uuid) from public, anon;
grant execute on function public.is_club_owner(uuid) to authenticated, service_role;

create or replace function public.activate_term(p_term_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term public.club_terms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để kích hoạt nhiệm kỳ';
  end if;

  select * into v_term from public.club_terms t where t.id = p_term_id for update;

  if not found or not public.is_club_owner(v_term.club_id) then
    raise exception 'Bạn không có quyền kích hoạt nhiệm kỳ này';
  end if;

  if v_term.status <> 'draft' then
    raise exception 'Chỉ có thể kích hoạt nhiệm kỳ đang ở trạng thái nháp';
  end if;

  if not exists (
    select 1
    from public.club_term_roles r
    join public.club_members m on m.id = r.member_id
    where r.term_id = p_term_id
      and r.role = 'owner'
      and m.club_id = v_term.club_id
      and m.is_active
      and m.user_id is not null
  ) then
    raise exception 'Nhiệm kỳ phải có ít nhất một thành viên Ban chủ nhiệm đang hoạt động và có tài khoản';
  end if;

  -- 1. Nhiệm kỳ đang hoạt động cũ kết thúc.
  update public.club_terms t
  set status = 'ended',
      end_date = coalesce(t.end_date, current_date)
  where t.club_id = v_term.club_id and t.status = 'active';

  -- 2. Mọi thành viên của CLB (kể cả đang nghỉ) không có trong danh sách về vai trò thành viên, để người bật lại không lấy lại quyền cũ.
  update public.club_members m
  set role = 'member', title = null
  where m.club_id = v_term.club_id
    and (m.role <> 'member' or m.title is not null)
    and not exists (
      select 1 from public.club_term_roles r
      where r.term_id = p_term_id and r.member_id = m.id
    );

  -- 3. Thành viên trong danh sách nhận vai trò, chức danh, ban mới.
  update public.club_members m
  set role = r.role,
      title = r.title,
      team_id = coalesce(r.team_id, m.team_id),
      is_active = true
  from public.club_term_roles r
  where r.term_id = p_term_id
    and r.member_id = m.id
    and m.club_id = v_term.club_id;

  -- 4. Kích hoạt nhiệm kỳ mới.
  update public.club_terms t
  set status = 'active',
      activated_at = now(),
      activated_by = auth.uid()
  where t.id = p_term_id;
end;
$$;

revoke all on function public.activate_term(uuid) from public, anon;
grant execute on function public.activate_term(uuid) to authenticated, service_role;

create or replace function public.admit_applications(p_application_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_app record;
  v_student_code text;
  v_email text;
  v_member_id uuid;
  v_admitted int := 0;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để kết nạp ứng viên';
  end if;

  if p_application_ids is null then
    raise exception 'Danh sách đơn ứng tuyển không hợp lệ';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
  from unnest(p_application_ids) x
  where x is not null;

  if exists (
    select 1
    from public.applications a
    join public.recruitment_campaigns c on c.id = a.campaign_id
    where a.id = any (v_ids)
      and not public.is_club_admin(c.club_id)
  ) then
    raise exception 'Bạn không có quyền kết nạp ứng viên của CLB này';
  end if;

  for v_app in
    select a.id, a.full_name, a.email, a.phone, a.student_code, a.class_name, a.facebook_url,
           c.club_id, p.team_id
    from public.applications a
    join public.recruitment_campaigns c on c.id = a.campaign_id
    join public.recruitment_positions p on p.id = a.position_id
    where a.id = any (v_ids)
      and a.status = 'passed'
      and a.admitted_member_id is null
    order by a.submitted_at, a.id
    for update of a
  loop
    v_student_code := nullif(btrim(v_app.student_code), '');
    v_email := lower(nullif(btrim(v_app.email), ''));
    v_member_id := null;

    -- Trùng mã sinh viên hoặc email trong CLB thì gắn vào thành viên sẵn có.
    select m.id into v_member_id
    from public.club_members m
    where m.club_id = v_app.club_id
      and ((v_student_code is not null and m.student_code = v_student_code)
        or (v_email is not null and lower(m.email) = v_email))
    order by (m.student_code = v_student_code) desc nulls last, m.created_at
    limit 1;

    if v_member_id is null then
      begin
        insert into public.club_members (
          club_id, team_id, role, student_code, full_name, class_name, email, phone, facebook_url
        )
        values (
          v_app.club_id,
          v_app.team_id,
          'member',
          v_student_code,
          coalesce(nullif(btrim(v_app.full_name), ''), 'Chưa rõ họ tên'),
          nullif(btrim(v_app.class_name), ''),
          v_email,
          nullif(btrim(v_app.phone), ''),
          case when v_app.facebook_url ~ '^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+'
            then v_app.facebook_url end
        )
        returning id into v_member_id;
      exception when unique_violation then
        -- Có phiên khác vừa tạo cùng thành viên: dùng lại.
        select m.id into v_member_id
        from public.club_members m
        where m.club_id = v_app.club_id
          and ((v_student_code is not null and m.student_code = v_student_code)
            or (v_email is not null and lower(m.email) = v_email))
        order by (m.student_code = v_student_code) desc nulls last, m.created_at
        limit 1;
      end;
    end if;

    if v_member_id is null then
      raise exception 'Không thể kết nạp ứng viên: dữ liệu thành viên bị trùng';
    end if;

    update public.applications a
    set admitted_member_id = v_member_id
    where a.id = v_app.id;

    v_admitted := v_admitted + 1;
  end loop;

  return jsonb_build_object(
    'admitted', v_admitted,
    'skipped', cardinality(v_ids) - v_admitted
  );
end;
$$;

revoke all on function public.admit_applications(uuid[]) from public, anon;
grant execute on function public.admit_applications(uuid[]) to authenticated, service_role;

create or replace function public.update_my_member_profile(
  p_club_id uuid,
  p_phone text,
  p_facebook_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := nullif(btrim(p_phone), '');
  v_facebook_url text := nullif(btrim(p_facebook_url), '');
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để cập nhật hồ sơ';
  end if;

  if v_phone is not null and char_length(v_phone) > 30 then
    raise exception 'Số điện thoại quá dài';
  end if;

  if v_facebook_url is not null and (
    char_length(v_facebook_url) > 500
    or v_facebook_url !~ '^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+'
  ) then
    raise exception 'Link Facebook không hợp lệ. Link phải bắt đầu bằng https://facebook.com/ hoặc https://fb.com/';
  end if;

  update public.club_members m
  set phone = v_phone,
      facebook_url = v_facebook_url
  where m.club_id = p_club_id
    and m.user_id = auth.uid()
    and m.is_active;

  if not found then
    raise exception 'Bạn không phải thành viên đang hoạt động của CLB này';
  end if;
end;
$$;

revoke all on function public.update_my_member_profile(uuid, text, text) from public, anon;
grant execute on function public.update_my_member_profile(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Bảo vệ "còn ít nhất một owner đang hoạt động có tài khoản"
-- ---------------------------------------------------------------------------

create or replace function public.enforce_club_has_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- CLB đã bị xóa (xóa cascade) thì không cần kiểm tra.
  if exists (select 1 from public.clubs c where c.id = old.club_id)
    and not exists (
      select 1 from public.club_members m
      where m.club_id = old.club_id
        and m.role = 'owner'
        and m.is_active
        and m.user_id is not null
    ) then
    raise exception 'CLB phải còn ít nhất một thành viên Ban chủ nhiệm có tài khoản.';
  end if;
  return null;
end;
$$;

-- Chỉ xếp lịch kiểm tra khi dòng cũ là owner đang hoạt động có tài khoản (dòng có thể vừa mất tư cách đó).
create constraint trigger club_members_keep_owner
  after update or delete on public.club_members
  deferrable initially deferred
  for each row
  when (old.role = 'owner' and old.is_active and old.user_id is not null)
  execute function public.enforce_club_has_owner();

-- ---------------------------------------------------------------------------
-- 6. submit_application: thêm field_key facebook_url
-- ---------------------------------------------------------------------------

create or replace function public.submit_application(p_position_id uuid, p_answers jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_position_id uuid;
  v_form_id uuid;
  v_app_id uuid;
  v_token text;
  v_full_name text;
  v_email text;
  v_phone text;
  v_student_code text;
  v_class_name text;
  v_facebook_url text;
  v_q record;
  v_answer jsonb;
  v_text text;
  v_json jsonb;
  v_availability_question_id uuid;
  v_session_id uuid;
  v_has_sessions boolean;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Câu trả lời phải được gửi dưới dạng danh sách';
  end if;

  select p.campaign_id, p.id into v_campaign_id, v_position_id
  from public.recruitment_positions p
  join public.recruitment_campaigns c on c.id = p.campaign_id
  where p.id = p_position_id
    and c.status = 'open'
    and (c.start_date is null or c.start_date <= now())
    and (c.end_date is null or c.end_date >= now());
  if v_campaign_id is null then
    raise exception 'Đợt tuyển không mở hoặc vị trí không tồn tại';
  end if;

  select f.id into v_form_id from public.application_forms f where f.position_id = v_position_id;
  if v_form_id is null then raise exception 'Vị trí chưa có biểu mẫu ứng tuyển'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_answers) a
    group by a->>'question_id' having count(*) > 1
  ) then raise exception 'Một câu hỏi không thể được gửi nhiều lần'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_answers) a
    where not exists (
      select 1 from public.form_questions q
      where q.form_id = v_form_id and q.id = (a->>'question_id')::uuid
    )
  ) then raise exception 'Câu trả lời không thuộc biểu mẫu của vị trí này'; end if;

  select exists (
    select 1 from public.interview_sessions s
    where s.position_id = v_position_id and s.end_time >= now()
  ) into v_has_sessions;

  for v_q in
    select q.id, q.question_text, q.question_type, q.field_key, q.options, q.is_required
    from public.form_questions q where q.form_id = v_form_id
  loop
    select a into v_answer from jsonb_array_elements(p_answers) a
    where (a->>'question_id')::uuid = v_q.id limit 1;
    v_text := nullif(btrim(v_answer->>'text'), '');
    v_json := v_answer->'json';

    if v_q.is_required
      and not (lower(btrim(v_q.question_text)) = lower('Thời gian có thể tham gia phỏng vấn') and not v_has_sessions) then
      if v_answer is null
        or (v_q.question_type = 'multi_choice' and (coalesce(jsonb_typeof(v_json), 'null') <> 'array' or (jsonb_typeof(v_json) = 'array' and jsonb_array_length(v_json) = 0)))
        or (v_q.question_type <> 'multi_choice' and v_text is null) then
        raise exception 'Vui lòng trả lời câu hỏi bắt buộc: %', v_q.question_text;
      end if;
    end if;

    if v_answer is not null and v_q.field_key is null
      and lower(btrim(v_q.question_text)) <> lower('Thời gian có thể tham gia phỏng vấn') then
      if v_q.question_type <> 'multi_choice' and v_json is not null and jsonb_typeof(v_json) <> 'null' then
        raise exception 'Câu hỏi chỉ nhận câu trả lời văn bản: %', v_q.question_text;
      end if;
      if v_q.question_type = 'multi_choice' and v_text is not null then
        raise exception 'Câu hỏi nhiều lựa chọn không nhận văn bản riêng: %', v_q.question_text;
      end if;
      if v_q.question_type = 'single_choice' and v_text is not null and not exists (
        select 1 from jsonb_array_elements_text(coalesce(v_q.options, '[]'::jsonb)) option where option = v_text
      ) and not exists (
        select 1 from jsonb_array_elements_text(coalesce(v_q.options, '[]'::jsonb)) option where option = '__other__'
      ) then raise exception 'Lựa chọn không hợp lệ cho câu hỏi: %', v_q.question_text; end if;

      if v_q.question_type = 'multi_choice' then
        if v_json is not null and jsonb_typeof(v_json) <> 'null' and jsonb_typeof(v_json) <> 'array' then
          raise exception 'Câu trả lời nhiều lựa chọn không hợp lệ: %', v_q.question_text;
        end if;
        if jsonb_typeof(v_json) = 'array' and exists (
          select 1 from jsonb_array_elements_text(v_json) answer_option
          where not exists (
            select 1 from jsonb_array_elements_text(coalesce(v_q.options, '[]'::jsonb)) option where option = answer_option
          )
        ) and not exists (
          select 1 from jsonb_array_elements_text(coalesce(v_q.options, '[]'::jsonb)) option where option = '__other__'
        ) then raise exception 'Có lựa chọn không hợp lệ cho câu hỏi: %', v_q.question_text; end if;
      elsif v_q.question_type = 'number' and v_text is not null then
        if v_text !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then
          raise exception 'Giá trị phải là số cho câu hỏi: %', v_q.question_text;
        end if;
        begin perform v_text::numeric;
        exception when others then raise exception 'Giá trị số vượt giới hạn cho câu hỏi: %', v_q.question_text;
        end;
      elsif v_q.question_type = 'date' and v_text is not null then
        begin
          if to_char(v_text::date, 'YYYY-MM-DD') <> v_text then raise exception 'invalid date'; end if;
        exception when others then raise exception 'Ngày không hợp lệ cho câu hỏi: %', v_q.question_text;
        end;
      end if;
    end if;

    if v_q.field_key is not null and v_answer is not null then
      if v_json is not null and jsonb_typeof(v_json) <> 'null' then
        raise exception 'Trường thông tin ứng viên phải có câu trả lời dạng văn bản';
      end if;
      case v_q.field_key
        when 'full_name' then v_full_name := v_text;
        when 'email' then v_email := lower(v_text);
        when 'phone' then v_phone := v_text;
        when 'student_code' then v_student_code := v_text;
        when 'class_name' then v_class_name := v_text;
        when 'facebook_url' then v_facebook_url := v_text;
      end case;
    end if;
  end loop;

  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Email không hợp lệ';
  end if;

  if v_facebook_url is not null and v_facebook_url !~ '^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+' then
    raise exception 'Link Facebook không hợp lệ. Link phải bắt đầu bằng https://facebook.com/ hoặc https://fb.com/';
  end if;

  insert into public.applications (campaign_id, position_id, full_name, email, phone, student_code, class_name, facebook_url)
  values (v_campaign_id, v_position_id, v_full_name, v_email, v_phone, v_student_code, v_class_name, v_facebook_url)
  returning id, tracking_token into v_app_id, v_token;

  insert into public.application_answers (application_id, question_id, answer_text, answer_json)
  select v_app_id, q.id, a->>'text', a->'json'
  from jsonb_array_elements(p_answers) a
  join public.form_questions q on q.id = (a->>'question_id')::uuid
  where q.form_id = v_form_id and q.field_key is null;

  select q.id into v_availability_question_id
  from public.form_questions q
  where q.form_id = v_form_id
    and q.field_key is null
    and lower(btrim(q.question_text)) = lower('Thời gian có thể tham gia phỏng vấn')
  order by q.order_index, q.id limit 1;

  if v_availability_question_id is not null and v_has_sessions then
    select (a->'json'->>0)::uuid into v_session_id
    from jsonb_array_elements(p_answers) a
    where (a->>'question_id')::uuid = v_availability_question_id
      and jsonb_typeof(a->'json') = 'array' and jsonb_array_length(a->'json') = 1;
    if v_session_id is null or not exists (
      select 1 from public.interview_sessions s
      where s.id = v_session_id and s.campaign_id = v_campaign_id
        and s.position_id = v_position_id and s.end_time >= now()
    ) then raise exception 'Ca phỏng vấn đã chọn không hợp lệ'; end if;
    insert into public.interview_assignments (application_id, session_id)
    values (v_app_id, v_session_id) on conflict (application_id, session_id) do nothing;
  end if;

  return v_token;
end;
$$;

revoke all on function public.submit_application(uuid, jsonb) from public;
grant execute on function public.submit_application(uuid, jsonb) to anon, authenticated, service_role;

-- create_application_form_from_template và save_application_form_questions không
-- kiểm tra danh sách field_key (chỉ sao chép / không đụng tới), nên không cần sửa.

-- ---------------------------------------------------------------------------
-- 7. RLS và grant cho bảng nhiệm kỳ
-- ---------------------------------------------------------------------------

alter table public.club_terms enable row level security;
alter table public.club_term_roles enable row level security;

-- Supabase có thể tự cấp quyền mặc định cho bảng mới: thu hồi rồi cấp lại đúng cột.
revoke all on public.club_terms from public, anon, authenticated;
revoke all on public.club_term_roles from public, anon, authenticated;

grant select, delete on public.club_terms to authenticated;
grant insert (club_id, name, start_date, end_date) on public.club_terms to authenticated;
grant update (name, start_date, end_date) on public.club_terms to authenticated;

grant select, delete on public.club_term_roles to authenticated;
grant insert (term_id, member_id, role, title, team_id) on public.club_term_roles to authenticated;
-- term_id/member_id included because PostgREST upsert sets every payload column on conflict;
-- RLS (owner + draft term) and enforce_term_role_club still guard the new values.
grant update (term_id, member_id, role, title, team_id) on public.club_term_roles to authenticated;

grant all on public.club_terms to service_role;
grant all on public.club_term_roles to service_role;

create policy "admins read club terms" on public.club_terms
  for select to authenticated using (public.is_club_admin(club_id));
create policy "owners insert draft club terms" on public.club_terms
  for insert to authenticated
  with check (status = 'draft' and public.is_club_owner(club_id));
create policy "owners update draft club terms" on public.club_terms
  for update to authenticated
  using (status = 'draft' and public.is_club_owner(club_id))
  with check (status = 'draft' and public.is_club_owner(club_id));
create policy "owners delete draft club terms" on public.club_terms
  for delete to authenticated
  using (status = 'draft' and public.is_club_owner(club_id));

create policy "admins read club term roles" on public.club_term_roles
  for select to authenticated using (
    exists (
      select 1 from public.club_terms t
      where t.id = club_term_roles.term_id
        and public.is_club_admin(t.club_id)
    )
  );
create policy "owners insert draft club term roles" on public.club_term_roles
  for insert to authenticated with check (
    exists (
      select 1 from public.club_terms t
      where t.id = club_term_roles.term_id
        and t.status = 'draft'
        and public.is_club_owner(t.club_id)
    )
  );
create policy "owners update draft club term roles" on public.club_term_roles
  for update to authenticated
  using (
    exists (
      select 1 from public.club_terms t
      where t.id = club_term_roles.term_id
        and t.status = 'draft'
        and public.is_club_owner(t.club_id)
    )
  )
  with check (
    exists (
      select 1 from public.club_terms t
      where t.id = club_term_roles.term_id
        and t.status = 'draft'
        and public.is_club_owner(t.club_id)
    )
  );
create policy "owners delete draft club term roles" on public.club_term_roles
  for delete to authenticated using (
    exists (
      select 1 from public.club_terms t
      where t.id = club_term_roles.term_id
        and t.status = 'draft'
        and public.is_club_owner(t.club_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Siết RLS: chỉ admin đọc đơn ứng tuyển, câu trả lời, kết quả phỏng vấn
-- ---------------------------------------------------------------------------

-- Admin chỉ được đổi trạng thái đơn; admitted_member_id chỉ do admit_applications ghi.
-- (updated_at do trigger set_updated_at đặt, không cần grant cột.)
revoke update on public.applications from authenticated;
grant update (status) on public.applications to authenticated;

drop policy "members read applications" on public.applications;
create policy "admins read applications" on public.applications
  for select to authenticated using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = applications.campaign_id
        and public.is_club_admin(c.club_id)
    )
  );

drop policy "members read application answers" on public.application_answers;
create policy "admins read application answers" on public.application_answers
  for select to authenticated using (
    exists (
      select 1 from public.applications a
      join public.recruitment_campaigns c on c.id = a.campaign_id
      where a.id = application_answers.application_id
        and public.is_club_admin(c.club_id)
    )
  );

drop policy "staff read interview assignments" on public.interview_assignments;
create policy "admins read interview assignments" on public.interview_assignments
  for select to authenticated using (
    exists (
      select 1 from public.interview_sessions s
      join public.recruitment_campaigns c on c.id = s.campaign_id
      where s.id = interview_assignments.session_id
        and public.is_club_admin(c.club_id)
    )
  );

commit;
