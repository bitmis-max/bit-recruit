-- Baseline schema for the BIT recruitment system.
-- Apply this single migration to a fresh Supabase project. It replaces the
-- previous incremental scripts (archived in supabase/migration/legacy).

begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.club_role as enum ('owner', 'admin', 'organizer');
create type public.campaign_status as enum ('draft', 'open', 'closed', 'done');
create type public.question_type as enum (
  'text', 'long_text', 'single_choice', 'multi_choice', 'number', 'date', 'file'
);
create type public.application_status as enum (
  'submitted', 'screening', 'interview', 'passed', 'failed', 'withdrawn'
);
create type public.assignment_status as enum (
  'scheduled', 'attended', 'absent', 'rescheduled'
);
create type public.interview_result as enum ('pending', 'pass', 'fail', 'consider');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  created_at timestamptz not null default now()
);

create table public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  role public.club_role not null default 'organizer',
  student_code text,
  full_name text not null,
  class_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (club_id, student_code),
  unique (club_id, user_id)
);

create table public.recruitment_campaigns (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  description text,
  start_date timestamptz,
  end_date timestamptz,
  status public.campaign_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);

create table public.recruitment_positions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.recruitment_campaigns(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.form_template_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.form_templates(id) on delete cascade,
  question_text text not null,
  question_type public.question_type not null default 'text',
  field_key text check (field_key is null or field_key in ('full_name', 'email', 'phone', 'student_code', 'class_name')),
  options jsonb,
  is_required boolean not null default false,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table public.application_forms (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null unique references public.recruitment_positions(id) on delete cascade,
  source_template_id uuid references public.form_templates(id) on delete set null,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.form_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.application_forms(id) on delete cascade,
  question_text text not null,
  question_type public.question_type not null default 'text',
  field_key text check (field_key is null or field_key in ('full_name', 'email', 'phone', 'student_code', 'class_name')),
  options jsonb,
  is_required boolean not null default false,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.recruitment_campaigns(id) on delete cascade,
  position_id uuid not null references public.recruitment_positions(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  student_code text,
  class_name text,
  status public.application_status not null default 'submitted',
  tracking_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (position_id, email)
);

create table public.application_answers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  question_id uuid not null references public.form_questions(id) on delete cascade,
  answer_text text,
  answer_json jsonb,
  unique (application_id, question_id)
);

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.recruitment_campaigns(id) on delete cascade,
  position_id uuid not null references public.recruitment_positions(id) on delete cascade,
  round int not null default 1,
  start_time timestamptz not null,
  end_time timestamptz not null,
  location text,
  meeting_link text,
  capacity int check (capacity is null or capacity > 0),
  note text,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table public.interview_assignments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  status public.assignment_status not null default 'scheduled',
  score numeric(4,2),
  comment text,
  result public.interview_result not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, session_id)
);

create table public.interview_session_members (
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  member_id uuid not null references public.club_members(id) on delete cascade,
  duty text,
  primary key (session_id, member_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null,
  description text,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.google_mail_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_refresh_token text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index teams_club_idx on public.teams (club_id);
create index club_members_club_idx on public.club_members (club_id);
create index club_members_club_team_idx on public.club_members (club_id, team_id);
create index recruitment_campaigns_club_idx on public.recruitment_campaigns (club_id);
create index recruitment_positions_campaign_idx on public.recruitment_positions (campaign_id);
create index form_template_questions_template_order_idx on public.form_template_questions (template_id, order_index);
create unique index form_templates_one_default_idx on public.form_templates (is_default) where is_default;
create index form_questions_form_order_idx on public.form_questions (form_id, order_index);
create unique index form_questions_unique_field_key on public.form_questions (form_id, field_key) where field_key is not null;
create unique index form_template_questions_unique_field_key on public.form_template_questions (template_id, field_key) where field_key is not null;
create unique index form_questions_interview_availability_unique
  on public.form_questions (form_id, lower(btrim(question_text)))
  where lower(btrim(question_text)) = lower('Thời gian có thể tham gia phỏng vấn');
create index applications_campaign_status_idx on public.applications (campaign_id, status);
create index applications_position_idx on public.applications (position_id);
create index application_answers_application_idx on public.application_answers (application_id);
create index interview_sessions_position_start_idx on public.interview_sessions (position_id, start_time);
create index interview_assignments_session_idx on public.interview_assignments (session_id);
create index events_club_sort_order_idx on public.events (club_id, sort_order, created_at desc);

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_club_member(p_club_id uuid)
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
  );
$$;

create or replace function public.is_club_staff(p_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_club_member(p_club_id);
$$;

create or replace function public.is_club_admin(p_club_id uuid)
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
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.team_belongs_to_club(p_team_id uuid, p_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_team_id is null or exists (
    select 1 from public.teams t
    where t.id = p_team_id and t.club_id = p_club_id
  );
$$;

revoke all on function public.is_club_member(uuid) from public;
revoke all on function public.is_club_staff(uuid) from public;
revoke all on function public.is_club_admin(uuid) from public;
revoke all on function public.team_belongs_to_club(uuid, uuid) from public;
grant execute on function public.is_club_member(uuid) to authenticated, service_role;
grant execute on function public.is_club_staff(uuid) to authenticated, service_role;
grant execute on function public.is_club_admin(uuid) to authenticated, service_role;
grant execute on function public.team_belongs_to_club(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recruitment_campaigns_set_updated_at
  before update on public.recruitment_campaigns
  for each row execute function public.set_updated_at();
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();
create trigger interview_assignments_set_updated_at
  before update on public.interview_assignments
  for each row execute function public.set_updated_at();
create trigger form_templates_set_updated_at
  before update on public.form_templates
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.enforce_application_position_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.recruitment_positions p
    where p.id = new.position_id and p.campaign_id = new.campaign_id
  ) then
    raise exception 'Vị trí tuyển không thuộc đợt tuyển đã chọn';
  end if;
  return new;
end;
$$;

create trigger applications_position_campaign_check
  before insert or update of campaign_id, position_id on public.applications
  for each row execute function public.enforce_application_position_campaign();

create or replace function public.enforce_session_position_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.recruitment_positions p
    where p.id = new.position_id and p.campaign_id = new.campaign_id
  ) then
    raise exception 'Ca phỏng vấn phải thuộc một vị trí trong đợt tuyển đã chọn';
  end if;
  return new;
end;
$$;

create trigger interview_sessions_position_campaign_check
  before insert or update of campaign_id, position_id on public.interview_sessions
  for each row execute function public.enforce_session_position_campaign();

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

  select s.capacity into v_capacity
  from public.interview_sessions s
  where s.id = new.session_id;

  if v_capacity is not null then
    select count(*) into v_used
    from public.interview_assignments ia
    where ia.session_id = new.session_id
      and (tg_op = 'INSERT' or ia.id <> new.id);

    if v_used >= v_capacity then
      raise exception 'Ca phỏng vấn đã đủ sức chứa';
    end if;
  end if;

  return new;
end;
$$;

create trigger interview_assignments_integrity_check
  before insert or update of application_id, session_id on public.interview_assignments
  for each row execute function public.enforce_interview_assignment_integrity();

create or replace function public.enforce_session_member_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.interview_sessions s
    join public.recruitment_campaigns c on c.id = s.campaign_id
    join public.club_members m on m.id = new.member_id
    where s.id = new.session_id
      and m.club_id = c.club_id
      and m.is_active
  ) then
    raise exception 'Thành viên hỗ trợ phải thuộc CLB của ca phỏng vấn và đang hoạt động';
  end if;
  return new;
end;
$$;

create trigger interview_session_members_club_check
  before insert or update of session_id, member_id on public.interview_session_members
  for each row execute function public.enforce_session_member_club();

-- ---------------------------------------------------------------------------
-- Applicant flows
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
grant execute on function public.submit_application(uuid, jsonb) to anon, authenticated, service_role;

create or replace function public.get_application_by_token(p_token text)
returns table (
  full_name text,
  position_name text,
  status public.application_status,
  submitted_at timestamptz,
  interview_start timestamptz,
  interview_location text,
  interview_link text
)
language sql
security definer
stable
set search_path = public
as $$
  select a.full_name,
         p.name,
         a.status,
         a.submitted_at,
         s.start_time,
         s.location,
         s.meeting_link
  from public.applications a
  join public.recruitment_positions p on p.id = a.position_id
  left join public.interview_assignments ia on ia.application_id = a.id
  left join public.interview_sessions s on s.id = ia.session_id
  where a.tracking_token = p_token;
$$;

revoke all on function public.get_application_by_token(text) from public;
grant execute on function public.get_application_by_token(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin form flows
-- ---------------------------------------------------------------------------

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
grant execute on function public.create_application_form_from_template(uuid, uuid, text, text) to authenticated, service_role;

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
grant execute on function public.save_application_form_questions(uuid, jsonb) to authenticated, service_role;

create or replace function public.can_delete_empty_interview_session(p_session_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.interview_sessions s
    join public.recruitment_campaigns c on c.id = s.campaign_id
    where s.id = p_session_id
      and public.is_club_admin(c.club_id)
      and not exists (
        select 1 from public.interview_assignments a where a.session_id = s.id
      )
      and not exists (
        select 1 from public.interview_session_members m where m.session_id = s.id
      )
  );
$$;

revoke all on function public.can_delete_empty_interview_session(uuid) from public;
grant execute on function public.can_delete_empty_interview_session(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.teams enable row level security;
alter table public.club_members enable row level security;
alter table public.recruitment_campaigns enable row level security;
alter table public.recruitment_positions enable row level security;
alter table public.form_templates enable row level security;
alter table public.form_template_questions enable row level security;
alter table public.application_forms enable row level security;
alter table public.form_questions enable row level security;
alter table public.applications enable row level security;
alter table public.application_answers enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_assignments enable row level security;
alter table public.interview_session_members enable row level security;
alter table public.events enable row level security;
alter table public.google_mail_tokens enable row level security;

grant select, insert, update on public.profiles to authenticated, service_role;
grant select on public.clubs to anon, authenticated, service_role;
grant select on public.teams to anon, authenticated, service_role;
grant insert, update, delete on public.teams to authenticated, service_role;
grant select on public.club_members to authenticated, service_role;
grant select on public.recruitment_campaigns to anon, authenticated, service_role;
grant insert, update, delete on public.recruitment_campaigns to authenticated, service_role;
grant select on public.recruitment_positions to anon, authenticated, service_role;
grant insert, update, delete on public.recruitment_positions to authenticated, service_role;
grant select on public.form_templates to authenticated, service_role;
grant insert, update, delete on public.form_templates to authenticated, service_role;
grant select on public.form_template_questions to authenticated, service_role;
grant insert, update, delete on public.form_template_questions to authenticated, service_role;
grant select on public.application_forms to anon, authenticated, service_role;
grant insert, update, delete on public.application_forms to authenticated, service_role;
grant select on public.form_questions to anon, authenticated, service_role;
grant insert, update, delete on public.form_questions to authenticated, service_role;
grant select on public.applications to authenticated, service_role;
grant update on public.applications to authenticated, service_role;
grant select on public.application_answers to authenticated, service_role;
grant select on public.interview_sessions to anon, authenticated, service_role;
grant insert, update, delete on public.interview_sessions to authenticated, service_role;
grant select on public.interview_assignments to authenticated, service_role;
grant insert, update, delete on public.interview_assignments to authenticated, service_role;
grant select on public.interview_session_members to authenticated, service_role;
grant insert, update, delete on public.interview_session_members to authenticated, service_role;
grant select on public.events to anon, authenticated, service_role;
grant all on public.google_mail_tokens to service_role;
revoke all on public.google_mail_tokens from public, anon, authenticated;

-- Trusted server routes use the service role and bypass RLS, but still need
-- table privileges for every table they touch.
grant all on all tables in schema public to service_role;

create policy "users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "public read club overview" on public.clubs
  for select to anon, authenticated using (true);

create policy "public read team structure" on public.teams
  for select to anon, authenticated using (true);
create policy "admin manage teams" on public.teams
  for all to authenticated
  using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));

create policy "users read own club memberships" on public.club_members
  for select to authenticated using (user_id = auth.uid());
create policy "admins read club members" on public.club_members
  for select to authenticated using (public.is_club_admin(club_id));

create policy "members read campaigns" on public.recruitment_campaigns
  for select to authenticated using (public.is_club_member(club_id));
create policy "public read open campaigns" on public.recruitment_campaigns
  for select to anon, authenticated using (
    status = 'open'
    and (start_date is null or start_date <= now())
    and (end_date is null or end_date >= now())
  );
create policy "admin write campaigns" on public.recruitment_campaigns
  for all to authenticated
  using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));

create policy "staff read positions" on public.recruitment_positions
  for select to authenticated using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = recruitment_positions.campaign_id
        and public.is_club_member(c.club_id)
    )
  );
create policy "public read open positions" on public.recruitment_positions
  for select to anon, authenticated using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = recruitment_positions.campaign_id
        and c.status = 'open'
        and (c.start_date is null or c.start_date <= now())
        and (c.end_date is null or c.end_date >= now())
    )
  );
create policy "admin write positions" on public.recruitment_positions
  for all to authenticated
  using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = recruitment_positions.campaign_id
        and public.is_club_admin(c.club_id)
    )
  ) with check (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = recruitment_positions.campaign_id
        and public.is_club_admin(c.club_id)
        and public.team_belongs_to_club(recruitment_positions.team_id, c.club_id)
    )
  );

create policy "admins read form templates" on public.form_templates
  for select to authenticated using (
    exists (
      select 1 from public.club_members m
      where m.user_id = auth.uid() and m.is_active and m.role in ('owner', 'admin')
    )
  );
create policy "admins manage form templates" on public.form_templates
  for all to authenticated
  using (exists (
    select 1 from public.club_members m
    where m.user_id = auth.uid() and m.is_active and m.role in ('owner', 'admin')
  ))
  with check (exists (
    select 1 from public.club_members m
    where m.user_id = auth.uid() and m.is_active and m.role in ('owner', 'admin')
  ));
create policy "admins read form template questions" on public.form_template_questions
  for select to authenticated using (
    exists (
      select 1 from public.form_templates t
      where t.id = template_id
        and exists (
          select 1 from public.club_members m
          where m.user_id = auth.uid() and m.is_active and m.role in ('owner', 'admin')
        )
    )
  );
create policy "admins manage form template questions" on public.form_template_questions
  for all to authenticated
  using (
    exists (
      select 1 from public.form_templates t
      where t.id = template_id
        and exists (
          select 1 from public.club_members m
          where m.user_id = auth.uid() and m.is_active and m.role in ('owner', 'admin')
        )
    )
  )
  with check (
    exists (
      select 1 from public.form_templates t
      where t.id = template_id
        and exists (
          select 1 from public.club_members m
          where m.user_id = auth.uid() and m.is_active and m.role in ('owner', 'admin')
        )
    )
  );

create policy "members read application forms" on public.application_forms
  for select to authenticated using (
    exists (
      select 1 from public.recruitment_positions p
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id
        and public.is_club_member(c.club_id)
    )
  );
create policy "public read open application forms" on public.application_forms
  for select to anon, authenticated using (
    exists (
      select 1 from public.recruitment_positions p
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id
        and c.status = 'open'
        and (c.start_date is null or c.start_date <= now())
        and (c.end_date is null or c.end_date >= now())
    )
  );
create policy "admin write application forms" on public.application_forms
  for all to authenticated
  using (
    exists (
      select 1 from public.recruitment_positions p
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id
        and public.is_club_admin(c.club_id)
    )
  )
  with check (
    exists (
      select 1 from public.recruitment_positions p
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where p.id = application_forms.position_id
        and public.is_club_admin(c.club_id)
    )
  );

create policy "members read form questions" on public.form_questions
  for select to authenticated using (
    exists (
      select 1 from public.application_forms f
      join public.recruitment_positions p on p.id = f.position_id
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id
        and public.is_club_member(c.club_id)
    )
  );
create policy "public read open form questions" on public.form_questions
  for select to anon, authenticated using (
    exists (
      select 1 from public.application_forms f
      join public.recruitment_positions p on p.id = f.position_id
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id
        and c.status = 'open'
        and (c.start_date is null or c.start_date <= now())
        and (c.end_date is null or c.end_date >= now())
    )
  );
create policy "admin write form questions" on public.form_questions
  for all to authenticated
  using (
    exists (
      select 1 from public.application_forms f
      join public.recruitment_positions p on p.id = f.position_id
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id
        and public.is_club_admin(c.club_id)
    )
  )
  with check (
    exists (
      select 1 from public.application_forms f
      join public.recruitment_positions p on p.id = f.position_id
      join public.recruitment_campaigns c on c.id = p.campaign_id
      where f.id = form_questions.form_id
        and public.is_club_admin(c.club_id)
    )
  );

create policy "members read applications" on public.applications
  for select to authenticated using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = applications.campaign_id
        and public.is_club_member(c.club_id)
    )
  );
create policy "admin update applications" on public.applications
  for update to authenticated
  using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = applications.campaign_id
        and public.is_club_admin(c.club_id)
    )
  )
  with check (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = applications.campaign_id
        and public.is_club_admin(c.club_id)
    )
  );

create policy "members read application answers" on public.application_answers
  for select to authenticated using (
    exists (
      select 1 from public.applications a
      join public.recruitment_campaigns c on c.id = a.campaign_id
      where a.id = application_answers.application_id
        and public.is_club_member(c.club_id)
    )
  );

create policy "staff read interview sessions" on public.interview_sessions
  for select to authenticated using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = interview_sessions.campaign_id
        and public.is_club_member(c.club_id)
    )
  );
create policy "public read open interview sessions" on public.interview_sessions
  for select to anon, authenticated using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = interview_sessions.campaign_id
        and c.status = 'open'
        and (c.start_date is null or c.start_date <= now())
        and (c.end_date is null or c.end_date >= now())
    )
  );
create policy "admin insert interview sessions" on public.interview_sessions
  for insert to authenticated with check (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = interview_sessions.campaign_id
        and public.is_club_admin(c.club_id)
    )
  );
create policy "admin update interview sessions" on public.interview_sessions
  for update to authenticated
  using (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = interview_sessions.campaign_id
        and public.is_club_admin(c.club_id)
    )
  )
  with check (
    exists (
      select 1 from public.recruitment_campaigns c
      where c.id = interview_sessions.campaign_id
        and public.is_club_admin(c.club_id)
    )
  );
create policy "admin delete empty interview sessions" on public.interview_sessions
  for delete to authenticated using (public.can_delete_empty_interview_session(id));

create policy "staff read interview assignments" on public.interview_assignments
  for select to authenticated using (
    exists (
      select 1 from public.interview_sessions s
      join public.recruitment_campaigns c on c.id = s.campaign_id
      where s.id = interview_assignments.session_id
        and public.is_club_member(c.club_id)
    )
  );
create policy "admin manage interview assignments" on public.interview_assignments
  for all to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      join public.recruitment_campaigns c on c.id = s.campaign_id
      where s.id = interview_assignments.session_id
        and public.is_club_admin(c.club_id)
    )
  )
  with check (
    exists (
      select 1 from public.interview_sessions s
      join public.recruitment_campaigns c on c.id = s.campaign_id
      where s.id = interview_assignments.session_id
        and public.is_club_admin(c.club_id)
    )
  );

create policy "staff read interview session members" on public.interview_session_members
  for select to authenticated using (
    exists (
      select 1 from public.interview_sessions s
      join public.recruitment_campaigns c on c.id = s.campaign_id
      where s.id = interview_session_members.session_id
        and public.is_club_member(c.club_id)
    )
  );
create policy "admin manage interview session members" on public.interview_session_members
  for all to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      join public.recruitment_campaigns c on c.id = s.campaign_id
      where s.id = interview_session_members.session_id
        and public.is_club_admin(c.club_id)
    )
  )
  with check (
    exists (
      select 1 from public.interview_sessions s
      join public.recruitment_campaigns c on c.id = s.campaign_id
      where s.id = interview_session_members.session_id
        and public.is_club_admin(c.club_id)
    )
  );

create policy "public read events" on public.events
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('team-images', 'team-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('event-images', 'event-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;

create policy "public read team images" on storage.objects
  for select to anon, authenticated using (bucket_id = 'team-images');
create policy "club admins upload team images" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'team-images'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_club_admin(c.id)
    )
  );
create policy "club admins update team images" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'team-images'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_club_admin(c.id)
    )
  )
  with check (
    bucket_id = 'team-images'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_club_admin(c.id)
    )
  );
create policy "club admins delete team images" on storage.objects
  for delete to authenticated using (
    bucket_id = 'team-images'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_club_admin(c.id)
    )
  );

create policy "public read event images" on storage.objects
  for select to anon, authenticated using (bucket_id = 'event-images');
create policy "club admins upload event images" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'event-images'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_club_admin(c.id)
    )
  );
create policy "club admins delete event images" on storage.objects
  for delete to authenticated using (
    bucket_id = 'event-images'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_club_admin(c.id)
    )
  );

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

insert into public.clubs (id, name, description)
values (
  '00000000-0000-4000-8000-000000000001',
  'CLB Tin học Ngân hàng BIT',
  'Câu lạc bộ Tin học Ngân hàng - Học viện Ngân hàng (BAV).'
)
on conflict (id) do nothing;

do $$
declare
  v_template_id uuid;
begin
  select t.id into v_template_id from public.form_templates t where t.is_default limit 1;

  if v_template_id is null then
    insert into public.form_templates (name, description, is_default)
    values ('Mẫu mặc định', 'Bộ câu hỏi khởi đầu cho biểu mẫu ứng tuyển.', true)
    returning id into v_template_id;
  end if;

  if not exists (select 1 from public.form_template_questions q where q.template_id = v_template_id) then
    insert into public.form_template_questions (
      template_id, question_text, question_type, field_key, is_required, order_index
    )
    values
      (v_template_id, 'Họ và tên', 'text', 'full_name', true, 0),
      (v_template_id, 'Email liên hệ', 'text', 'email', true, 1),
      (v_template_id, 'Số điện thoại', 'text', 'phone', false, 2),
      (v_template_id, 'Mã số sinh viên', 'text', 'student_code', false, 3),
      (v_template_id, 'Lớp', 'text', 'class_name', false, 4),
      (v_template_id, 'Vì sao bạn muốn tham gia BIT?', 'long_text', null, true, 5),
      (v_template_id, 'Bạn mong muốn học hỏi hoặc đóng góp điều gì khi tham gia CLB?', 'long_text', null, true, 6),
      (v_template_id, 'Bạn có kinh nghiệm, dự án hoặc hoạt động nào muốn chia sẻ không?', 'long_text', null, false, 7);
  end if;
end;
$$;

commit;
