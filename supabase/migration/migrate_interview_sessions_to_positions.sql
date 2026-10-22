-- Make each interview session belong to one recruitment position.
begin;

alter table public.interview_sessions
  add column if not exists position_id uuid references public.recruitment_positions(id) on delete cascade;

-- Safely infer the position for sessions that already have applicants assigned.
with uniquely_assigned_positions as (
  select ia.session_id, (array_agg(distinct a.position_id))[1] as position_id
  from public.interview_assignments ia
  join public.applications a on a.id = ia.application_id
  group by ia.session_id
  having count(distinct a.position_id) = 1
)
update public.interview_sessions s
set position_id = u.position_id
from uniquely_assigned_positions u
where s.id = u.session_id and s.position_id is null;

-- For unassigned sessions, infer only when the old campaign/team pair maps to one position.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'interview_sessions'
      and column_name = 'team_id'
  ) then
    with unique_campaign_team_positions as (
      select p.campaign_id, p.team_id, (array_agg(p.id order by p.id))[1] as position_id
      from public.recruitment_positions p
      group by p.campaign_id, p.team_id
      having count(*) = 1
    )
    update public.interview_sessions s
    set position_id = p.position_id
    from unique_campaign_team_positions p
    where s.position_id is null
      and s.campaign_id = p.campaign_id
      and s.team_id is not distinct from p.team_id;
  end if;
end;
$$;

-- Drop the legacy relation after backfilling. Column-owned indexes and constraints are dropped by PostgreSQL.
alter table public.interview_sessions drop column if exists team_id;

create index if not exists interview_sessions_position_start_idx
  on public.interview_sessions (position_id, start_time);

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
  v_app_id uuid;
  v_token text;
  v_availability_question_id uuid;
  v_session_id uuid;
begin
  select p.campaign_id into v_campaign_id
  from public.recruitment_positions p
  join public.recruitment_campaigns c on c.id = p.campaign_id
  where p.id = p_position_id
    and c.status = 'open'
    and (c.start_date is null or c.start_date <= now())
    and (c.end_date is null or c.end_date >= now());

  if v_campaign_id is null then
    raise exception 'Campaign is not open or position does not exist';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_answers) a
    where not exists (
      select 1
      from public.application_forms f
      join public.form_questions q on q.form_id = f.id
      where f.position_id = p_position_id
        and q.id = (a->>'question_id')::uuid
    )
  ) then
    raise exception 'An answer does not belong to this position form';
  end if;

  insert into public.applications (
    campaign_id, position_id, full_name, email, phone, student_code, class_name
  )
  values (
    v_campaign_id, p_position_id, p_full_name, lower(p_email), p_phone,
    p_student_code, p_class_name
  )
  returning id, tracking_token into v_app_id, v_token;

  insert into public.application_answers (application_id, question_id, answer_text, answer_json)
  select v_app_id, (a->>'question_id')::uuid, a->>'text', a->'json'
  from jsonb_array_elements(p_answers) a;

  select q.id into v_availability_question_id
  from public.application_forms f
  join public.form_questions q on q.form_id = f.id
  where f.position_id = p_position_id
    and lower(btrim(q.question_text)) = lower('Thời gian có thể tham gia phỏng vấn')
  order by q.order_index, q.id
  limit 1;

  if v_availability_question_id is not null and exists (
    select 1 from public.interview_sessions s
    where s.position_id = p_position_id and s.end_time >= now()
  ) then
    select (a->'json'->>0)::uuid into v_session_id
    from jsonb_array_elements(p_answers) a
    where (a->>'question_id')::uuid = v_availability_question_id
      and jsonb_typeof(a->'json') = 'array'
      and jsonb_array_length(a->'json') = 1;

    if v_session_id is null or not exists (
      select 1
      from public.interview_sessions s
      where s.id = v_session_id
        and s.campaign_id = v_campaign_id
        and s.position_id = p_position_id
        and s.end_time >= now()
    ) then
      raise exception 'Selected interview session is not valid';
    end if;

    insert into public.interview_assignments (application_id, session_id)
    values (v_app_id, v_session_id)
    on conflict (application_id, session_id) do nothing;
  end if;

  return v_token;
end;
$$;

grant execute on function public.submit_application(uuid, text, text, text, text, text, jsonb) to anon;

commit;
