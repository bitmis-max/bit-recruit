# Handoff

Cập nhật: 2026-11-10 13:0x — Đợt 0–3 xong ở local và đã commit. DB thật CHƯA nâng cấp (chờ người dùng chạy lệnh). Chưa deploy.

## Trạng thái
- **Nhánh `feat/member-roles-terms`** (chưa push, chưa merge `main`):
  - `4fb4feb` Đợt 0 + 1: bảo mật (SSRF, đóng đăng ký, RLS đơn ứng tuyển, redirect an toàn), vai trò owner/admin/member, nhiệm kỳ, kết quả phỏng vấn, kết nạp, `/me`, tạo tài khoản hàng loạt.
  - `6e8e521` Đợt 2: giao việc, nhắc Gmail qua Vercel Cron, bảng đóng góp; script nâng cấp DB `supabase/upgrade/`.
  - `93acf54` Đợt 3: đối chiếu Facebook bằng bookmarklet, khung avatar, `/frames/[id]` công khai.
  - Không commit (cố ý): `.claude/settings.local.json`, `.claude/skills/`, `.mcp.json`, `backup/` (gitignored, có dữ liệu cá nhân).
- **Kiểm chứng gần nhất:** `npm test` 98/98, `npx supabase test db` 420/420, `tsc` sạch, eslint sạch ở code mới, `next build` sạch. E2E bằng playwright trên Supabase local (port 3100) cho cả 3 đợt, ảnh desktop + 375px đã xem. Bookmarklet chỉ thử trên trang Facebook GIẢ LẬP (`scratchpad/shots/fb-mock.html`).
- **Hợp đồng:** `docs/CONTRACT-1.md` (Đợt 1), `docs/CONTRACT-2.md` (Đợt 2), `docs/CONTRACT.md` (Đợt 3, có các dòng "Sửa sau review").

## DB thật (`rftgnkgnyvtehnsjwuhp`)
- **2026-11-10 sau `db push`:** cả 4 migration đã áp lên DB thật (migration list local = remote). Read-only: role enum `owner,admin,member`, club_members owner:1 member:2, applications 55, answers 2365, events 10, storage 2 object, 6 bảng mới + 7 hàm mới + bucket avatar-frames.
  - Security advisor: anon gọi được 19 hàm security definer cũ (Supabase cấp mặc định). Lead thêm `20261113000000_harden_function_grants.sql` (anon chỉ còn submit_application, get_application_by_token; hàm trigger không gọi qua API) + `supabase/tests/function_grants.test.sql`; local 425/425 PASS. Người dùng đã push (2026-11-10); advisor sau đó: anon chỉ còn 2 hàm cố ý, authenticated 19 hàm ứng dụng/RLS, hàm trigger không còn gọi được. DB thật hoàn tất. Cảnh báo còn lại chấp nhận: authenticated gọi hàm RPC (đúng thiết kế), `google_mail_tokens`/`legacy_archive` RLS không policy (cố ý, chỉ service-role), leaked password protection (tính năng gói trả phí).
- **2026-11-10 (người dùng chạy):** script nâng cấp ĐÃ áp + `migration repair` baseline ĐÃ xong. Lead kiểm tra read-only: hết dấu legacy, có `position_id`, applications 55, answers 2365, forms 4, questions 172, events 10, club_members 3, assignments 55, 0 câu trả lời trỏ sai vị trí, 8 trigger. `db push --dry-run` liệt kê đúng 3 migration. **Còn chờ: `npx supabase db push --remote`.**
- (Trước nâng cấp) Ở schema legacy (khớp `supabase/migration/legacy/`).
- Dữ liệu (đếm 2026-11-10): applications 55, application_answers 2365, form_questions 43, events 10, interview_sessions 9, interview_assignments 55, teams 5, recruitment_positions 4, club_members 3 (1 owner có tài khoản), clubs/campaigns/form_templates/google_mail_tokens 1; auth.users 2; storage 2 ảnh event-images. Không có bảng `supabase_migrations`.
- Backup: `backup/schema.sql`, `backup/data.sql`, `backup/pre_upgrade_schema.sql`, `backup/pre_upgrade_data.sql`.
- Script nâng cấp `supabase/upgrade/20261110_legacy_to_baseline.sql` đã kiểm chứng trên bản sao: nội dung 2365 câu trả lời giữ nguyên (md5), 0 câu trỏ sai vị trí, dấu vân tay schema = DB dựng mới.
- Truy cập: MCP `supabase` + Supabase CLI đã `link`. Lệnh ghi lên DB thật (`db query --remote --yes`) bị chốt an toàn Claude Code chặn (Production Deploy) → **người dùng tự chạy**:
  1. `npx supabase db query --remote --yes -f supabase/upgrade/20261110_legacy_to_baseline.sql`
  2. `npx supabase migration repair --remote --status applied 20261023000000` rồi `npx supabase migration list --remote`
  3. `npx supabase db push --remote --dry-run` (phải liệt kê đúng 3: `20261110000000`, `20261111000000`, `20261112000000`) rồi `npx supabase db push --remote`
- Sau khi người dùng chạy: lead đếm lại (read-only), chạy `npx supabase db advisors --remote` hoặc MCP `get_advisors`, cập nhật file này.

## Việc tiếp theo
1. Người dùng chạy 3 lệnh nâng cấp DB (trên).
2. Cấu hình (người dùng làm, lead hướng dẫn): tắt "Allow new users to sign up"; bật Google provider; bật "Confirm email"; điền `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` (qua file, không dán vào chat).
3. Deploy Vercel Hobby (hỏi người dùng trước): đặt biến môi trường, cron `vercel.json` 01:00 UTC.
4. Thử thật: đăng nhập Google vào tài khoản tạo sẵn; gửi Gmail nhắc việc; bookmarklet trên một bài Facebook thật của CLB (DOM thật, CSP, CORS ảnh fbcdn).
5. Push nhánh / merge `main` khi người dùng yêu cầu.

## Quyết định của người dùng
- Vai trò: owner = Ban chủ nhiệm, admin = Ban chủ chốt, member = Thành viên. Ứng viên không có tài khoản; đơn `passed` được kết nạp.
- Đổi nhiệm kỳ hằng năm qua màn hình Nhiệm kỳ.
- Nhắc deadline qua web + Gmail, không Messenger.
- Ý 3 và 4 làm bằng bookmarklet.
- Nâng cấp DB thật và giữ dữ liệu.
- Lead tự lên kế hoạch và làm tiếp, không cần chờ; cập nhật HANDOFF thường xuyên.

## Quyết định của lead
- Tài khoản thành viên tạo không gửi mail, đăng nhập Google cùng email (chưa kiểm chứng trên project thật).
- Chỉ Ban chủ nhiệm cấp/gỡ vai trò Ban chủ chốt và gán tài khoản cho Ban chủ chốt.
- Thành viên thường đọc được thông tin đợt tuyển và lịch ca phỏng vấn; không đọc được đơn ứng viên.
- Việc `closed` không tính "bỏ lỡ" cho người còn chờ; muốn ghi nhận thì tick "Chưa hoàn thành" trước khi đóng.
- Email nhận nhắc lấy từ `club_members.email`, không lấy email tài khoản.
- Link Facebook: đoạn đầu toàn số 3–25 chữ số, `/p/<slug>-<số>`, `/profile/<số>` → `id:`; username 5–80 ký tự có chữ cái.
- Trang scan không tick sẵn ai; nhận diện khung chỉ là gợi ý.

## Còn mở / nợ kỹ thuật
- Chống spam form ứng tuyển (Cloudflare Turnstile, cần tài khoản Cloudflare).
- SSRF còn khe DNS rebinding (chỉ admin gọi được; `shortcut:` trong `src/lib/security/safe-fetch.ts`).
- Lưu danh sách nhiệm kỳ không nguyên tử (upsert rồi delete).
- Logic giữ chỗ chống gửi trùng mail nhắc chưa chạy thật (cần Gmail).
- Nhận diện khung trên avatar Facebook thật có thể trượt nếu ảnh nhỏ làm viền lẫn màu.
- Hết phiên đăng nhập giữa lúc quét: hash dữ liệu quét mất qua trang login (phải quét lại).
- Lint `react-hooks/set-state-in-effect` có sẵn ở các màn hình admin cũ.
- `form_templates` dùng chung mọi CLB (chấp nhận khi chỉ có BIT).
