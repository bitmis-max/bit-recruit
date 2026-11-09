# Handoff

Cập nhật: 2026-11-10 (DB thật chờ người dùng chạy nâng cấp; Đợt 2 đang làm ở local)

## Trạng thái hiện tại
- **Code:** Đợt 0 + Đợt 1 xong, commit `4fb4feb` trên nhánh `feat/member-roles-terms` (chưa push, chưa merge vào main). Không commit `.claude/settings.local.json`, `.claude/skills/`, `.mcp.json`.
  - Test: `npm test` 15/15, `npx supabase test db` 107/107, `tsc` sạch, `next build` sạch. Đã thử trên trình duyệt với Supabase local.
- **DB thật** (`rftgnkgnyvtehnsjwuhp`): **chưa sửa gì.** Đang ở schema cũ (khớp `supabase/migration/legacy/`: `application_forms.campaign_id`, không trigger, policy cũ cho authenticated insert events…). Code hiện tại KHÔNG chạy đúng trên schema này.
  - Dữ liệu thật: clubs 1, teams 5, club_members 3, recruitment_campaigns 1, recruitment_positions 4, application_forms 1, form_questions 43, form_templates 1, form_template_questions 12, applications 55, application_answers 2365, interview_sessions 9, interview_assignments 55, events 10, google_mail_tokens 1; auth.users 2; storage.objects 2 (event-images).
- **Backup** (2026-11-10): `backup/schema.sql`, `backup/data.sql` (gitignored, chứa dữ liệu cá nhân). Số dòng khớp DB thật.
- **Truy cập DB thật:** MCP `supabase` (theo `.mcp.json`) + Supabase CLI đã `link` bằng phiên đăng nhập CLI của người dùng. Người dùng đã cho toàn quyền.
- **Script nâng cấp xong và đã kiểm chứng ở local:** `supabase/upgrade/20261110_legacy_to_baseline.sql` + `supabase/upgrade/README.md`. Lead kiểm chứng độc lập trên bản sao từ backup: md5 nội dung 2365 câu trả lời (theo nội dung câu hỏi) trước = sau; 0 câu trả lời trỏ sai vị trí; 4 form × 43 câu hỏi; organizer → member; CLB đã có 1 owner có tài khoản. Agent: dấu vân tay schema sau nâng cấp = DB dựng mới (0 khác biệt), 107/107 test.
  - `events.event_date` (cột thừa) được giữ ở `legacy_archive.events_event_date`; `interview_sessions.name` gộp vào `note` (cả 9 ca note = name nên không đổi).
- **Backup ngay trước nâng cấp:** `backup/pre_upgrade_schema.sql`, `backup/pre_upgrade_data.sql` (số dòng khớp, chưa có dữ liệu mới).
- **Precheck read-only trên DB thật (CLI `db query --remote --read-only`):** 0 CLB thiếu owner, vẫn là schema legacy.
- **Bị chặn:** chạy script lên DB thật bằng `npx supabase db query --remote --yes -f ...` bị chốt an toàn của Claude Code từ chối (xếp loại Production Deploy). Không lách qua MCP. **Chờ người dùng tự chạy 3 lệnh (xem `supabase/upgrade/README.md` / tin nhắn) hoặc thêm quyền.**
- `.env.local`: mới có URL và anon key; service-role key và 3 biến Google còn rỗng.
- Người dùng có dev server riêng ở cổng 3000 (không đụng).

## Đợt 2 đang chạy (bắt đầu 2026-11-10)
- Hợp đồng: `docs/CONTRACT.md` (Đợt 1 chuyển sang `docs/CONTRACT-1.md`).
- 4 agent mới chạy song song: db (`supabase/migrations/20261111000000_tasks.sql`), api (gmail lib, cron `/api/cron/task-reminders`, mail-sender, remind, `vercel.json`), frontend (`/manage-clubs/tasks`, `/manage-clubs/contribution`, "Việc của tôi" ở `/me`), tester (`tests/unit/reminders.test.ts`, `supabase/tests/tasks.test.sql`).
- **Kết quả (2026-11-10):** cả 4 agent xong. `npm test` 29/29, `npx supabase test db` 236/236 (107 + 129), `tsc` + eslint sạch, `next build` sạch. Lead đã thêm `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` vào `.env.example`.
  - Đã thử thật ở local (port 3100): cron 401 khi thiếu/sai secret, 200 khi đúng (`skippedNoSender: 1` vì chưa chọn Gmail); admin giao việc cho 1 người + cả ban → 3 người nhận; member đánh dấu xong ở `/me` → `completed_at` được ghi; bảng đóng góp đếm đúng; tiêu đề chứa HTML hiển thị dạng chữ. Ảnh desktop + 375px đã xem.
  - Chưa thử: gửi Gmail thật (cần token Gmail + `.env.local` đủ key); vì vậy logic "giữ chỗ" chống gửi trùng chỉ được kiểm bằng đọc code + typecheck.
  - Reviewer: không có lỗi nghiêm trọng. Đã sửa 4 lỗi nên sửa: người gửi phải còn là owner/admin đang hoạt động; việc `closed` không tính pending vào đóng góp; nạp người nhận theo lô + phân trang; giữ chỗ trước khi gửi, hoàn lại khi lỗi; nút "Gửi nhắc ngay" bỏ qua người vừa được nhắc trong 10 phút. Thêm: chặn tạo việc hạn quá khứ, member ngừng hoạt động không tự đánh dấu xong, log lỗi gửi (không lộ email/token).
  - Sau sửa: `npm test` 29/29, `npx supabase test db` 244/244, `tsc` + eslint sạch, build sạch; thử local: người gửi không hợp lệ → `configured:false`, cron `skippedNoSender`.
  - Đã commit vào nhánh `feat/member-roles-terms` (cùng `supabase/upgrade/`, docs, `.env.example`).
- DB thật kiểm tra lại 2026-11-10 (read-only): VẪN legacy, chưa migration nào được ghi nhận. Người dùng cần chạy 3 bước trong `supabase/upgrade/README.md` (bản rút gọn: `db query --remote --yes -f <script>` → `migration repair --remote --status applied 20261023000000` → `db push --remote`). `db push` sẽ áp cả `20261110...` và `20261111...` nếu migration tasks đã có.
- Không commit (cố ý): `.claude/settings.local.json`, `.claude/skills/`, `.mcp.json`, `backup/` (gitignored).

## Bước tiếp theo (lead tự làm)
1. Kiểm chứng script nâng cấp (số dòng trước/sau, answers trỏ đúng form, dấu vân tay schema = DB dựng mới, 107 test).
2. Chọn owner nếu DB thật chưa có owner đang hoạt động có tài khoản (hỏi người dùng đúng câu này).
3. Áp lên DB thật: script nâng cấp (một transaction) → `npx supabase migration repair --status applied 20261023000000` → áp `20261110000000_member_roles_terms.sql`. Đếm lại, chạy advisors.
4. Đợt 2: giao việc + nhắc hạn + đóng góp. Dự kiến: bảng tasks / task_assignees / task_reminders; Ban chủ chốt giao cho người hoặc cả ban, tick xong/chưa; member xem và đánh dấu ở `/me`; nhắc Gmail 24h trước hạn và khi quá hạn (mỗi loại 1 lần), gửi từ Gmail CLB được chọn (`clubs.mail_sender_user_id`); Vercel Cron hằng ngày gọi `/api/cron/task-reminders` có `CRON_SECRET` (cũng giữ Supabase Free không bị tạm dừng); trang đóng góp theo kỳ, đánh dấu người dưới ngưỡng.
5. Đợt 3: bookmarklet đối chiếu react/comment (so link hồ sơ) + trang tạo avatar khung; thử đọc avatar nhỏ trong danh sách react.

## Quyết định của người dùng
- Vai trò: owner = Ban chủ nhiệm, admin = Ban chủ chốt, member = Thành viên. Ứng viên không có tài khoản; đơn `passed` được kết nạp.
- Đổi nhiệm kỳ hằng năm qua màn hình Nhiệm kỳ.
- Nhắc deadline qua web + Gmail, không Messenger.
- Ý 3 và 4: làm bằng bookmarklet (đã đồng ý).
- Nâng cấp DB thật và giữ dữ liệu.
- Lead tự lên kế hoạch và làm tiếp; cập nhật HANDOFF thường xuyên.

## Quyết định của lead
- Tài khoản thành viên tạo không gửi mail, đăng nhập bằng Google cùng email (chưa kiểm chứng trên project thật).
- Chỉ Ban chủ nhiệm cấp/gỡ vai trò Ban chủ chốt và gán tài khoản cho Ban chủ chốt.
- Thành viên thường đọc được thông tin đợt tuyển và lịch ca phỏng vấn; không đọc được đơn ứng viên.

## Việc người dùng phải làm trên dashboard
- Tắt "Allow new users to sign up" (Authentication → Sign In / Providers) — nên làm ngay.
- Cấu hình Google provider; bật "Confirm email".
- Điền service-role key và các biến Google vào `.env.local` (qua file, không dán vào chat).

## Còn mở / nợ kỹ thuật
- Chống spam form ứng tuyển (Cloudflare Turnstile?).
- SSRF còn khe DNS rebinding (chỉ admin gọi được; `shortcut:` trong `src/lib/security/safe-fetch.ts`).
- Lưu danh sách nhiệm kỳ không nguyên tử (upsert rồi delete).
- Lint `react-hooks/set-state-in-effect` có sẵn ở các màn hình admin.
- `form_templates` dùng chung mọi CLB (chấp nhận khi chỉ có BIT).
