-- Save all questions and their ordering for one recruitment form in a single statement.
-- Apply after migrate_club_roles_to_members.sql and migrate_application_system_fields.sql.
begin;

create or replace function public.save_application_form_questions(
  p_form_id uuid,
  p_questions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_question_count bigint;
  v_payload_count bigint;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để lưu biểu mẫu';
  end if;

  select c.club_id into v_club_id
  from public.application_forms f
  join public.recruitment_positions p on p.id = f.position_id
  join public.recruitment_campaigns c on c.id = p.campaign_id
  where f.id = p_form_id;

  if v_club_id is null or not public.is_club_admin(v_club_id) then
    raise exception 'Bạn không có quyền chỉnh sửa biểu mẫu này';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'Danh sách câu hỏi không hợp lệ';
  end if;

  select count(*) into v_question_count
  from public.form_questions q where q.form_id = p_form_id;
  select count(*) into v_payload_count from jsonb_array_elements(p_questions);

  if v_payload_count <> v_question_count then
    raise exception 'Danh sách câu hỏi đã thay đổi. Hãy tải lại biểu mẫu rồi thử lại';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_questions) as item(
      id uuid, question_text text, question_type public.question_type,
      options jsonb, is_required boolean, order_index integer
    )
    group by item.id having count(*) > 1
  ) then
    raise exception 'Danh sách có câu hỏi trùng lặp';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_questions) as item(
      id uuid, question_text text, question_type public.question_type,
      options jsonb, is_required boolean, order_index integer
    )
    group by item.order_index having count(*) > 1
  ) then
    raise exception 'Thứ tự câu hỏi không hợp lệ';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_questions) as item(
      id uuid, question_text text, question_type public.question_type,
      options jsonb, is_required boolean, order_index integer
    )
    left join public.form_questions q on q.id = item.id and q.form_id = p_form_id
    where q.id is null
       or nullif(btrim(item.question_text), '') is null
       or item.order_index < 0
       or (item.question_type in ('single_choice', 'multi_choice')
           and (coalesce(jsonb_typeof(item.options), 'null') <> 'array' or jsonb_array_length(coalesce(item.options, '[]'::jsonb)) < 2))
  ) then
    raise exception 'Một hoặc nhiều câu hỏi không hợp lệ';
  end if;

  update public.form_questions q
  set question_text = btrim(item.question_text),
      question_type = item.question_type,
      options = case when item.question_type in ('single_choice', 'multi_choice') then item.options else null end,
      is_required = item.is_required,
      order_index = item.order_index
  from jsonb_to_recordset(p_questions) as item(
    id uuid, question_text text, question_type public.question_type,
    options jsonb, is_required boolean, order_index integer
  )
  where q.id = item.id and q.form_id = p_form_id;
end;
$$;

revoke all on function public.save_application_form_questions(uuid, jsonb) from public;
grant execute on function public.save_application_form_questions(uuid, jsonb) to authenticated;

commit;
