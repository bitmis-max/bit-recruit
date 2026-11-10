-- Keep one canonical interview availability question per application form.
with ranked_questions as (
  select
    id,
    first_value(id) over (partition by form_id order by order_index, id) as canonical_id,
    row_number() over (partition by form_id order by order_index, id) as question_rank
  from public.form_questions
  where lower(btrim(question_text)) = lower('Thời gian có thể tham gia phỏng vấn')
), duplicate_questions as (
  select id as duplicate_id, canonical_id
  from ranked_questions
  where question_rank > 1
)
delete from public.application_answers duplicate_answer
using duplicate_questions duplicate
where duplicate_answer.question_id = duplicate.duplicate_id
  and exists (
    select 1
    from public.application_answers canonical_answer
    where canonical_answer.application_id = duplicate_answer.application_id
      and canonical_answer.question_id = duplicate.canonical_id
  );

with ranked_questions as (
  select
    id,
    first_value(id) over (partition by form_id order by order_index, id) as canonical_id,
    row_number() over (partition by form_id order by order_index, id) as question_rank
  from public.form_questions
  where lower(btrim(question_text)) = lower('Thời gian có thể tham gia phỏng vấn')
), duplicate_questions as (
  select id as duplicate_id, canonical_id
  from ranked_questions
  where question_rank > 1
)
update public.application_answers answer
set question_id = duplicate.canonical_id
from duplicate_questions duplicate
where answer.question_id = duplicate.duplicate_id;

with ranked_questions as (
  select
    id,
    row_number() over (partition by form_id order by order_index, id) as question_rank
  from public.form_questions
  where lower(btrim(question_text)) = lower('Thời gian có thể tham gia phỏng vấn')
)
delete from public.form_questions question
using ranked_questions ranked
where question.id = ranked.id
  and ranked.question_rank > 1;

insert into public.form_questions (form_id, question_text, question_type, is_required, order_index)
select
  form.id,
  'Thời gian có thể tham gia phỏng vấn',
  'long_text'::question_type,
  true,
  coalesce((select max(question.order_index) + 1 from public.form_questions question where question.form_id = form.id), 0)
from public.application_forms form
where not exists (
  select 1
  from public.form_questions question
  where question.form_id = form.id
    and lower(btrim(question.question_text)) = lower('Thời gian có thể tham gia phỏng vấn')
);

create unique index if not exists form_questions_interview_availability_unique
  on public.form_questions (form_id, lower(btrim(question_text)))
  where lower(btrim(question_text)) = lower('Thời gian có thể tham gia phỏng vấn');
