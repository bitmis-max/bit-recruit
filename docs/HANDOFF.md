# Handoff

Cập nhật: 2026-11-11 (tối) — Đợt 0–6 + vá bảo mật đã lên production (code + DB). Còn lại: người dùng import 3 file thành viên, thử các luồng chưa kiểm chứng, vài quyết định.

## Trạng thái
- **Web:** https://bit-bav.vercel.app (Vercel project `bit-bav`, tài khoản `bitmis-3939`, Auto-assign tên miền production đã bật).
- **Git:** `main` = `d5cb108` (đã gộp PR #5, #6 của KLinh/PLinh). Nhánh `feat/about-page` (local, chưa push): `174b908` Đợt 7 + `8f8b577` Đợt 8. Các PR đã merge: #1 Đợt 0–3 + import ứng viên, #2 Đợt 4 phân quyền, #4 vá bảo mật + Đợt 6 nhiều ban (gộp một PR), #3 Đợt 5 import thành viên + hướng dẫn. Không còn nhánh đang làm.
- **DB thật** (`rftgnkgnyvtehnsjwuhp`): đã nâng cấp từ schema legacy, giữ dữ liệu (55 đơn, 2365 câu trả lời…). Migration local = remote: `20261023000000` (baseline, đánh dấu bằng `migration repair`) → `20261110` vai trò/nhiệm kỳ → `20261111` giao việc → `20261112` Facebook/khung avatar → `20261113` thu quyền anon → `20261114` import ứng viên → `20261115` phân quyền → `20261116` import thành viên. → `20261117` vá bảo mật → `20261118` nhiều ban (người dùng đã `db push` 2026-11-11; lead kiểm chứng chỉ đọc: bảng `club_member_teams` có RLS + 1 policy, `set_member_teams` chỉ service_role, anon không ghi được bảng nào, 2 bucket mẫu đã khóa).
- **Dữ liệu quản trị hiện có:** 1 Chủ nhiệm (tài khoản BIT, owner `is_head`), 2 thành viên. Chưa ai khác có tài khoản / quyền.
- **Test (local):** `npm test` 111/111, `npx supabase test db` 1041/1041 (9 file). tsc sạch, build sạch.
- **Tài liệu:** hướng dẫn người dùng `docs/HUONG-DAN-SU-DUNG.md`; thiết kế DB `docs/database.md`; hợp đồng từng đợt `docs/CONTRACT-1.md` … `docs/CONTRACT-5.md`, `docs/CONTRACT.md` (Đợt 6: nhiều ban).

## Chức năng đã có
- Vai trò: Chủ nhiệm (`is_head`, duy nhất đổi nhiệm kỳ + cấp quyền), Ban chủ nhiệm (owner, toàn quyền vận hành), Ban chủ chốt (admin, quyền tick riêng: `events`, `recruitment`, `members`, `mail`, `facebook`; giao việc/đóng góp chỉ ban mình), Thành viên (`/me`), Ứng viên (không tài khoản).
- Nhiệm kỳ: Chủ nhiệm tạo nháp → chọn người, Chủ nhiệm mới, quyền → kích hoạt.
- Tuyển: đợt/vị trí/biểu mẫu theo vị trí, ca phỏng vấn, kết quả/điểm, trạng thái đơn, kết nạp, import đơn Excel (RPC `import_applications`).
- Thành viên: import Excel/Google Sheet (RPC `import_members`), tạo tài khoản hàng loạt (đăng nhập Google, không gửi mail).
- Giao việc + nhắc Gmail (Vercel Cron 01:00 UTC, `/api/cron/task-reminders`, `CRON_SECRET`), bảng đóng góp.
- Đối chiếu Facebook bằng bookmarklet, alias tài khoản, khung avatar + trang công khai `/frames/[id]`.
- Gửi mail hàng loạt qua Gmail API.

## Việc người dùng cần làm tiếp
1. **Chuyển dữ liệu thật:** kiểm tra Quản lí ban (đủ Chuyên môn / Truyền thông / Nhân sự, tên khớp Sheet) → tải Google Sheet thành viên (.xlsx) → Quản lý thành viên → Import Excel → Tạo tài khoản cho thành viên có email → Nhiệm kỳ: cấp vai trò, Chủ nhiệm, quyền.
2. **Thử 3 luồng chưa kiểm chứng trên web thật** (lỗi thì gửi ảnh/thông báo cho lead):
   - Thành viên đăng nhập Google vào tài khoản tạo sẵn (Supabase có tự gắn identity Google không).
   - Chọn Gmail gửi nhắc (Giao việc) → "Gửi nhắc ngay" → mail có đến không (logic chống gửi trùng chưa chạy thật).
   - Bookmarklet trên bài Facebook thật (DOM thật, CSP, CORS ảnh fbcdn).
3. **Cấu hình nên kiểm:** Supabase Auth → URL Configuration: Site URL `https://bit-bav.vercel.app`, Redirect `https://bit-bav.vercel.app/auth/callback`; tắt "Allow new users to sign up". Bật 2FA cho GitHub `bitmis-max` và Vercel BIT.

## Quy trình làm việc đã chốt
- Code mới: nhánh riêng → push bằng tài khoản `buiducthinh250506-cell` → PR → **tài khoản BIT (`bitmis-max`) bấm Merge** (Vercel Hobby chỉ build commit của chủ project; preview các commit khác bị "Blocked" — bình thường).
- Migration mới: lead thử trên Supabase local + pgTAP → **người dùng tự chạy** `npx supabase db push --remote --dry-run` rồi `npx supabase db push --remote` (lệnh ghi DB thật / deploy production của lead bị chốt an toàn Claude Code chặn — không lách).
- Đọc DB thật chỉ bằng lệnh read-only (`npx supabase db query --remote --read-only`, MCP `get_advisors`).
- **Không thêm dòng ghi công Claude** (`Co-Authored-By`, "Generated with Claude Code") vào commit/PR.
- Biến môi trường Vercel: đã có sẵn `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` (KHÔNG ghi đè — giải mã token Gmail đã lưu), `NEXT_PUBLIC_SUPABASE_*`, `SMTP_*`; lead thêm `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`. Vercel CLI đang login `bitmis-3939`, thư mục đã `vercel link` (`.vercel/`, gitignored).
- Agent dùng model Sonnet; bị dừng do giới hạn sử dụng thì nhắn agent cũ làm tiếp sau giờ reset.

## Quyết định đã chốt
- Người dùng: vai trò/quyền như trên; nhắc qua web + Gmail (không Messenger); Facebook/avatar bằng bookmarklet; nâng cấp DB giữ dữ liệu; import thành viên bằng nút Import Excel; lead tự lên kế hoạch và làm tiếp, cập nhật HANDOFF thường xuyên.
- Lead: tài khoản thành viên tạo không gửi mail, đăng nhập Google; mỗi vị trí một biểu mẫu (giữ `position_id`, SQL đổi sang `campaign_id` của main ngày 27/10 đã lưu trữ ở `supabase/migration/legacy/` với dòng "KHÔNG CHẠY"); việc `closed` không tính bỏ lỡ cho người còn chờ; email nhận nhắc lấy từ `club_members.email`; trang scan không tick sẵn; import không đổi vai trò/quyền/tài khoản.

## Đợt bảo mật (2026-11-11) — ĐÃ LÊN PRODUCTION (vào `main` qua PR #4, migration `20261117` đã đẩy)
- Rà soát: API, RLS, storage, thư viện, header. Báo cáo đã gửi người dùng; người dùng duyệt Đợt A.
- Đã làm (local, test xanh: unit 104/104, pgTAP 939/939, build sạch):
  - Migration `20261117000000_security_hardening.sql`: bỏ policy cho phép ai cũng tải lên bucket mẫu `thumbnails`/`videos` (khóa bucket); thu quyền ghi bảng của `anon`; `submit_application` từ chối đơn > 100 KB hoặc > 200 câu trả lời. Test: `supabase/tests/security_hardening.test.sql`.
  - `next` 16.2.6 → 16.4.6 (lỗ hổng critical), `@tiptap/*` 3.33.1, `prosemirror-view` 1.42.9 (XSS khi dán).
  - `next.config.ts`: header chống clickjacking (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), `nosniff`, `Referrer-Policy`, tắt `X-Powered-By`.
  - `/api/admin/accounts` PATCH: chỉ Chủ nhiệm đổi được email đăng nhập.
  - Danh sách thành viên: ẩn nút "Xóa" ở dòng Chủ nhiệm (và dòng BCN/BCC khi không phải Chủ nhiệm). Server vốn đã chặn.
- Trạng thái: đăng ký mới đã TẮT (`disable_signup: true`, kiểm 2026-11-11). Còn lại cho người dùng: bật Leaked password protection (advisor vẫn báo tắt); thử thành viên tạo sẵn đăng nhập Google sau khi tắt đăng ký (CHƯA kiểm chứng); mở thử trang Gửi mail (tiptap đã nâng bản); xóa hẳn bucket `thumbnails`/`videos` nếu muốn.
- Để sau (người dùng chọn "tính sau"): Turnstile chống spam; thay `xlsx` (dùng cho import thành viên, import ứng viên, gửi mail); nâng `nodemailer` v10 (major).

## Đợt 6: một thành viên thuộc nhiều ban (2026-11-11) — ĐÃ LÊN PRODUCTION (PR #4, migration `20261118` đã đẩy)
- Hợp đồng: `docs/CONTRACT.md`. Quyết định người dùng: cho 1 người nhiều ban; import gặp người đã có thì THÊM ban (không ghi đè).
- DB `20261118000000_member_teams.sql`: bảng `club_member_teams`; `club_members.team_id` = ban chính (dùng phân quyền Ban chủ chốt, `my_club_team` không đổi); RPC `set_member_teams` (chỉ service_role); sửa `can_assign_task_member`, `create_task`, `club_contribution` (+`team_ids`, admin chỉ đếm việc ban mình), `import_members`, `admit_applications` (người cũ đậu ban mới → thêm ban), `activate_term` (nhiệm kỳ đổi ban chính → gỡ ban chính cũ).
- API `/api/admin/club-members`: `team_ids`; UI chọn nhiều ban + ban chính; Giao việc/Đóng góp/`/me`/Phỏng vấn/Xóa ban đọc tập ban. Hướng dẫn `docs/HUONG-DAN-SU-DUNG.md` mục 7.1, 7.4 đã cập nhật.
- Kiểm chứng local: pgTAP 1041/1041, unit 111/111, tsc + build sạch; import 3 file thật (BCM 23, BTT 17, BTC 52) trên Supabase local → 91 người, Bảo Bảo (BCM+BTC) và Trung Đức (BTT+BTC) đủ 2 ban; sửa SĐT không mất ban; import lại không tạo trùng. Reviewer đã rà, các lỗi Cao/Trung bình đã sửa.
- File import của người dùng (Downloads): `ban-chuyen-mon-import.xlsx`, `ban-truyen-thong-import.xlsx`, `ban-to-chuc-import.xlsx` — chỉ import SAU khi Đợt 6 lên DB thật. Link Facebook dạng /share/ đã đổi sang link trang cá nhân thật.
- Còn để ngỏ (thấp): PATCH thành viên không nguyên tử (cập nhật trường rồi mới set ban); chưa có test cho API route.

## Đợt 7: sửa lỗi từ đợt rà soát (nhánh `fix/audit-round`, commit local 2026-11-26, CHƯA push)
- Hợp đồng: `docs/CONTRACT.md` (Đợt 7). Hợp đồng Đợt 6 đổi tên thành `docs/CONTRACT-6.md`.
- Migration `20261119000000_audit_fixes.sql` (CHƯA lên DB thật) + test `supabase/tests/audit_fixes.test.sql`.
- Kiểm chứng 2026-11-26: unit 140/140, tsc sạch. pgTAP CHƯA chạy lại trong phiên này (Docker tắt). Lint còn lỗi `set-state-in-effect` cũ (xem nợ kỹ thuật).
- Đã gộp `origin/main` (d5cb108: trang chủ, navbar, trang sự kiện của KLinh/PLinh) vào nhánh.

## Đợt 8 (2026-11-26 → 28): trang Giới thiệu + dọn admin — commit local `8f8b577` trên `feat/about-page`, CHƯA push, migration 20261119 + 20261120 CHƯA lên DB thật
- Người dùng chọn: trang `/clubs` làm lại theo hướng "bản đồ cơ cấu" (4 ban dạng thẻ); thêm 2 trường cho ban ("Việc chính", "Hợp với bạn nếu…") vào DB, sửa được trong Quản lí ban; lead soạn nháp nội dung. Ảnh ban đã sửa được trong admin (không làm thêm). Nhánh `feat/about-page` tách từ `fix/audit-round`.
- Admin: rà soát trước (chụp từng màn trên local), gửi người dùng duyệt rồi mới sửa.
- Đã làm (chưa commit): migration `20261120000000_team_profile.sql` (+ nháp nội dung 4 ban) + test `team_profile.test.sql`; trang `/clubs` mới (`ClubTeamCards.tsx` thay `ClubStructureTabs.tsx`); `FlipClockCountdown` không còn nút "Đăng ký ngay" khi chưa có đợt mở (thay bằng nút Facebook); `TeamsManager` thêm ô "Việc chính" + "Hợp với bạn nếu…". Hợp đồng `docs/CONTRACT.md` (Đợt 8).
- Kiểm chứng: pgTAP 1120/1120 (gồm Đợt 7), unit 140/140, tsc sạch; chụp `/clubs` desktop + 375px, mở rộng thẻ bằng bàn phím, form Quản lí ban hiện 2 ô mới.
- **Thứ tự lên production:** người dùng `db push` migration `20261119` + `20261120` TRƯỚC, rồi mới merge code (code đọc cột `duties`, `fit_for`).
- Local: CLB "BIT" ở Supabase local vốn không có ban; lead đã thêm 4 ban (chép mô tả từ DB thật) để thử. Tài khoản local `chunhiem@local.test` / `localtest123`. Chạy dev với Supabase local: ghi đè `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` bằng giá trị từ `npx supabase status` (vì `.env.local` trỏ DB thật).
- Admin A + B ĐÃ LÀM (chưa commit, người dùng chọn A+B trước, C đợt sau): menu 4 nhóm (Thành viên / Tuyển thành viên / Hoạt động / Truyền thông), bỏ thanh tab trên 3 màn tuyển (xóa `RecruitmentTabs.tsx`, `recruitment/layout.tsx`); Tổng quan = `AdminOverview.tsx` (đơn chờ, đợt mở, việc quá hạn/sắp hạn, thành viên, chưa có tài khoản; ẩn theo quyền). Mobile: menu thu gọn thành nút. Chưa thử bằng tài khoản admin ít quyền. `src/app/manage-clubs/page.tsx` (Tổng quan cũ) không còn được hiển thị — có thể dọn sau.
- Admin C ĐANG LÀM (2026-11-27, người dùng yêu cầu "tối ưu" toàn bộ admin): hợp đồng mục "Admin C" trong `docs/CONTRACT.md`; bộ dùng chung `src/components/admin/ui/` + `docs/ADMIN-UI.md` đã xong (agent KIT, màn mẫu TeamsManager/AdminShell/AdminOverview); 5 agent song song: M (thành viên/tài khoản/nhiệm kỳ), R1 (đợt tuyển + biểu mẫu), R2 (đơn + phỏng vấn), A1 (giao việc/đóng góp/sự kiện), A2 (gửi mail/đối chiếu FB/khung avatar). Sau đó: lead kiểm + reviewer.
  - 5 agent đã xong (2026-11-27). Lead đã: sửa gốc `ui/Notice.tsx` (chữ bị bóp ở 375px khi có `action`); đổi tiêu đề trang khớp menu ("Đợt tuyển", "Đơn ứng tuyển", "Thành viên"…). Kiểm 15 màn × 1440/375: tiêu đề đúng, không tràn ngang, không lỗi; Đợt tuyển 212 nút/16.224px → 7 nút/926px. tsc sạch, unit 144/144, lint 31 lỗi (trước 32, đều là lỗi cũ).
  - Reviewer rà Admin C: không có lỗi Cao. Đã sửa: (TB) `CreatePanel` trả focus về nút mở khi đóng + 10 nút mở panel bỏ `disabled` (dùng `aria-expanded`, bấm lại khi đang mở thì không làm gì); (TB) trình sửa biểu mẫu cảnh báo thay đổi chưa lưu khi Quay lại / đổi đợt / đóng-mở vị trí (`onDirtyChange` của FormBuilder; bỏ thay đổi thì tải lại từ DB) — đã thử bằng trình duyệt; (Thấp) xóa thông báo cũ trước khi lưu ở FormBuilder; số câu hỏi tải lỗi hiện "Chưa tải được số câu hỏi" thay vì "Chưa có biểu mẫu"; `OTHER_OPTION` tách sang `recruitment/otherOption.ts` để trang ứng tuyển công khai không kéo bộ UI admin. Còn để ngỏ (Thấp): mất nháp khi chuyển ngữ cảnh (Members openEdit, Interviews, Accounts Hủy); Esc đóng CreatePanel khi đang lưu (vô hại); nút xóa khung avatar vẫn trên thẻ; `<main>` lồng ở tab Gửi mail (AdminShell).
  - Thanh menu (2026-11-28, người dùng chỉ ra): tiêu đề nhóm viết thường + cách nhóm trên `mt-6` (trước chữ hoa có dấu bị chật, nhóm dính nhau); nhóm đầu đổi tên "CLB" (tránh trùng mục "Thành viên"); mỗi mục có icon (thêm 12 icon vào `ui/Icon.tsx`); thanh bên sticky cao bằng màn hình, tự cuộn, nút Đăng xuất luôn ở đáy; mobile: khối email/Đăng xuất chỉ hiện khi mở Menu; bỏ `<main>` lồng ở tab Gửi mail.
  - Chưa thử thật (không được ghi dữ liệu khi kiểm): lưu/xóa/kết nạp/gửi mail/đánh dấu xong; thanh "Kết nạp" khi chọn đơn (local không có đơn "Đạt" chưa kết nạp). Mobile: khối email + Đăng xuất của AdminShell nằm giữa nút Menu và nội dung (bố cục cũ). `useSender` còn dùng `alert()`.
- (mô tả gốc Admin C) danh sách trước / form "+ Thêm" sau (Thành viên, Đợt tuyển, Giao việc, Sự kiện); tách trình sửa biểu mẫu khỏi trang Đợt tuyển; thu gọn bảng Đơn ứng tuyển; mỗi màn một nút chính; thống nhất nhãn nhỏ.
- Người dùng chưa xem trang Giới thiệu ("tính sau") → chưa commit Đợt 8.
- Reviewer đã rà Đợt 8; đã sửa: (Cao) `globals.css` bị xóa nhầm khối CSS trang /events + /positions + form ứng tuyển → khôi phục y hệt HEAD; (TB) đợt mở không đặt hạn bị mất nút "Đăng ký ngay" → `src/components/home/openCampaign.ts` (`pickOpenCampaign`, test `tests/unit/open-campaign.test.ts`) dùng chung cho `/`, `/events`, `/clubs`, khối đếm ngược thêm trạng thái "Đợt tuyển đang mở, chưa đặt hạn đóng đơn."; (TB) ô "Đợt tuyển đang mở" ở Tổng quan ưu tiên đợt còn hạn, đợt quá hạn chưa đóng được tô vàng; (TB) backfill nháp chỉ trong CLB tạo đầu tiên (DB thật chỉ có 1 CLB BIT, 4 ban — kiểm chỉ đọc); (Thấp) dep effect TeamsManager so nội dung `duties`. Còn để ngỏ (thấp): AdminOverview treo "đang tải" nếu thiếu env Supabase; rule nav overlay `.clubs-hero` cũ ở đầu globals.css thừa.
- Kiểm chứng sau sửa: unit 144/144, pgTAP 1120/1120, tsc sạch; chụp `/`, `/events`, `/positions`, `/clubs` (đợt mở không hạn hiện "Đăng ký ngay").
- Rà soát admin (2026-11-26) — kết quả gốc: menu 13 mục phẳng; Tổng quan trống; form "tạo mới" luôn mở chiếm cột trái (Thành viên, Đợt tuyển, Giao việc); trang Đợt tuyển nhúng cả trình sửa biểu mẫu (211 nút, dài ~16.000px); bảng Đơn ứng tuyển tràn ngang (cột "Câu trả lời" bị cắt); nhãn nhỏ không thống nhất ("Quản trị CLB"/"Không gian CLB"), "Quản lí"/"Quản lý"; chữ "trang Khám phá CLB" ở Quản lí ban đã lỗi thời (nay là "Giới thiệu").

## Còn mở / nợ kỹ thuật
- Câu hỏi chưa trả lời: gộp "Kết nạp" + "Tạo tài khoản" thành 1 bước? (đang giữ 2 bước).
- `xlsx@0.18.5` có lỗ hổng high chưa vá trên npm (dùng cho import và gửi mail) → chọn: bản SheetJS chính chủ ≥ 0.20 hoặc chỉ nhận CSV.
- Chống spam form ứng tuyển (Cloudflare Turnstile, cần tài khoản Cloudflare).
- SSRF còn khe DNS rebinding (chỉ admin gọi; `shortcut:` trong `src/lib/security/safe-fetch.ts`).
- Lưu danh sách nhiệm kỳ không nguyên tử (upsert rồi delete).
- Hết phiên đăng nhập giữa lúc quét Facebook: dữ liệu quét mất qua trang login.
- Lint `react-hooks/set-state-in-effect` ở các màn quản trị cũ (mẫu `useEffect(() => { void load(); })`).
- `form_templates` dùng chung mọi CLB (chấp nhận khi chỉ có BIT).
- Supabase gửi mail mặc định ~2 mail/giờ: chỉ ảnh hưởng nút "Mời" / quên mật khẩu; cần thì cấu hình SMTP riêng.
