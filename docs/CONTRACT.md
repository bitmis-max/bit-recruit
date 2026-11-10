# Hợp đồng Đợt 5: import danh sách thành viên từ Excel/CSV

Hợp đồng cũ vẫn có hiệu lực: `docs/CONTRACT-1.md` … `docs/CONTRACT-4.md` (Đợt 4: phân quyền theo chức năng, `has_club_permission`, `is_club_head`).

Mục đích: CLB đang quản lý thành viên trên Google Sheet; tải Sheet về `.xlsx`/`.csv` rồi đưa lên web một lần (và dùng lại các năm sau). Tên/thứ tự cột tùy ý — người dùng ghép cột trên giao diện.

## 1. Database (migration mới `supabase/migrations/20261116000000_import_members.sql`)

`import_members(p_club_id uuid, p_rows jsonb) returns jsonb` — security definer, `set search_path = public`, `revoke all … from public, anon`, `grant execute … to authenticated, service_role`.

- Người gọi phải có `has_club_permission(p_club_id, 'members')`; không có → lỗi tiếng Việt.
- `p_rows`: mảng 1–1000 object `{ full_name, student_code, class_name, email, phone, facebook_url, team, title }`; mọi giá trị là chuỗi hoặc null (khác → "Dòng N: trường … phải là chuỗi"); trim, rỗng → null.
  - `full_name` bắt buộc, ≤ 200 ký tự.
  - `email` (nếu có): viết thường, khớp regex email của `submit_application`.
  - `facebook_url` (nếu có): khớp `^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+` (như check của `club_members`).
  - `team` (nếu có): so `lower(btrim(teams.name)) = lower(btrim(team))` trong CLB; không có → "Dòng N: ban \"…\" chưa có trên web. Hãy tạo ban ở mục Quản lí ban hoặc sửa tên trong file." (không tự tạo ban).
  - `student_code`, `class_name`, `phone`, `title`: ≤ 100 ký tự (title ≤ 100).
- Trùng trong chính file (cùng MSSV, hoặc cùng email) → "Dòng N trùng với dòng M (…)".
- Ghép với thành viên đã có trong CLB: trước theo `student_code` (khác null), không có thì theo `lower(email)`. Nếu MSSV khớp người A còn email khớp người B → lỗi "Dòng N: MSSV và email thuộc hai thành viên khác nhau trên web".
  - Không khớp → thêm mới: `role = 'member'`, `is_active = true`, các trường từ file.
  - Khớp → cập nhật **chỉ những trường file có giá trị** (không ghi đè bằng null). KHÔNG đổi `role`, `permissions`, `is_head`, `user_id`, `is_active`. Với dòng đích là `owner`/`admin`: chỉ Chủ nhiệm (`is_club_head`) được đổi `team_id`; người khác thì giữ nguyên ban của dòng đó (đếm `staff_team_skipped`). Nếu không có trường nào đổi → đếm `unchanged`.
- Một transaction; một khối bắt lỗi ngoài cùng thêm tiền tố "Dòng N: " cho lỗi DB/trigger (không savepoint mỗi dòng). Lỗi bất kỳ → không ghi gì.
- Trả `{ "inserted": n, "updated": n, "unchanged": n, "staff_team_skipped": n }`.
- Cập nhật `docs/database.md`.

## 2. Giao diện
- `src/components/admin/MemberImportDialog.tsx` (mới): nút **Import Excel** ở `ClubMembersManager` (chỉ hiện khi `can("members")`). Dùng lại `readApplicantFile` của `src/components/admin/recruitment/applicantImport.ts` (xlsx/csv, 5 MB, báo nhiều sheet). Hộp ghép cột với lựa chọn: Họ tên, Mã sinh viên, Lớp, Email, Điện thoại, Link Facebook, Ban, Chức danh, Bỏ qua — tự đoán sẵn theo tên cột (vd "họ và tên"/"tên" → Họ tên; "mssv"/"mã sinh viên" → Mã sinh viên; "gmail"/"email" → Email; "sđt"/"số điện thoại" → Điện thoại; "facebook"/"fb" → Link Facebook; "ban" → Ban; "chức vụ"/"chức danh" → Chức danh), người dùng sửa được. Bắt buộc ghép **Họ tên**; một thuộc tính chỉ ghép một cột; tối đa 1000 dòng. Hiện bảng xem trước 5 dòng đầu sau khi ghép.
- Gọi `supabase.rpc("import_members", { p_club_id, p_rows })` một lần; thành công → "Đã thêm X, cập nhật Y, không đổi Z" (+ "Giữ nguyên ban của W người thuộc Ban chủ nhiệm/Ban chủ chốt" nếu W > 0), tải lại danh sách; lỗi → hiện trong hộp thoại (`role="alert"`).
- Ghi chú trong hộp thoại: vai trò và quyền không lấy từ file (cấp ở Nhiệm kỳ); trùng MSSV/email sẽ cập nhật người đã có; tên ban phải đúng như trên web.
- Cập nhật `docs/HUONG-DAN-SU-DUNG.md` mục 7 (thêm 7.4 Import thành viên từ Excel/Google Sheet).

## 3. Test
- pgTAP `supabase/tests/import_members.test.sql`: quyền (member, admin không có `members`, admin CLB khác, anon bị chặn; admin có `members` và owner được); thêm mới; cập nhật theo MSSV, theo email; không ghi đè bằng null; không đổi role/permissions/is_head/user_id/is_active; dòng owner/admin: admin không đổi được ban (đếm `staff_team_skipped`), Chủ nhiệm đổi được; ban không tồn tại → lỗi "Dòng N" và không ghi gì; trùng trong file; MSSV và email thuộc hai người → lỗi; email/Facebook sai định dạng; > 1000 dòng; kết quả jsonb đúng.
