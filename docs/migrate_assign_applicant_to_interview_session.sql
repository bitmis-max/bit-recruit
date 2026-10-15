-- Assign each applicant to the interview session selected in the application form.
begin;

create or replace function public.submit_application(
  p_position_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_student_code text,
  p_class_name text,
  p_answers jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_team_id uuid;
  v_app_id uuid;
  v_token text;
  v_availability_question_id uuid;
  v_session_id uuid;
begin
  select p.campaign_id, p.team_id into v_campaign_id, v_team_id
  from recruitment_positions p
  join recruitment_campaigns c on c.id = p.campaign_id
  where p.id = p_position_id
    and c.status = 'open'
    and (c.start_date is null or c.start_date <= now())
    and (c.end_date is null or c.end_date >= now());

  if v_campaign_id is null then
    raise exception 'Đợt tuyển không mở hoặc ban tuyển không tồn tại';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_answers) a
    where not exists (
      select 1
      from application_forms f
      join form_questions q on q.form_id = f.id
      where f.position_id = p_position_id
        and q.id = (a->>'question_id')::uuid
    )
  ) then
    raise exception 'Câu trả lời không thuộc biểu mẫu của ban tuyển';
  end if;

  insert into applications (
    campaign_id, position_id, full_name, email, phone, student_code, class_name
  )
  values (
    v_campaign_id, p_position_id, p_full_name, lower(p_email), p_phone,
    p_student_code, p_class_name
  )
  returning id, tracking_token into v_app_id, v_token;

  insert into application_answers (application_id, question_id, answer_text, answer_json)
  select v_app_id,
         (a->>'question_id')::uuid,
         a->>'text',
         a->'json'
  from jsonb_array_elements(p_answers) a;

  select q.id into v_availability_question_id
  from application_forms f
  join form_questions q on q.form_id = f.id
  where f.position_id = p_position_id
    and lower(btrim(q.question_text)) = lower('Thời gian có thể tham gia phỏng vấn')
  order by q.order_index, q.id
  limit 1;

  if v_availability_question_id is not null then
    select (a->'json'->>0)::uuid into v_session_id
    from jsonb_array_elements(p_answers) a
    where (a->>'question_id')::uuid = v_availability_question_id
      and jsonb_typeof(a->'json') = 'array'
      and jsonb_array_length(a->'json') = 1;

    if v_session_id is null or not exists (
      select 1
      from interview_sessions s
      where s.id = v_session_id
        and s.campaign_id = v_campaign_id
        and s.team_id is not distinct from v_team_id
        and s.end_time >= now()
    ) then
      raise exception 'Ca phỏng vấn đã chọn không hợp lệ';
    end if;

    insert into interview_assignments (application_id, session_id)
    values (v_app_id, v_session_id)
    on conflict (application_id, session_id) do nothing;
  end if;

  return v_token;
end;
$$;

grant execute on function public.submit_application(uuid, text, text, text, text, text, jsonb) to anon;

commit;
