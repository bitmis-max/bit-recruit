# Handoff

Cập nhật: 2026-11-10

## Trạng thái
- Chưa deploy production. Supabase project thật (nối qua MCP) có đủ bảng của migration gốc, 0 dòng dữ liệu, **chưa áp migration mới** `20261110000000_member_roles_terms.sql`.
- `.env.local`: mới có URL và anon key. `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` còn rỗng.
- Đợt 0 + Đợt 1 (theo `docs/CONTRACT.md`): **xong ở local, chưa commit.**
  - Test: `npm test` 15/15, `npx supabase test db` 107/107, `tsc` sạch, `next build` sạch.
  - Đã thử trên trình duyệt với Supabase local: `/register` → `/login`; member bị chuyển `/manage-clubs` → `/me`, lưu hồ sơ; owner lưu và kích hoạt nhiệm kỳ; kết nạp ứng viên `passed`; member gọi API quản trị bị 403; admin cấp quyền admin/owner bị 403; `next=/%09/evil.com` không chuyển ra ngoài.
- Supabase local (Docker) có thể vẫn đang chạy: tắt bằng `npx supabase stop`.

## Quyết định của người dùng
- Vai trò: owner = Ban chủ nhiệm, admin = Ban chủ chốt, member (đổi tên từ organizer) = Thành viên. Ứng viên không có tài khoản; qua vòng cuối (`passed`) thì Ban chủ chốt bấm "Kết nạp".
- Mỗi năm đổi nhiệm kỳ: Ban chủ nhiệm tạo nhiệm kỳ nháp, chọn Ban chủ nhiệm/Ban chủ chốt + chức danh, rồi kích hoạt. Người ngoài danh sách tự về Thành viên.
- Nhắc deadline qua web + Gmail, không dùng Messenger.
- Làm Đợt 0 (bảo mật) trước tính năng mới.

## Quyết định của lead (người dùng có thể đổi)
- Tài khoản thành viên tạo bằng "Tạo tài khoản" (không gửi mail), thành viên đăng nhập bằng Google cùng email. Chưa kiểm chứng việc Supabase tự gắn Google identity vào tài khoản tạo sẵn trên project thật.
- Chỉ Ban chủ nhiệm cấp/gỡ vai trò Ban chủ chốt và gán tài khoản cho Ban chủ chốt.
- Thành viên thường vẫn đọc được thông tin đợt tuyển và lịch ca phỏng vấn (không nhạy cảm); không đọc được đơn ứng viên.

## Lộ trình
1. Đợt 0 + Đợt 1: xong ở local (xem trên).
2. Đợt 2: giao việc + nhắc hạn (web + Gmail, `pg_cron` hằng ngày, cũng giúp Supabase Free không bị tạm dừng) + bảng đóng góp.
3. Đợt 3: đối chiếu react/comment + trang tạo avatar khung.

## Việc còn mở / câu hỏi
- Ý 3 và 4: đề xuất bookmarklet chạy trên trình duyệt của ban chủ chốt (so link hồ sơ, đọc avatar nhỏ trong danh sách react). Người dùng chưa chốt.
- Áp migration mới lên database thật: chờ người dùng đồng ý.
- Người dùng phải làm trên dashboard Supabase: tắt "Allow new users to sign up", cấu hình Google provider, bật "Confirm email".
- Commit các thay đổi: chờ người dùng yêu cầu.
- Chống spam form ứng tuyển: cân nhắc Cloudflare Turnstile (miễn phí, cần tài khoản Cloudflare).
- Còn nhỏ, chưa sửa: SSRF còn khe DNS rebinding (chỉ admin gọi được, có `shortcut:` trong `src/lib/security/safe-fetch.ts`); lưu danh sách nhiệm kỳ không nguyên tử (upsert rồi delete); lint `react-hooks/set-state-in-effect` có sẵn ở các màn hình admin (TermsManager theo cùng mẫu).
- `form_templates` dùng chung mọi CLB: chấp nhận được khi chỉ có BIT.
