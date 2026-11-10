# Handoff

Cập nhật: 2026-11-10 13:0x — Đợt 0–3 xong ở local và đã commit. DB thật CHƯA nâng cấp (chờ người dùng chạy lệnh). Chưa deploy.

## Trạng thái
- **Nhánh `feat/member-roles-terms`** (chưa push, chưa merge `main`):
  - `6c5a613` Đợt 0 + 1: bảo mật (SSRF, đóng đăng ký, RLS đơn ứng tuyển, redirect an toàn), vai trò owner/admin/member, nhiệm kỳ, kết quả phỏng vấn, kết nạp, `/me`, tạo tài khoản hàng loạt.
  - `9f0d3cf` Đợt 2: giao việc, nhắc Gmail qua Vercel Cron, bảng đóng góp; script nâng cấp DB `supabase/upgrade/`.
  - `84ee737` Đợt 3: đối chiếu Facebook bằng bookmarklet, khung avatar, `/frames/[id]` công khai.
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

## Deploy (người dùng chọn 2026-11-10: GitHub ↔ Vercel, push nhánh + PR)
- Đã push `feat/member-roles-terms` lên `origin` (github.com/bitmis-max/bit-recruit). `gh` chưa cài → người dùng tự tạo PR qua link `https://github.com/bitmis-max/bit-recruit/pull/new/feat/member-roles-terms` rồi merge.
- Đang chờ: người dùng merge PR, tạo project Vercel từ repo, nhập biến môi trường trên dashboard Vercel, cấu hình Supabase Auth (Site URL, Redirect URL, Google provider, tắt signup).
- Lưu ý: `google_mail_tokens` trên DB thật có 1 token mã hóa bằng `GOOGLE_TOKEN_ENCRYPTION_KEY` cũ; nếu dùng key mới thì người đó phải kết nối lại Gmail.

## Vercel qua CLI (người dùng nhờ lead làm, 2026-11-10)
- Vercel CLI 65.14.0 có sẵn (`npx vercel`), đang login tài khoản cá nhân `buiducthinh250506-cell` → người dùng cần `npx vercel logout` + `npx vercel login` bằng tài khoản BIT.
- File secret tạm `.env.vercel.local` (gitignored qua `.env*`): người dùng điền `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, (tùy chọn) `GOOGLE_TOKEN_ENCRYPTION_KEY`. Lead xóa file sau khi đẩy xong.
- Script (scratchpad) `push-vercel-env.mjs <siteUrl> [--dry]`: kiểm định dạng, tự tạo `CRON_SECRET` (+ key mã hóa nếu trống), `vercel env add ... --environment production --force --sensitive` qua stdin, không in giá trị.
- Sau khi đẩy: `vercel link` vào project hiện có, redeploy bản production mới nhất (sau khi người dùng merge PR bằng tài khoản BIT).
- **Kết quả:** CLI login `bitmis-3939`; project Vercel = **`bit-bav`**, web **https://bit-bav.vercel.app**; `.vercel/` (gitignored) đã link. Project ĐÃ có sẵn `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` (không ghi đè — key mã hóa phải giữ để giải mã token Gmail cũ), `NEXT_PUBLIC_SUPABASE_*`, SMTP_*. Lead đã thêm `CRON_SECRET` (sensitive, tự tạo, không lưu ở đâu khác) và `NEXT_PUBLIC_SITE_URL=https://bit-bav.vercel.app`. Đã xóa `.env.vercel.local`. `vercel link` tự thêm `VERCEL_OIDC_TOKEN` vào `.env.local` (gitignored, vô hại).
- Còn chờ: người dùng merge PR bằng tài khoản BIT → Vercel tự deploy `main`; lead kiểm tra web + cron (401 khi không có secret). Supabase Auth URL Configuration nên có Site URL `https://bit-bav.vercel.app` và Redirect `https://bit-bav.vercel.app/auth/callback` (bản cũ có thể đã đặt).

## Gộp `main` (2026-11-10)
- PR báo xung đột: `origin/main` có 4 commit của tài khoản BIT ngày 27/10 (import ứng viên/ca phỏng vấn từ Excel + SQL `update_application_forms_schema.sql` đổi form sang theo `campaign_id`). SQL này là nguồn gốc schema "legacy" trên DB thật. Code khác trên main vẫn dùng `position_id`.
- Lead đã merge `origin/main` vào nhánh (commit `8428c1f`): giữ mô hình form theo vị trí; 2 màn hình xung đột giữ bản nhánh; SQL chuyển vào `supabase/migration/legacy/` với dòng "KHÔNG CHẠY".
- **Xong (commit `e1f48bb`, đã push):** RPC `import_applications` + giao diện import dùng chung (`ApplicantImportDialog`) ở 2 màn hình; `npm test` 98/98, `npx supabase test db` 522/522, `tsc` sạch, build sạch; thử local: CSV 3 dòng → "Đã import 2, bỏ qua 1 đơn trùng", tạo vị trí mới + ca + câu trả lời đúng. Reviewer rà `8428c1f` + `e1f48bb`: 0 nghiêm trọng; đang sửa theo `docs/CONTRACT.md` 5.4 (form mới chép câu hỏi mẫu mặc định; đợt `open` không thêm câu hỏi vào form đã có; cấm tiêu đề câu hỏi chọn ca; dòng × câu ≤ 20000; bỏ savepoint mỗi dòng; kiểm email; so tên vị trí không phân biệt hoa thường; file ≤ 5 MB). Migration `20261114000000` CHƯA áp lên DB thật nên sửa thẳng file. **Đã sửa xong** (cùng file migration 20261114000000): `npm test` 98/98, `npx supabase test db` 552/552, tsc sạch, build sạch; thử local: import vào đợt đang mở tạo form mới đủ câu mẫu (9 câu, 5 có field_key), import lần 2 thêm câu hỏi mới vào form đã có bị chặn với thông báo tiếng Việt và không ghi gì. Đã commit + push. Người dùng đã `db push` migration 20261114 (2026-11-10); read-only: hàm có, anon không execute, authenticated execute, dữ liệu 55/2365 nguyên; migration list local = remote (6 migration). **Còn: merge PR bằng tài khoản BIT → Vercel.**
- Còn mở (cần hỏi người dùng): `xlsx@0.18.5` (có từ trước, dùng cho import và mail merge) có lỗ hổng high chưa vá trên npm (prototype pollution, ReDoS); phương án: bản SheetJS từ CDN chính chủ ≥ 0.20, hoặc chỉ nhận CSV.
- Kế hoạch đã làm (3 agent mới): RPC `import_applications` (migration `20261114000000`, hợp đồng `docs/CONTRACT.md` mục 5), đưa giao diện import của main vào cả 2 màn hình gọi RPC, pgTAP `import.test.sql`. Sau đó người dùng cần `npx supabase db push --remote` lần nữa.
- Vercel: repo đã nối với một project Vercel có sẵn; check trên PR lỗi "Git author buiducthinh250506-cell must have access to the project" (gói Hobby chỉ deploy commit của chủ project). Chờ người dùng cho biết ai sở hữu project Vercel.

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

## Ghi chú git
- 2026-11-10: theo yêu cầu người dùng, đã viết lại lịch sử nhánh `feat/member-roles-terms` (filter-branch, chỉ bỏ dòng `Co-Authored-By: Claude`, code không đổi) và force-push. Mã commit trong file này là mã mới. Từ nay không thêm ghi công Claude vào commit/PR.

## Production (2026-11-10 14:3x) — ĐÃ LÊN
- PR #1 đã merge vào `main` bởi `bitmis-max` (commit `d1c2322`). Project Vercel `bit-bav` không tự gắn tên miền cho bản production mới → người dùng đã Redeploy (nhận `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`) + Promote. `bit-bav.vercel.app` = deployment 14:29 (`bit-2uf9bskbw`).
- Lead kiểm tra read-only: `/`, `/login`, `/positions`, `/events` 200; `/register` → `/login`; `/me`, `/manage-clubs/*` → login; cron không/sai secret → 401 (có `CRON_SECRET`); không lỗi JS trên trang công khai. `/positions` trống vì đợt "Tuyển thành viên đợt 1 năm học 2026–2027" hết hạn 2026-11-07 (đúng thiết kế).
- Lệnh `vercel redeploy/promote` bị chốt an toàn chặn → người dùng làm trên dashboard. Nên bật Settings → Environments → Production → "Auto-assign Custom Production Domains" để lần sau tự cập nhật.
- Commit docs sau merge (`dff374c` trở đi) nằm trên nhánh `feat/member-roles-terms`, chưa vào `main` (chỉ tài liệu).

## Còn mở sau khi lên production
- Thử thật: đăng nhập Google vào tài khoản tạo sẵn; Gmail nhắc việc (chọn Gmail gửi ở màn Giao việc rồi "Gửi nhắc ngay"); bookmarklet trên bài Facebook thật.
- Kiểm Supabase Auth → URL Configuration: Site URL `https://bit-bav.vercel.app`, Redirect `https://bit-bav.vercel.app/auth/callback`; tắt "Allow new users to sign up".
- Quyết định về `xlsx@0.18.5` (lỗ hổng high chưa vá trên npm).
- Khuyến nghị bật 2FA cho tài khoản Vercel BIT.
