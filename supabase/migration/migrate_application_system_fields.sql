-- Represent applicant profile fields as form questions and store their answers
-- in the corresponding applications columns.
-- Apply after migrate_form_templates.sql and migrate_interview_sessions_to_positions.sql.
begin;

-- Requiredness comes from form_questions.is_required; mapped profile fields may be optional.
alter table public.applications alter column full_name drop not null;
alter table public.applications alter column email drop not null;

alter table public.form_questions
  add column if not exists field_key text;
alter table public.form_template_questions
  add column if not exists field_key text;

alter table public.form_questions
  drop constraint if exists form_questions_field_key_check;
alter table public.form_questions
  add constraint form_questions_field_key_check
  check (field_key is null or field_key in ('full_name', 'email', 'phone', 'student_code', 'class_name'));
alter table public.form_template_questions
  drop constraint if exists form_template_questions_field_key_check;
alter table public.form_template_questions
  add constraint form_template_questions_field_key_check
  check (field_key is null or field_key in ('full_name', 'email', 'phone', 'student_code', 'class_name'));

create unique index if not exists form_questions_unique_field_key
  on public.form_questions (form_id, field_key) where field_key is not null;
create unique index if not exists form_template_questions_unique_field_key
  on public.form_template_questions (template_id, field_key) where field_key is not null;

-- Make room before existing custom questions, once per form/template.
update public.form_questions q
set order_index = order_index + 5
where not exists (
  select 1 from public.form_questions system_q
  where system_q.form_id = q.form_id and system_q.field_key is not null
);
update public.form_template_questions q
set order_index = order_index + 5
where not exists (
  select 1 from public.form_template_questions system_q
  where system_q.template_id = q.template_id and system_q.field_key is not null
);

-- Add the fixed applicant fields to every existing form and reusable template.
insert into public.form_questions (form_id, question_text, question_type, field_key, is_required, order_index)
select f.id, fields.question_text, 'text'::public.question_type, fields.field_key, fields.is_required, fields.order_index
from public.application_forms f
cross join (values
  ('Họ và tên', 'full_name', true, 0),
  ('Email liên hệ', 'email', true, 1),
  ('Số điện thoại', 'phone', false, 2),
  ('Mã số sinh viên', 'student_code', false, 3),
  ('Lớp', 'class_name', false, 4)
) as fields(question_text, field_key, is_required, order_index)
where not exists (
  select 1 from public.form_questions existing
  where existing.form_id = f.id and existing.field_key = fields.field_key
);

insert into public.form_template_questions (template_id, question_text, question_type, field_key, is_required, order_index)
select t.id, fields.question_text, 'text'::public.question_type, fields.field_key, fields.is_required, fields.order_index
from public.form_templates t
cross join (values
  ('Họ và tên', 'full_name', true, 0),
  ('Email liên hệ', 'email', true, 1),
  ('Số điện thoại', 'phone', false, 2),
  ('Mã số sinh viên', 'student_code', false, 3),
  ('Lớp', 'class_name', false, 4)
) as fields(question_text, field_key, is_required, order_index)
where not exists (
  select 1 from public.form_template_questions existing
  where existing.template_id = t.id and existing.field_key = fields.field_key
);

-- Replace the old RPC contract: applicant data now arrives as question_id/text/json rows.
drop function if exists public.submit_application(uuid, text, text, text, text, text, jsonb);

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
      ) then raise exception 'Lựa chọn không hợp lệ cho câu hỏi: %', v_q.question_text; end if;

      if v_q.question_type = 'multi_choice' then
        if v_json is not null and jsonb_typeof(v_json) <> 'null' and jsonb_typeof(v_json) <> 'array' then
          raise exception 'Câu trả lời nhiều lựa chọn không hợp lệ: %', v_q.question_text;
        end if;
        if jsonb_typeof(v_json) = 'array' and exists (
          select 1 from jsonb_array_elements_text(v_json) answer_option
          where not exists (select 1 from jsonb_array_elements_text(coalesce(v_q.options, '[]'::jsonb)) option where option = answer_option)
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
      end case;
    end if;
  end loop;

  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Email không hợp lệ';
  end if;

  insert into public.applications (campaign_id, position_id, full_name, email, phone, student_code, class_name)
  values (v_campaign_id, v_position_id, v_full_name, v_email, v_phone, v_student_code, v_class_name)
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
grant execute on function public.submit_application(uuid, jsonb) to anon, authenticated;

commit;
