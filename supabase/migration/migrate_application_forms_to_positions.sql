-- Run once on an existing database created from the previous database.md.
-- Each old form is assigned to the first position that used it. If another
-- position shared that form, this migration clones the form and its questions
-- and moves that position's answers to the cloned questions.
begin;

-- Old policies often reference application_forms.campaign_id. Remove policies
-- on these two tables and recreate them below against position_id.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('application_forms', 'form_questions')
  loop
    execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end
$$;

-- Stop instead of discarding answers that do not match the form assigned to
-- their application's position.
do $$
begin
  if exists (
    select 1
    from application_answers aa
    join applications a on a.id = aa.application_id
    join recruitment_positions p on p.id = a.position_id
    join form_questions q on q.id = aa.question_id
    where p.form_id is null or q.form_id <> p.form_id
  ) then
    raise exception 'Migration stopped: some application answers do not match the form currently assigned to their position';
  end if;
end
$$;

alter table application_forms add column position_id uuid;

create temporary table _application_form_position_map (
  old_form_id uuid not null,
  position_id uuid primary key,
  new_form_id uuid not null unique
) on commit drop;

-- Keep the existing form for the first position that references it.
insert into _application_form_position_map (old_form_id, position_id, new_form_id)
select form_id, position_id, form_id
from (
  select p.form_id,
         p.id as position_id,
         row_number() over (partition by p.form_id order by p.created_at, p.id) as form_rank
  from recruitment_positions p
  where p.form_id is not null
) ranked
where form_rank = 1;

update application_forms f
set position_id = m.position_id
from _application_form_position_map m
where f.id = m.new_form_id;

-- Give each additional position its own form row.
do $$
declare
  form_row record;
  cloned_form_id uuid;
begin
  for form_row in
    select p.id as position_id, f.id as old_form_id, f.campaign_id,
           f.name, f.description, f.created_at
    from recruitment_positions p
    join application_forms f on f.id = p.form_id
    where not exists (
      select 1 from _application_form_position_map m where m.position_id = p.id
    )
  loop
    insert into application_forms (campaign_id, name, description, created_at)
    values (form_row.campaign_id, form_row.name, form_row.description, form_row.created_at)
    returning id into cloned_form_id;

    update application_forms set position_id = form_row.position_id where id = cloned_form_id;
    insert into _application_form_position_map (old_form_id, position_id, new_form_id)
    values (form_row.old_form_id, form_row.position_id, cloned_form_id);
  end loop;
end
$$;

create temporary table _application_form_question_map (
  new_form_id uuid not null,
  old_question_id uuid not null,
  new_question_id uuid not null,
  primary key (new_form_id, old_question_id)
) on commit drop;

-- Existing questions stay with the original form.
insert into _application_form_question_map (new_form_id, old_question_id, new_question_id)
select m.new_form_id, q.id, q.id
from _application_form_position_map m
join form_questions q on q.form_id = m.old_form_id
where m.new_form_id = m.old_form_id;

-- Clone questions for each copied form and remember their new IDs.
do $$
declare
  question_row record;
  cloned_question_id uuid;
begin
  for question_row in
    select m.new_form_id, q.id as old_question_id, q.question_text, q.question_type, q.options,
           q.is_required, q.order_index, q.created_at
    from _application_form_position_map m
    join form_questions q on q.form_id = m.old_form_id
    where m.new_form_id <> m.old_form_id
  loop
    insert into form_questions (form_id, question_text, question_type, options, is_required, order_index, created_at)
    values (question_row.new_form_id, question_row.question_text, question_row.question_type,
            question_row.options, question_row.is_required, question_row.order_index,
            question_row.created_at)
    returning id into cloned_question_id;

    insert into _application_form_question_map (new_form_id, old_question_id, new_question_id)
    values (question_row.new_form_id, question_row.old_question_id, cloned_question_id);
  end loop;
end
$$;

-- Repoint each application's answers to the question copy for its position.
update application_answers aa
set question_id = qm.new_question_id
from applications a
join _application_form_position_map fm on fm.position_id = a.position_id
join _application_form_question_map qm on qm.new_form_id = fm.new_form_id
where aa.application_id = a.id
  and aa.question_id = qm.old_question_id;

-- Unused campaign-level forms have no position after the migration. Remove them.
delete from application_forms where position_id is null;

alter table recruitment_positions drop constraint if exists recruitment_positions_form_id_fkey;
alter table recruitment_positions drop column form_id;

alter table application_forms drop constraint if exists application_forms_campaign_id_fkey;
alter table application_forms drop column campaign_id;
alter table application_forms alter column position_id set not null;
alter table application_forms
  add constraint application_forms_position_id_fkey
  foreign key (position_id) references recruitment_positions(id) on delete cascade;
alter table application_forms
  add constraint application_forms_position_id_key unique (position_id);

create policy "staff read application forms" on application_forms
  for select to authenticated using (
    exists (
      select 1 from recruitment_positions p
      join recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id and is_club_member(c.club_id)
    )
  );

create policy "admin write application forms" on application_forms
  for all to authenticated using (
    exists (
      select 1 from recruitment_positions p
      join recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id and is_club_admin(c.club_id)
    )
  ) with check (
    exists (
      select 1 from recruitment_positions p
      join recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id and is_club_admin(c.club_id)
    )
  );

create policy "public read open application forms" on application_forms
  for select to anon, authenticated using (
    exists (
      select 1 from recruitment_positions p
      join recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id
        and c.status = 'open'
        and (c.start_date is null or c.start_date <= now())
        and (c.end_date is null or c.end_date >= now())
    )
  );

create policy "staff read form questions" on form_questions
  for select to authenticated using (
    exists (
      select 1 from application_forms f
      join recruitment_positions p on p.id = f.position_id
      join recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id and is_club_member(c.club_id)
    )
  );

create policy "admin write form questions" on form_questions
  for all to authenticated using (
    exists (
      select 1 from application_forms f
      join recruitment_positions p on p.id = f.position_id
      join recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id and is_club_admin(c.club_id)
    )
  ) with check (
    exists (
      select 1 from application_forms f
      join recruitment_positions p on p.id = f.position_id
      join recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id and is_club_admin(c.club_id)
    )
  );

create policy "public read open form questions" on form_questions
  for select to anon, authenticated using (
    exists (
      select 1 from application_forms f
      join recruitment_positions p on p.id = f.position_id
      join recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id
        and c.status = 'open'
        and (c.start_date is null or c.start_date <= now())
        and (c.end_date is null or c.end_date >= now())
    )
  );

-- Keep the RPC contract, but reject question IDs that belong to another form.
create or replace function submit_application(
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

grant execute on function submit_application(uuid, text, text, text, text, text, jsonb) to anon;

commit;
