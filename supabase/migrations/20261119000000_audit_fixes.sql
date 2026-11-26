-- Đợt 7: sửa vấn đề từ đợt rà soát toàn bộ (docs/CONTRACT.md, mục "DB"). Tương thích ngược với code cũ.
--   1. interview_sessions: anon không đọc được meeting_link/location/note/capacity.
--   2. FK RESTRICT: không xóa dây chuyền mất đơn (đợt, vị trí, câu hỏi còn đơn/câu trả lời).
--   3. import_members: không Chủ nhiệm thì bỏ qua hoàn toàn dòng owner/admin.
--   4. admit_applications: không Chủ nhiệm thì không đổi ban của owner/admin.
--   5. Sức chứa ca phỏng vấn: khóa dòng ca, chỉ đếm scheduled/attended.
--   6. submit_application: trùng email báo lỗi thân thiện.
--   7. Trigger tự tạo câu hỏi "Thời gian có thể tham gia phỏng vấn" khi tạo ca (+ backfill).
--   8. Dời hạn việc thì cho nhắc lại.
--   9. Thu quyền ghi/đọc thừa (không có policy tương ứng).
--  10. Index cho FK.

begin;

-- ---------------------------------------------------------------------------
-- 1. Link phỏng vấn không lộ cho anon
-- ---------------------------------------------------------------------------
-- Policy công khai "public read open interview sessions" giữ nguyên điều kiện; chỉ thu cột nhạy cảm.
revoke select on public.interview_sessions from anon;
grant select (id, campaign_id, position_id, round, start_time, end_time)
  on public.interview_sessions to anon;

-- ---------------------------------------------------------------------------
-- 2. Không xóa dây chuyền mất đơn
-- ---------------------------------------------------------------------------
-- Xóa đợt/vị trí/biểu mẫu/câu hỏi khi CÒN đơn hoặc câu trả lời -> lỗi 23503.
-- Chưa có đơn thì cascade như cũ (đợt -> vị trí -> biểu mẫu -> câu hỏi; ca phỏng vấn).
alter table public.applications drop constraint applications_campaign_id_fkey;
alter table public.applications
  add constraint applications_campaign_id_fkey
  foreign key (campaign_id) references public.recruitment_campaigns(id) on delete restrict;

alter table public.applications drop constraint applications_position_id_fkey;
alter table public.applications
  add constraint applications_position_id_fkey
  foreign key (position_id) references public.recruitment_positions(id) on delete restrict;

alter table public.application_answers drop constraint application_answers_question_id_fkey;
alter table public.application_answers
  add constraint application_answers_question_id_fkey
  foreign key (question_id) references public.form_questions(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 3. import_members: người gọi không phải Chủ nhiệm không cập nhật gì ở dòng owner/admin
-- ---------------------------------------------------------------------------
create or replace function public.import_members(
  p_club_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_rows constant int := 1000;
  c_email_re constant text := '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$';  -- như submit_application
  c_fb_re constant text := '^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+';    -- như check của club_members
  c_keys constant text[] := array[
    'full_name', 'student_code', 'class_name', 'email', 'phone', 'facebook_url', 'team', 'title'
  ];

  v_is_head boolean;
  v_cur int;                 -- số dòng đang xử lý (cho tiền tố "Dòng N: ")
  v_total int;
  v_n int;
  v_row jsonb;
  v_f jsonb;
  v_k text;
  v_val jsonb;
  v_txt text;
  v_limit int;

  v_name text;
  v_code text;
  v_email text;
  v_team_name text;
  v_team_id uuid;

  v_seen_code jsonb := '{}';   -- MSSV -> số dòng đã dùng trong file
  v_seen_email jsonb := '{}';  -- email -> số dòng đã dùng trong file
  v_team_cache jsonb := '{}';  -- tên ban viết thường -> team_id
  v_prev int;

  v_code_id uuid;
  v_email_id uuid;
  v_m public.club_members%rowtype;

  v_class text;
  v_phone text;
  v_fb text;
  v_title text;
  v_new_email text;
  v_new_team uuid;
  v_add_team boolean;

  v_inserted int := 0;
  v_updated int := 0;
  v_unchanged int := 0;
  v_staff_skipped int := 0;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để import thành viên';
  end if;

  if p_club_id is null or not public.has_club_permission(p_club_id, 'members') then
    raise exception 'Bạn không có quyền import thành viên cho CLB này';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Dữ liệu import phải là một danh sách các dòng';
  end if;

  v_total := jsonb_array_length(p_rows);
  if v_total = 0 then
    raise exception 'Không có dòng nào để import';
  end if;
  if v_total > c_max_rows then
    raise exception 'Tối đa % dòng mỗi lần import (file có % dòng)', c_max_rows, v_total;
  end if;

  v_is_head := public.is_club_head(p_club_id);

  -- Hai lần import cùng CLB không chạy đồng thời (tránh ghép trùng thành viên).
  perform pg_advisory_xact_lock(hashtextextended('import_members:' || p_club_id::text, 0));

  begin
    for v_n in 1..v_total loop
      v_cur := v_n;
      v_row := p_rows -> (v_n - 1);

      -- ---- Kiểm tra dữ liệu dòng ----
      if jsonb_typeof(v_row) <> 'object' then
        raise exception 'Dòng %: dữ liệu dòng không hợp lệ', v_n;
      end if;

      v_f := '{}';
      foreach v_k in array c_keys loop
        v_val := v_row -> v_k;
        v_txt := null;
        if v_val is not null and jsonb_typeof(v_val) <> 'null' then
          if jsonb_typeof(v_val) <> 'string' then
            raise exception 'Dòng %: trường "%" phải là chuỗi', v_n, v_k;
          end if;
          v_txt := nullif(btrim(v_val #>> '{}'), '');
        end if;
        v_limit := case v_k
          when 'full_name' then 200
          when 'team' then 200
          when 'email' then 254
          when 'facebook_url' then 500
          else 100
        end;
        if char_length(v_txt) > v_limit then
          raise exception 'Dòng %: trường "%" tối đa % ký tự', v_n, v_k, v_limit;
        end if;
        if v_k = 'email' then
          v_txt := lower(v_txt);
          if v_txt is not null and v_txt !~ c_email_re then
            raise exception 'Dòng %: email không hợp lệ', v_n;
          end if;
        end if;
        if v_k = 'facebook_url' and v_txt is not null and v_txt !~ c_fb_re then
          raise exception 'Dòng %: link Facebook không hợp lệ', v_n;
        end if;
        v_f := v_f || jsonb_build_object(v_k, v_txt);
      end loop;

      v_name := v_f ->> 'full_name';
      v_code := v_f ->> 'student_code';
      v_email := v_f ->> 'email';
      v_class := v_f ->> 'class_name';
      v_phone := v_f ->> 'phone';
      v_fb := v_f ->> 'facebook_url';
      v_title := v_f ->> 'title';
      v_team_name := v_f ->> 'team';

      if v_name is null then
        raise exception 'Dòng %: thiếu họ tên', v_n;
      end if;

      -- ---- Trùng trong chính file ----
      if v_code is not null then
        v_prev := (v_seen_code ->> v_code)::int;
        if v_prev is not null then
          raise exception 'Dòng % trùng với dòng % (MSSV %)', v_n, v_prev, v_code;
        end if;
        v_seen_code := v_seen_code || jsonb_build_object(v_code, v_n);
      end if;
      if v_email is not null then
        v_prev := (v_seen_email ->> v_email)::int;
        if v_prev is not null then
          raise exception 'Dòng % trùng với dòng % (email %)', v_n, v_prev, v_email;
        end if;
        v_seen_email := v_seen_email || jsonb_build_object(v_email, v_n);
      end if;

      -- ---- Ban ----
      v_team_id := null;
      if v_team_name is not null then
        v_team_id := (v_team_cache ->> lower(v_team_name))::uuid;
        if v_team_id is null then
          select t.id into v_team_id
          from public.teams t
          where t.club_id = p_club_id and lower(btrim(t.name)) = lower(v_team_name)
          order by t.created_at, t.id
          limit 1;

          if v_team_id is null then
            raise exception 'Dòng %: ban "%" chưa có trên web. Hãy tạo ban ở mục Quản lí ban hoặc sửa tên trong file.',
              v_n, v_team_name;
          end if;
          v_team_cache := v_team_cache || jsonb_build_object(lower(v_team_name), v_team_id);
        end if;
      end if;

      -- ---- Ghép với thành viên đã có: MSSV trước, rồi email ----
      v_code_id := null;
      v_email_id := null;
      if v_code is not null then
        select m.id into v_code_id
        from public.club_members m
        where m.club_id = p_club_id and m.student_code = v_code;
      end if;
      if v_email is not null then
        select m.id into v_email_id
        from public.club_members m
        where m.club_id = p_club_id and lower(m.email) = v_email;
      end if;

      if v_code_id is not null and v_email_id is not null and v_code_id <> v_email_id then
        raise exception 'Dòng %: MSSV và email thuộc hai thành viên khác nhau trên web', v_n;
      end if;

      if coalesce(v_code_id, v_email_id) is null then
        -- Thêm mới
        insert into public.club_members (
          club_id, team_id, role, is_active, student_code, full_name, class_name,
          email, phone, facebook_url, title
        )
        values (
          p_club_id, v_team_id, 'member', true, v_code, v_name, v_class,
          v_email, v_phone, v_fb, v_title
        );
        v_inserted := v_inserted + 1;
        continue;
      end if;

      -- Cập nhật: chỉ ghi các trường file có giá trị. Không đụng role,
      -- permissions, is_head, user_id, is_active.
      select * into v_m from public.club_members m where m.id = coalesce(v_code_id, v_email_id);

      -- Dòng của Ban chủ nhiệm/Ban chủ chốt: chỉ Chủ nhiệm được cập nhật. Người khác: bỏ qua
      -- hoàn toàn (không đổi tên, email, SĐT, MSSV, lớp, Facebook, chức danh, ban) và đếm lại.
      if v_m.role in ('owner', 'admin') and not v_is_head then
        v_staff_skipped := v_staff_skipped + 1;
        continue;
      end if;

      v_new_email := coalesce(v_email, v_m.email);
      if v_email is not null and lower(v_m.email) = v_email then
        v_new_email := v_m.email;  -- chỉ khác hoa/thường: coi như không đổi
      end if;

      -- Ban: THÊM vào tập, không đổi/gỡ ban cũ. Ban chính chỉ đặt khi đang null.
      v_new_team := coalesce(v_m.team_id, v_team_id);
      v_add_team := v_team_id is not null and not exists (
        select 1 from public.club_member_teams mt
        where mt.member_id = v_m.id and mt.team_id = v_team_id
      );

      if not v_add_team
         and (v_name, coalesce(v_code, v_m.student_code), coalesce(v_class, v_m.class_name), v_new_email,
          coalesce(v_phone, v_m.phone), coalesce(v_fb, v_m.facebook_url), coalesce(v_title, v_m.title))
         is not distinct from
         (v_m.full_name, v_m.student_code, v_m.class_name, v_m.email,
          v_m.phone, v_m.facebook_url, v_m.title) then
        v_unchanged := v_unchanged + 1;
        continue;
      end if;

      update public.club_members m
      set full_name = v_name,
          student_code = coalesce(v_code, m.student_code),
          class_name = coalesce(v_class, m.class_name),
          email = v_new_email,
          phone = coalesce(v_phone, m.phone),
          facebook_url = coalesce(v_fb, m.facebook_url),
          title = coalesce(v_title, m.title),
          team_id = v_new_team
      where m.id = v_m.id;
      if v_add_team then
        insert into public.club_member_teams (member_id, team_id)
        values (v_m.id, v_team_id)
        on conflict do nothing;
      end if;
      v_updated := v_updated + 1;
    end loop;
  exception
    when others then
      -- Một khối bắt lỗi cho cả vòng lặp (không savepoint mỗi dòng). Lỗi đã có
      -- số dòng thì giữ nguyên; lỗi từ DB/trigger thì thêm tiền tố "Dòng N: ".
      if v_cur is null or sqlerrm like 'Dòng %' then
        raise;
      end if;
      raise exception 'Dòng %: %', v_cur, sqlerrm;
  end;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'staff_team_skipped', v_staff_skipped
  );
end;
$$;

revoke all on function public.import_members(uuid, jsonb) from public, anon;
grant execute on function public.import_members(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. admit_applications: không Chủ nhiệm thì không đổi ban của owner/admin
-- ---------------------------------------------------------------------------
-- Thành viên được ghép là owner/admin và người gọi không phải Chủ nhiệm: chỉ gắn
-- admitted_member_id, không thêm ban, không đặt ban chính.

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
  v_member_role public.club_role;
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
      and not public.has_club_permission(c.club_id, 'recruitment')
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

    -- Đợt 6: ứng viên vào vị trí của một ban thì ban đó được THÊM vào tập ban của thành viên
    -- (kể cả thành viên sẵn có). Ban chính chỉ đặt khi đang null.
    -- Đợt 7: thành viên là owner/admin mà người gọi không phải Chủ nhiệm thì không đụng tới ban.
    select m.role into v_member_role from public.club_members m where m.id = v_member_id;
    if v_app.team_id is not null
       and (v_member_role = 'member' or public.is_club_head(v_app.club_id)) then
      insert into public.club_member_teams (member_id, team_id)
      values (v_member_id, v_app.team_id)
      on conflict do nothing;
      update public.club_members m
      set team_id = v_app.team_id
      where m.id = v_member_id and m.team_id is null;
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

-- ---------------------------------------------------------------------------
-- 5. Sức chứa ca phỏng vấn: khóa dòng ca trước khi đếm, chỉ đếm scheduled/attended
-- ---------------------------------------------------------------------------
create or replace function public.enforce_interview_assignment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_used int;
begin
  if not exists (
    select 1
    from public.interview_sessions s
    join public.applications a on a.id = new.application_id
    where s.id = new.session_id
      and s.campaign_id = a.campaign_id
      and s.position_id = a.position_id
  ) then
    raise exception 'Ứng viên và ca phỏng vấn phải thuộc cùng một vị trí tuyển';
  end if;

  -- Khóa dòng ca: hai lần xếp cùng lúc vào một ca không cùng thấy chỗ trống.
  select s.capacity into v_capacity
  from public.interview_sessions s
  where s.id = new.session_id
  for update;

  if v_capacity is not null then
    select count(*) into v_used
    from public.interview_assignments ia
    where ia.session_id = new.session_id
      and ia.status in ('scheduled', 'attended')
      and (tg_op = 'INSERT' or ia.id <> new.id);

    if v_used >= v_capacity then
      raise exception 'Ca phỏng vấn đã đủ sức chứa';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. submit_application: trùng email cùng vị trí báo lỗi thân thiện (không lộ tên khóa)
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
  -- Chống bơm dữ liệu: tối đa 200 câu trả lời, tổng 100 KB cho một đơn.
  if p_answers is not null and (octet_length(p_answers::text) > 100000
    or (jsonb_typeof(p_answers) = 'array' and jsonb_array_length(p_answers) > 200)) then
    raise exception 'Đơn ứng tuyển quá dài. Hãy rút gọn câu trả lời rồi gửi lại.';
  end if;
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

  begin
    insert into public.applications (campaign_id, position_id, full_name, email, phone, student_code, class_name, facebook_url)
    values (v_campaign_id, v_position_id, v_full_name, v_email, v_phone, v_student_code, v_class_name, v_facebook_url)
    returning id, tracking_token into v_app_id, v_token;
  exception when unique_violation then
    raise exception 'Email này đã nộp đơn cho vị trí này.';
  end;

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

-- ---------------------------------------------------------------------------
-- 7. Câu hỏi "Thời gian có thể tham gia phỏng vấn" do DB tạo khi có ca phỏng vấn
-- ---------------------------------------------------------------------------
-- Trước đây trang công khai tạo câu hỏi này bằng service-role. Nay: thêm ca phỏng vấn cho một
-- vị trí có biểu mẫu mà biểu mẫu chưa có câu hỏi thì tự thêm (long_text, bắt buộc).
-- Unique index form_questions_interview_availability_unique chặn trùng; on conflict do nothing
-- để hai ca được thêm cùng lúc không gây lỗi.
create or replace function public.ensure_interview_availability_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form_id uuid;
begin
  select f.id into v_form_id
  from public.application_forms f
  where f.position_id = new.position_id;

  if v_form_id is null then
    return null;
  end if;

  insert into public.form_questions (
    form_id, question_text, question_type, field_key, is_required, order_index
  )
  select v_form_id, 'Thời gian có thể tham gia phỏng vấn', 'long_text', null, true,
         coalesce(max(q.order_index), -1) + 1
  from public.form_questions q
  where q.form_id = v_form_id
  having not exists (
    select 1 from public.form_questions q2
    where q2.form_id = v_form_id
      and lower(btrim(q2.question_text)) = lower('Thời gian có thể tham gia phỏng vấn')
  )
  on conflict do nothing;

  return null;
end;
$$;

create trigger interview_sessions_ensure_availability_question
  after insert on public.interview_sessions
  for each row execute function public.ensure_interview_availability_question();

revoke all on function public.ensure_interview_availability_question() from public, anon, authenticated;
grant execute on function public.ensure_interview_availability_question() to service_role;

-- Backfill một lần: biểu mẫu của vị trí đang có ca phỏng vấn còn hiệu lực mà thiếu câu hỏi.
insert into public.form_questions (form_id, question_text, question_type, field_key, is_required, order_index)
select f.id, 'Thời gian có thể tham gia phỏng vấn', 'long_text', null, true,
       coalesce((select max(q.order_index) from public.form_questions q where q.form_id = f.id), -1) + 1
from public.application_forms f
where exists (
    select 1 from public.interview_sessions s
    where s.position_id = f.position_id and s.end_time >= now()
  )
  and not exists (
    select 1 from public.form_questions q
    where q.form_id = f.id
      and lower(btrim(q.question_text)) = lower('Thời gian có thể tham gia phỏng vấn')
  );

-- ---------------------------------------------------------------------------
-- 8. Dời hạn việc thì nhắc lại được
-- ---------------------------------------------------------------------------
create or replace function public.reset_task_reminders_on_due_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.task_assignees ta
  set reminded_before_at = null, reminded_overdue_at = null
  where ta.task_id = new.id
    and (ta.reminded_before_at is not null or ta.reminded_overdue_at is not null);
  return null;
end;
$$;

create trigger tasks_reset_reminders_on_due_change
  after update of due_at on public.tasks
  for each row when (old.due_at is distinct from new.due_at)
  execute function public.reset_task_reminders_on_due_change();

revoke all on function public.reset_task_reminders_on_due_change() from public, anon, authenticated;
grant execute on function public.reset_task_reminders_on_due_change() to service_role;

-- ---------------------------------------------------------------------------
-- 9. Thu quyền thừa (phòng thủ chiều sâu)
-- ---------------------------------------------------------------------------
-- RLS vẫn là lớp chính. Các quyền dưới đây không có policy tương ứng nên vô hiệu sẵn; thu hẳn để
-- một policy thêm nhầm về sau không mở ra đường ghi/đọc ngoài ý muốn. Mọi luồng ghi các bảng này
-- đi qua API (service_role) hoặc hàm security definer nên không bị ảnh hưởng.
revoke insert, update, delete on public.application_answers from authenticated;
revoke insert, delete on public.applications from authenticated;     -- giữ update (status) theo policy
revoke insert, update, delete on public.club_members from authenticated;
revoke insert, update, delete on public.events from authenticated;
revoke insert, delete on public.profiles from authenticated;         -- giữ update theo policy

revoke select on public.application_answers from anon;
revoke select on public.applications from anon;
revoke select on public.club_members from anon;
revoke select on public.form_template_questions from anon;
revoke select on public.form_templates from anon;
revoke select on public.interview_assignments from anon;
revoke select on public.interview_session_members from anon;
revoke select on public.profiles from anon;

-- ---------------------------------------------------------------------------
-- 10. Index cho khóa ngoại hay dùng
-- ---------------------------------------------------------------------------
create index if not exists application_answers_question_idx on public.application_answers (question_id);
create index if not exists interview_session_members_member_idx on public.interview_session_members (member_id);
create index if not exists club_members_user_idx on public.club_members (user_id);

commit;
