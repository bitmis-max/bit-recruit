-- Đợt 8: trang Giới thiệu hiện từng ban dạng thẻ.
-- Thêm 2 trường cho ban, Ban chủ chốt sửa trong "Quản lí ban":
--   duties  = các việc chính của ban (mỗi phần tử một dòng, tối đa 6)
--   fit_for = "Hợp với bạn nếu…"
-- Quyền: bảng teams cấp quyền theo cả bảng và RLS theo dòng, nên cột mới
-- tự theo các policy có sẵn ("public read team structure", "admin manage teams").

alter table public.teams
  add column duties text[] not null default '{}',
  add column fit_for text;

alter table public.teams
  add constraint teams_duties_limit check (
    coalesce(array_length(duties, 1), 0) <= 6
    and char_length(array_to_string(duties, '')) <= 1200
  ),
  add constraint teams_fit_for_length check (fit_for is null or char_length(fit_for) <= 300);

-- Nội dung nháp cho 4 ban hiện có của BIT (khớp theo tên, chỉ trong CLB tạo đầu tiên —
-- cũng là CLB trang /clubs hiển thị; hệ thống đa CLB nên không chạm ban trùng tên ở CLB khác).
-- Chỉ điền khi ban chưa có nội dung, nên chạy lại hay chạy trên DB không có các ban này đều vô hại.
update public.teams t
set duties = v.duties, fit_for = v.fit_for
from (values
  ('Ban Chủ nhiệm',
   array['Đặt mục tiêu và kế hoạch hoạt động cho từng nhiệm kỳ',
         'Điều phối các ban, theo dõi để mọi hoạt động đi đúng hướng',
         'Hỗ trợ và tạo động lực để thành viên phát huy hết khả năng'],
   'Bạn thích nhìn bức tranh lớn, dám nhận trách nhiệm và muốn dẫn dắt một tập thể.'),
  ('Ban Chuyên môn',
   array['Xây dựng nội dung và đứng lớp các buổi học, workshop công nghệ',
         'Giữ chất lượng chuyên môn cho các dự án của CLB',
         'Tìm hiểu công nghệ mới và chia sẻ lại cho thành viên'],
   'Bạn mê công nghệ, thích tìm hiểu đến tận gốc và muốn chia sẻ kiến thức cho người khác.'),
  ('Ban Tổ chức',
   array['Lên kế hoạch, chuẩn bị và điều phối sự kiện, chương trình',
         'Lo hậu cần: địa điểm, thiết bị, lịch trình',
         'Kết nối và gắn kết các thành viên trong CLB'],
   'Bạn chu đáo, nhanh nhạy khi xử lý tình huống và thích làm mọi việc diễn ra suôn sẻ.'),
  ('Ban Truyền thông',
   array['Lên ý tưởng và viết bài cho các kênh của CLB',
         'Chụp ảnh, quay và dựng video các hoạt động',
         'Thiết kế ấn phẩm, giữ hình ảnh BIT nhất quán'],
   'Bạn thích kể chuyện bằng chữ, hình ảnh hoặc video và muốn nhiều người biết tới BIT.')
) as v(name, duties, fit_for)
where t.name = v.name
  and t.club_id = (select id from public.clubs order by created_at limit 1)
  and t.duties = '{}'
  and t.fit_for is null;
