-- Create a form and copy its selected template questions in one database transaction.
-- This avoids multiple client round trips and per-row form_questions RLS checks.
-- Apply after migrate_form_templates.sql, migrate_application_system_fields.sql,
-- and migrate_club_roles_to_members.sql.
begin;

create or replace function public.create_application_form_from_template(
  p_position_id uuid,
  p_template_id uuid,
  p_name text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_form_id uuid;
  v_form jsonb;
  v_questions jsonb;
  v_next_order int;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để tạo biểu mẫu';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Tên biểu mẫu không được để trống';
  end if;

  select c.club_id into v_club_id
  from public.recruitment_positions p
  join public.recruitment_campaigns c on c.id = p.campaign_id
  where p.id = p_position_id;

  if v_club_id is null or not public.is_club_admin(v_club_id) then
    raise exception 'Bạn không có quyền tạo biểu mẫu cho vị trí này';
  end if;

  if not exists (select 1 from public.form_templates t where t.id = p_template_id) then
    raise exception 'Template không tồn tại hoặc bạn không có quyền truy cập';
  end if;

  insert into public.application_forms (position_id, source_template_id, name, description)
  values (p_position_id, p_template_id, btrim(p_name), nullif(btrim(p_description), ''))
  returning id into v_form_id;

  insert into public.form_questions (
    form_id, question_text, question_type, field_key, options, is_required, order_index
  )
  select
    v_form_id, q.question_text, q.question_type, q.field_key, q.options, q.is_required,
    row_number() over (order by q.order_index, q.created_at, q.id)::int - 1
  from public.form_template_questions q
  where q.template_id = p_template_id
    and lower(btrim(q.question_text)) <> lower('Thời gian có thể tham gia phỏng vấn')
  order by q.order_index, q.created_at, q.id;

  select coalesce(max(q.order_index) + 1, 0) into v_next_order
  from public.form_questions q where q.form_id = v_form_id;

  insert into public.form_questions (
    form_id, question_text, question_type, field_key, is_required, order_index
  )
  values (
    v_form_id, 'Thời gian có thể tham gia phỏng vấn', 'long_text', null, true, v_next_order
  );

  select to_jsonb(f) into v_form
  from public.application_forms f where f.id = v_form_id;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.order_index, q.id), '[]'::jsonb)
  into v_questions
  from public.form_questions q where q.form_id = v_form_id;

  return jsonb_build_object('form', v_form, 'questions', v_questions);
end;
$$;

revoke all on function public.create_application_form_from_template(uuid, uuid, text, text) from public;
grant execute on function public.create_application_form_from_template(uuid, uuid, text, text) to authenticated;

commit;
