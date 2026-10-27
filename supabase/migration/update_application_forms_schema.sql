-- Cập nhật bảng application_forms: Xóa position_id và thêm campaign_id một cách an toàn
-- Bước 1: Xóa tất cả các policy phụ thuộc vào cột position_id
drop policy if exists "staff read application forms" on application_forms;
drop policy if exists "admin write application forms" on application_forms;
drop policy if exists "public read open application forms" on application_forms;
drop policy if exists "staff read form questions" on form_questions;
drop policy if exists "admin write form questions" on form_questions;
drop policy if exists "public read open form questions" on form_questions;

-- Bước 2: Xóa cột position_id (Sử dụng CASCADE để đảm bảo xóa sạch các ràng buộc phụ thuộc)
alter table application_forms drop column if exists position_id cascade;

-- Bước 3: Thêm cột campaign_id
alter table application_forms add column campaign_id uuid references recruitment_campaigns(id) on delete cascade;

-- Bước 4: Tạo lại các Policy mới dựa trên campaign_id

-- Policy cho application_forms
create policy "staff read application forms" on application_forms
  for select to authenticated using (
    exists (
      select 1 from recruitment_campaigns c
      where c.id = application_forms.campaign_id and is_club_member(c.club_id)
    )
  );

create policy "admin write application forms" on application_forms
  for all to authenticated using (
    exists (
      select 1 from recruitment_campaigns c
      where c.id = application_forms.campaign_id and is_club_admin(c.club_id)
    )
  ) with check (
    exists (
      select 1 from recruitment_campaigns c
      where c.id = application_forms.campaign_id and is_club_admin(c.club_id)
    )
  );

create policy "public read open application forms" on application_forms
  for select to anon, authenticated using (
    exists (
      select 1 from recruitment_campaigns c
      where c.id = application_forms.campaign_id
        and c.status = 'open'
        and (c.start_date is null or c.start_date <= now())
        and (c.end_date is null or c.end_date >= now())
    )
  );

-- Policy cho form_questions (phụ thuộc vào application_forms)
create policy "staff read form questions" on form_questions
  for select to authenticated using (
    exists (
      select 1 from application_forms f
      join recruitment_campaigns c on c.id = f.campaign_id
      where f.id = form_questions.form_id and is_club_member(c.club_id)
    )
  );

create policy "admin write form questions" on form_questions
  for all to authenticated using (
    exists (
      select 1 from application_forms f
      join recruitment_campaigns c on c.id = f.campaign_id
      where f.id = form_questions.form_id and is_club_admin(c.club_id)
    )
  ) with check (
    exists (
      select 1 from application_forms f
      join recruitment_campaigns c on c.id = f.campaign_id
      where f.id = form_questions.form_id and is_club_admin(c.club_id)
    )
  );

create policy "public read open form questions" on form_questions
  for select to anon, authenticated using (
    exists (
      select 1 from application_forms f
      join recruitment_campaigns c on c.id = f.campaign_id
      where f.id = form_questions.form_id
        and c.status = 'open'
        and (c.start_date is null or c.start_date <= now())
        and (c.end_date is null or c.end_date >= now())
    )
  );
