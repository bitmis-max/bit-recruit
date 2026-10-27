-- Thay đổi bảng application_forms: Xóa position_id, thêm campaign_id
-- Chuyển đổi quan hệ từ 1-1 (với recruitment_positions) sang 1-n (với recruitment_campaigns)

alter table application_forms
  drop constraint if exists application_forms_position_id_fkey,
  add column campaign_id uuid references recruitment_campaigns(id) on delete cascade;

-- Xóa cột position_id vì hiện tại đơn ứng tuyển (form) dùng chung cho cả chiến dịch hoặc được định nghĩa theo chiến dịch
alter table application_forms drop column if exists position_id;

-- Cập nhật Policy để phản ánh thay đổi schema
drop policy if exists "staff read application forms" on application_forms;
drop policy if exists "admin write application forms" on application_forms;
drop policy if exists "public read open application forms" on application_forms;

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
