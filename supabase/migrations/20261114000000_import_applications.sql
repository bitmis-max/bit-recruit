-- Import ứng viên từ Excel/CSV trên mô hình "một form cho mỗi vị trí".
-- Xem docs/CONTRACT.md (mục 5) và docs/database.md (mục 6.6).
--   * import_applications(p_campaign_id, p_form_name, p_form_description,
--                         p_questions, p_rows) returns jsonb
-- Client không còn insert trực tiếp vào applications/application_answers;
-- toàn bộ việc ghi nằm trong một lần gọi hàm (một transaction: lỗi ở bất kỳ
-- dòng nào thì không ghi gì).

begin;

create or replace function public.import_applications(
  p_campaign_id uuid,
  p_form_name text,
  p_form_description text,
  p_questions text[],
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_rows constant int := 2000;
  c_max_questions constant int := 100;
  c_max_cells constant int := 20000;     -- số dòng x số câu hỏi riêng
  c_avail constant text := 'Thời gian có thể tham gia phỏng vấn';
  c_email_re constant text := '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$';  -- như submit_application
  c_keys constant text[] := array[
    'position', 'session', 'full_name', 'email', 'phone', 'student_code', 'class_name'
  ];

  v_club_id uuid;
  v_status public.campaign_status;
  v_template_id uuid;
  v_form_is_new boolean;
  v_next_order int;
  v_cur int;                 -- số dòng đang xử lý (cho tiền tố "Dòng N: ")
  v_form_name text := coalesce(nullif(btrim(p_form_name), ''), 'Biểu mẫu import');
  v_form_desc text := nullif(btrim(p_form_description), '');

  v_qs text[] := '{}';       -- tiêu đề câu hỏi (đã trim)
  v_qlow text[] := '{}';     -- bản viết thường để so khớp
  v_q text;
  v_i int;

  v_total int;
  v_n int;
  v_row jsonb;
  v_f jsonb;
  v_k text;
  v_val jsonb;
  v_txt text;
  v_limit int;

  v_pos_name text;
  v_sess_name text;
  v_email text;
  v_pos_id uuid;
  v_form_id uuid;
  v_sess_id uuid;
  v_app_id uuid;
  v_qid uuid;

  v_answers jsonb;
  v_ans_key text;
  v_ans_val jsonb;
  v_ans_text text;

  -- cache trong một lần gọi
  v_pos_cache jsonb := '{}';    -- tên vị trí -> position_id
  v_form_cache jsonb := '{}';   -- position_id -> form_id
  v_qmap jsonb := '{}';         -- form_id -> { câu hỏi viết thường -> question_id }
  v_sess_cache jsonb := '{}';   -- position_id|ca -> session_id
  v_fmap jsonb;

  v_imported int := 0;
  v_skipped int := 0;
  v_pos_created int := 0;
  v_form_created int := 0;
  v_sess_created int := 0;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để import ứng viên';
  end if;

  if p_campaign_id is null then
    raise exception 'Vui lòng chọn đợt tuyển để import';
  end if;

  select c.club_id, c.status into v_club_id, v_status
  from public.recruitment_campaigns c
  where c.id = p_campaign_id;

  if v_club_id is null then
    raise exception 'Không tìm thấy đợt tuyển';
  end if;

  if not public.is_club_admin(v_club_id) then
    raise exception 'Bạn không có quyền import ứng viên cho đợt tuyển này';
  end if;

  if char_length(v_form_name) > 200 then
    raise exception 'Tên biểu mẫu tối đa 200 ký tự';
  end if;
  if char_length(v_form_desc) > 2000 then
    raise exception 'Mô tả biểu mẫu tối đa 2000 ký tự';
  end if;

  -- Câu hỏi riêng: trim, bỏ rỗng, không trùng (không phân biệt hoa thường).
  foreach v_q in array coalesce(p_questions, '{}') loop
    v_q := nullif(btrim(v_q), '');
    if v_q is null then
      continue;
    end if;
    if char_length(v_q) > 500 then
      raise exception 'Mỗi câu hỏi tối đa 500 ký tự';
    end if;
    if lower(v_q) = lower(c_avail) then
      raise exception 'Không thể dùng "%" làm câu hỏi riêng vì biểu mẫu đã có sẵn câu hỏi này', c_avail;
    end if;
    if lower(v_q) = any (v_qlow) then
      raise exception 'Câu hỏi bị trùng: %', v_q;
    end if;
    v_qs := v_qs || v_q;
    v_qlow := v_qlow || lower(v_q);
  end loop;

  if coalesce(array_length(v_qs, 1), 0) > c_max_questions then
    raise exception 'Tối đa % câu hỏi riêng mỗi lần import', c_max_questions;
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

  if v_total * coalesce(array_length(v_qs, 1), 0) > c_max_cells then
    raise exception 'Quá nhiều dữ liệu: số dòng x số câu hỏi riêng không được vượt quá % (hiện là % x %)',
      c_max_cells, v_total, coalesce(array_length(v_qs, 1), 0);
  end if;

  -- Hai lần import cùng đợt tuyển không chạy đồng thời (tránh tạo trùng vị trí/form/ca).
  perform pg_advisory_xact_lock(hashtextextended('import_applications:' || p_campaign_id::text, 0));

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
      v_limit := case when v_k in ('position', 'session') then 200 else 500 end;
      if char_length(v_txt) > v_limit then
        raise exception 'Dòng %: trường "%" tối đa % ký tự', v_n, v_k, v_limit;
      end if;
      if v_k = 'email' then
        v_txt := lower(v_txt);
        if v_txt is not null and v_txt !~ c_email_re then
          raise exception 'Dòng %: email không hợp lệ', v_n;
        end if;
      end if;
      v_f := v_f || jsonb_build_object(v_k, v_txt);
    end loop;

    v_pos_name := v_f ->> 'position';
    v_sess_name := v_f ->> 'session';
    v_email := v_f ->> 'email';

    if v_pos_name is null then
      raise exception 'Dòng %: thiếu vị trí tuyển', v_n;
    end if;

    v_answers := v_row -> 'answers';
    if v_answers is not null and jsonb_typeof(v_answers) not in ('object', 'null') then
      raise exception 'Dòng %: câu trả lời phải là một đối tượng', v_n;
    end if;
    if v_answers is not null and jsonb_typeof(v_answers) = 'object' then
      for v_ans_key, v_ans_val in select * from jsonb_each(v_answers) loop
        if array_position(v_qlow, lower(btrim(v_ans_key))) is null then
          raise exception 'Dòng %: câu hỏi "%" không có trong danh sách câu hỏi riêng', v_n, v_ans_key;
        end if;
        if jsonb_typeof(v_ans_val) not in ('string', 'null') then
          raise exception 'Dòng %: câu trả lời cho "%" phải là chuỗi', v_n, v_ans_key;
        end if;
        if char_length(v_ans_val #>> '{}') > 10000 then
          raise exception 'Dòng %: câu trả lời cho "%" tối đa 10000 ký tự', v_n, v_ans_key;
        end if;
      end loop;
    else
      v_answers := '{}';
    end if;

    -- ---- Ghi dữ liệu dòng ----
      -- Vị trí
      v_pos_id := (v_pos_cache ->> lower(v_pos_name))::uuid;
      if v_pos_id is null then
        select p.id into v_pos_id
        from public.recruitment_positions p
        where p.campaign_id = p_campaign_id and lower(btrim(p.name)) = lower(v_pos_name)
        order by p.created_at, p.id
        limit 1;

        if v_pos_id is null then
          insert into public.recruitment_positions (campaign_id, name)
          values (p_campaign_id, v_pos_name)
          returning id into v_pos_id;
          v_pos_created := v_pos_created + 1;
        end if;
        v_pos_cache := v_pos_cache || jsonb_build_object(lower(v_pos_name), v_pos_id);
      end if;

      -- Đơn trùng (position_id, email): bỏ qua cả dòng (trùng trong file cũng
      -- bị bắt ở đây vì dòng trước đã được thêm).
      if v_email is not null and exists (
        select 1 from public.applications a
        where a.position_id = v_pos_id and a.email = v_email
      ) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      -- Form của vị trí + các câu hỏi riêng (chỉ làm một lần cho mỗi vị trí)
      v_form_id := (v_form_cache ->> v_pos_id::text)::uuid;
      if v_form_id is null then
        select f.id into v_form_id
        from public.application_forms f
        where f.position_id = v_pos_id;

        v_form_is_new := v_form_id is null;
        if v_form_is_new then
          -- Form mới: chép mẫu mặc định như create_application_form_from_template
          -- (câu hỏi mẫu kể cả field_key, rồi câu hỏi chọn ca). Không có mẫu mặc
          -- định thì form trống.
          select t.id into v_template_id from public.form_templates t where t.is_default limit 1;

          insert into public.application_forms (position_id, source_template_id, name, description)
          values (v_pos_id, v_template_id, v_form_name, v_form_desc)
          returning id into v_form_id;
          v_form_created := v_form_created + 1;

          if v_template_id is not null then
            insert into public.form_questions (
              form_id, question_text, question_type, field_key, options, is_required, order_index
            )
            select
              v_form_id, q.question_text, q.question_type, q.field_key, q.options, q.is_required,
              row_number() over (order by q.order_index, q.created_at, q.id)::int - 1
            from public.form_template_questions q
            where q.template_id = v_template_id
              and lower(btrim(q.question_text)) <> lower(c_avail);

            select coalesce(max(q.order_index) + 1, 0) into v_next_order
            from public.form_questions q where q.form_id = v_form_id;

            insert into public.form_questions (
              form_id, question_text, question_type, field_key, is_required, order_index
            )
            values (v_form_id, c_avail, 'long_text', null, true, v_next_order);
          end if;
        end if;
        v_form_cache := v_form_cache || jsonb_build_object(v_pos_id::text, v_form_id);

        v_fmap := '{}';
        for v_i in 1..coalesce(array_length(v_qs, 1), 0) loop
          select q.id into v_qid
          from public.form_questions q
          where q.form_id = v_form_id
            and q.field_key is null
            and lower(btrim(q.question_text)) = v_qlow[v_i]
          order by q.order_index, q.created_at, q.id
          limit 1;

          if v_qid is null then
            if not v_form_is_new and v_status = 'open' then
              raise exception 'Đợt tuyển đang mở: không thể thêm câu hỏi mới vào biểu mẫu đang nhận đơn của vị trí "%". Hãy đóng đợt tuyển trước hoặc bỏ các cột câu hỏi riêng chưa có trong biểu mẫu.', v_pos_name;
            end if;
            insert into public.form_questions (form_id, question_text, question_type, is_required, order_index)
            select v_form_id, v_qs[v_i], 'text', false, coalesce(max(q.order_index) + 1, 0)
            from public.form_questions q
            where q.form_id = v_form_id
            returning id into v_qid;
          end if;
          v_fmap := v_fmap || jsonb_build_object(v_qlow[v_i], v_qid);
        end loop;
        v_qmap := v_qmap || jsonb_build_object(v_form_id::text, v_fmap);
      end if;

      -- Đơn ứng tuyển
      insert into public.applications (
        campaign_id, position_id, full_name, email, phone, student_code, class_name
      )
      values (
        p_campaign_id, v_pos_id,
        v_f ->> 'full_name', v_email, v_f ->> 'phone', v_f ->> 'student_code', v_f ->> 'class_name'
      )
      returning id into v_app_id;

      -- Câu trả lời
      for v_ans_key, v_ans_val in select * from jsonb_each(v_answers) loop
        v_ans_text := nullif(btrim(v_ans_val #>> '{}'), '');
        if v_ans_text is null then
          continue;
        end if;
        v_qid := ((v_qmap -> v_form_id::text) ->> lower(btrim(v_ans_key)))::uuid;
        insert into public.application_answers (application_id, question_id, answer_text)
        values (v_app_id, v_qid, v_ans_text)
        on conflict (application_id, question_id) do nothing;
      end loop;

      -- Ca phỏng vấn + gán ca
      if v_sess_name is not null then
        v_sess_id := (v_sess_cache ->> (v_pos_id::text || '|' || v_sess_name))::uuid;
        if v_sess_id is null then
          select s.id into v_sess_id
          from public.interview_sessions s
          where s.campaign_id = p_campaign_id
            and s.position_id = v_pos_id
            and s.note = v_sess_name
          order by s.created_at, s.id
          limit 1;

          if v_sess_id is null then
            insert into public.interview_sessions (campaign_id, position_id, round, start_time, end_time, note)
            values (p_campaign_id, v_pos_id, 1, now(), now() + interval '1 hour', v_sess_name)
            returning id into v_sess_id;
            v_sess_created := v_sess_created + 1;
          end if;
          v_sess_cache := v_sess_cache || jsonb_build_object(v_pos_id::text || '|' || v_sess_name, v_sess_id);
        end if;

        insert into public.interview_assignments (application_id, session_id)
        values (v_app_id, v_sess_id);
      end if;

      v_imported := v_imported + 1;
  end loop;
  exception
    when others then
      -- Một khối bắt lỗi cho cả vòng lặp (không savepoint mỗi dòng). Lỗi đã có
      -- số dòng hoặc là lỗi đợt đang mở thì giữ nguyên; lỗi từ DB/trigger thì
      -- thêm tiền tố "Dòng N: ".
      if v_cur is null or sqlerrm like 'Dòng %' or sqlerrm like 'Đợt tuyển đang mở%' then
        raise;
      end if;
      raise exception 'Dòng %: %', v_cur, sqlerrm;
  end;

  return jsonb_build_object(
    'imported', v_imported,
    'skipped_duplicates', v_skipped,
    'positions_created', v_pos_created,
    'forms_created', v_form_created,
    'sessions_created', v_sess_created
  );
end;
$$;

revoke all on function public.import_applications(uuid, text, text, text[], jsonb) from public, anon;
grant execute on function public.import_applications(uuid, text, text, text[], jsonb) to authenticated, service_role;

commit;
