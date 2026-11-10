-- Reusable global form templates. Any active owner/admin can manage them.
create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.form_templates
  add column if not exists is_default boolean not null default false;

create table if not exists public.form_template_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.form_templates(id) on delete cascade,
  question_text text not null,
  question_type public.question_type not null default 'text',
  options jsonb,
  is_required boolean not null default false,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.application_forms
  add column if not exists source_template_id uuid references public.form_templates(id) on delete set null;

create index if not exists form_template_questions_template_order_idx
  on public.form_template_questions (template_id, order_index);
create unique index if not exists form_templates_one_default_idx
  on public.form_templates (is_default) where is_default;

alter table public.form_templates enable row level security;
alter table public.form_template_questions enable row level security;

grant select, insert, update, delete on public.form_templates to authenticated;
grant select, insert, update, delete on public.form_template_questions to authenticated;

drop policy if exists "admins read form templates" on public.form_templates;
create policy "admins read form templates" on public.form_templates
  for select to authenticated using (
    exists (
      select 1 from public.club_members m
      where m.user_id = auth.uid() and m.is_active and m.role in ('owner', 'admin')
    )
  );

drop policy if exists "admins manage form templates" on public.form_templates;
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

drop policy if exists "admins read form template questions" on public.form_template_questions;
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

drop policy if exists "admins manage form template questions" on public.form_template_questions;
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

-- Seed the default template once, so new application forms get useful questions immediately.
insert into public.form_templates (name, description, is_default)
select 'Mẫu mặc định', 'Bộ câu hỏi khởi đầu cho biểu mẫu ứng tuyển.', true
where not exists (select 1 from public.form_templates where is_default);

insert into public.form_template_questions (template_id, question_text, question_type, is_required, order_index)
select t.id, q.question_text, q.question_type::public.question_type, q.is_required, q.order_index
from public.form_templates t
cross join (values
  ('Vì sao bạn muốn tham gia BIT?', 'long_text', true, 0),
  ('Bạn mong muốn học hỏi hoặc đóng góp điều gì khi tham gia CLB?', 'long_text', true, 1),
  ('Bạn có kinh nghiệm, dự án hoặc hoạt động nào muốn chia sẻ không?', 'long_text', false, 2)
) as q(question_text, question_type, is_required, order_index)
where t.is_default
  and not exists (select 1 from public.form_template_questions existing where existing.template_id = t.id);
