# Hợp đồng Đợt 7: sửa các vấn đề từ đợt rà soát toàn bộ (2026-11-11)

Hợp đồng cũ vẫn có hiệu lực: `docs/CONTRACT-1.md` … `docs/CONTRACT-6.md`. Nhánh: `fix/audit-round`.

Mục đích: sửa lỗi mức Cao, Trung bình và phần lớn mức Thấp tìm được khi rà soát. Không đổi giao diện tổng thể, không thêm thư viện.

## Dùng chung (lead đã viết, KHÔNG sửa)
- `src/lib/ui/friendly-error.ts`: `friendlyError(error: unknown, fallback: string): string`. Giữ thông báo tiếng Việt của hệ thống; đổi `23505` (trùng), `23503` (còn dữ liệu liên quan), `42501`/RLS (không có quyền), lỗi đăng nhập, lỗi mạng sang tiếng Việt; lỗi lạ trả `fallback` (không lộ chi tiết DB). Mọi chỗ đang đưa `error.message` của Supabase/Postgres ra người dùng phải đổi sang hàm này.

## Quyết định đã chốt
- Ban chủ chốt không có quyền "Quản lý thành viên" vẫn đọc danh sách thành viên (cần cho phỏng vấn, giao việc): GIỮ NGUYÊN.
- Chưa làm (để sau, ghi HANDOFF): nút Đăng nhập ở trang công khai; trang tra cứu đơn cho ứng viên; CSP đầy đủ có nonce; DOMPurify; nâng `nodemailer`/thay `xlsx`; Turnstile; giới hạn số mail/ngày bằng bảng đếm; sao lưu tự động.

## DB (db-agent) — `supabase/migrations/20261119000000_audit_fixes.sql`, `supabase/tests/audit_fixes.test.sql`, sửa test cũ nếu cần, `docs/database.md`
1. **Link phỏng vấn không lộ cho anon.** `revoke select on public.interview_sessions from anon`; `grant select (id, campaign_id, position_id, round, start_time, end_time) on public.interview_sessions to anon`. Policy công khai giữ nguyên điều kiện. (Code hiện không có chỗ nào đọc bảng này bằng anon; trang nộp đơn dùng service-role.) Test: anon không đọc được `meeting_link`, `location`, `note`.
2. **Không xóa dây chuyền mất đơn.** Đổi FK sang `ON DELETE RESTRICT`: `applications.campaign_id`, `applications.position_id`, `application_answers.question_id`. Xóa đợt/vị trí/câu hỏi/biểu mẫu khi CÒN đơn hoặc câu trả lời phải lỗi `23503`; khi chưa có thì xóa được như cũ (kiểm tra mọi đường cascade khác vẫn chạy: campaign → positions → forms → questions; interview_sessions). Test cả hai chiều.
3. **`import_members`: người gọi không phải Chủ nhiệm không được cập nhật gì ở dòng owner/admin** (tên, email, SĐT, MSSV, lớp, Facebook, chức danh, ban). Dòng đó bị bỏ qua hoàn toàn và đếm vào khóa trả về `staff_team_skipped` (giữ tên khóa để không đổi hợp đồng API). Chủ nhiệm: như hiện tại. Test.
4. **`admit_applications`:** nếu thành viên được ghép có role owner/admin và người gọi KHÔNG phải Chủ nhiệm (`is_club_head`) thì chỉ gắn `admitted_member_id`, không thêm ban, không đặt ban chính, không sửa gì khác. Test (admin tự kết nạp chính mình không đổi được ban).
5. **Sức chứa ca phỏng vấn:** trong `enforce_interview_assignment_integrity` khóa dòng ca (`select ... for update`) trước khi đếm, và chỉ đếm `status in ('scheduled','attended')`. Test đếm.
6. **`submit_application` trùng email:** bắt `unique_violation`, `raise exception 'Email này đã nộp đơn cho vị trí này.'` (không lộ key). Giữ nguyên giới hạn 100 KB / 200 câu đã có.
7. **Câu hỏi "Thời gian có thể tham gia phỏng vấn" không còn do trang công khai tạo.** Thêm trigger `after insert on interview_sessions` (security definer, `set search_path = public`, thu quyền khỏi public/anon/authenticated): nếu `new.position_id` có biểu mẫu mà biểu mẫu chưa có câu hỏi đó (so `lower(btrim(question_text))`) thì chèn câu `long_text`, `is_required = true`, `field_key null`, `order_index` = max + 1. Backfill một lần cho các biểu mẫu đang có ca phỏng vấn còn hiệu lực mà thiếu câu. Không chèn trùng (dùng unique index `form_questions_interview_availability_unique` nếu có, kiểm tra trước).
8. **Dời hạn việc thì nhắc lại được:** trigger `before update of due_at on tasks`: khi `due_at` đổi thì đặt `reminded_before_at = null, reminded_overdue_at = null` cho mọi `task_assignees` của việc đó (làm trong trigger `after update` nếu cần). Test.
9. **Thu quyền thừa (phòng thủ chiều sâu):** với từng bảng `public`, nếu KHÔNG có policy `insert`/`update`/`delete`/`all` cho authenticated thì `revoke` đúng quyền đó của authenticated; `revoke select` của anon trên các bảng không có policy select cho anon. Truncate/references/trigger đã thu ở `20261117`. Liệt kê bảng bị thu trong báo cáo. KHÔNG được làm hỏng luồng nào đang ghi từ client (kiểm tra bằng toàn bộ test cũ).
10. **Index:** `application_answers(question_id)`, `interview_session_members(member_id)`, `club_members(user_id)`.
11. **Test bền:** sửa `supabase/tests/member_teams.test.sql` (test backfill) để chỉ so các `member_id` do test tạo, không vỡ khi DB local có dữ liệu thật.

## API (api-agent) — `src/app/api/**`, `src/app/auth/**`, `src/lib/**` (TRỪ `src/lib/ui/friendly-error.ts` và `src/lib/email/sender.ts`, `src/lib/files/parse.ts`, `src/lib/email/template.ts` — thuộc FE-1), `next.config.ts`, `tests/unit/**` cho phần của mình
1. **`/api/send-email`:**
   - `request.json()` lỗi → 400.
   - `to`: đúng MỘT địa chỉ, khớp `EMAIL_PATTERN` và không chứa `,;<>"` hay khoảng trắng; sai → 400 "Địa chỉ người nhận không hợp lệ.".
   - `from`: bỏ địa chỉ client gửi; luôn dùng email tài khoản Google của người gọi (`user.email`), chỉ cho phép tên hiển thị (lấy phần trước `<` nếu client gửi dạng `"Tên" <x>`), làm sạch như `quoteDisplayName` ở `src/lib/tasks/dispatch.ts`.
   - Giới hạn: `subject` ≤ 300 ký tự, `html` ≤ 500 KB, `imageAttachment.content` ≤ 7 MB (base64), `filename` ≤ 200 ký tự, `contentType` phải bắt đầu `image/`.
2. **`/api/admin/club-members` PATCH:** người gọi KHÔNG phải Chủ nhiệm thì không sửa được BẤT KỲ trường nào của dòng owner/admin (kể cả tên, email, SĐT, Facebook, chức danh, MSSV, lớp) — 403 "Chỉ Chủ nhiệm mới có thể sửa thông tin thành viên Ban chủ nhiệm hoặc Ban chủ chốt.". `full_name` khi có phải không rỗng; giới hạn độ dài: `full_name` ≤ 120, `student_code` ≤ 30, `class_name` ≤ 50 (áp cả POST).
   - Khi dòng bị khóa (`is_active` → false) hoặc vai trò hạ xuống `member`, nếu `user_id` không còn là owner/admin đang hoạt động ở CLB nào khác thì xóa `google_mail_tokens` của user đó.
   - DELETE: nếu thành viên có `task_assignees` → 409 "Thành viên đã có lịch sử việc. Hãy tạm khóa (bỏ tick Đang hoạt động) thay vì xóa để giữ lịch sử.".
3. **Không lộ lỗi DB:** mọi `error.message` trả ra client ở `club-members`, `events`, `events/image`, `accounts`, `accounts/bulk` đổi sang `friendlyError(error, "<câu tiếng Việt cụ thể>")`; ghi `console.error` phía server (không ghi secret, email người nhận).
4. **`/api/admin/events`:** `image_url` chỉ nhận `https:`. **`/api/admin/events/image`:** kiểm `content-length` trước khi đọc form (≤ 5.5 MB), kiểm magic bytes JPG/PNG/WebP thay vì tin `file.type`.
5. **`/api/admin/accounts`:** POST kiểm `member.is_active` (khóa thì 409); GET dùng `loadUserIndex` một lần thay vì `getUserById` từng người. **`accounts/bulk`:** `export const maxDuration = 60`, dừng sớm và trả kết quả dở (`status: "skipped"`, message "Hết thời gian, hãy bấm lại để làm tiếp.") khi còn < 8 giây.
6. **Cron `/api/cron/task-reminders` và `src/lib/tasks/dispatch.ts`:** ngân sách thời gian — `sendReminderMails` nhận `deadlineMs`; trước khi giữ chỗ (claim) cho một người, nếu `Date.now() > deadlineMs` thì dừng (không claim). Cron đặt deadline = lúc bắt đầu + 50 giây. Kết quả trả thêm `deferred` (số người để lượt sau).
7. **`next.config.ts`:** thêm header `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

## Giao diện nhóm 1 (frontend-agent FE-1: tuyển + gửi mail + trang công khai), skill `impeccable`
Files: `src/components/admin/recruitment/**` (TRỪ `TeamsManager.tsx` — thuộc FE-2), `src/components/MailMergeApp.tsx`, `src/components/campaign/**`, `src/components/data/**`, `src/components/email/**`, `src/hooks/useSender.ts`, `src/hooks/useTemplates.ts`, `src/lib/email/sender.ts`, `src/lib/email/template.ts`, `src/lib/files/parse.ts`, `src/app/positions/**`, `src/components/ApplyForm.tsx`, `src/components/recruitment/**`, `src/app/manage-clubs/mail/**`, `src/app/manage-clubs/recruitment/**`.
1. **Câu trả lời không bị cắt 1000 dòng:** `ApplicationsManager` và `InterviewsManager` tải `application_answers` theo lô ≤ 50 đơn mỗi truy vấn (tránh URL quá dài), và mỗi lô phân trang `.range()` tới khi hết. Tách hàm tải chung (vd `src/components/admin/recruitment/loadAnswers.ts`) và có test nếu tách được phần thuần.
2. **Link họp:** chỉ lưu và chỉ render `<a>` khi khớp `^https?://` (lưu sai → báo lỗi tiếng Việt).
3. **Phỏng vấn:** `load()` sau "Lưu người hỗ trợ"/"Thêm vào ca" không xóa điểm/nhận xét/kết quả đang nháp của các ứng viên khác (chỉ khởi tạo draft cho dòng mới).
4. **Đơn đã kết nạp:** khóa ô trạng thái (hoặc hỏi xác nhận) khi đơn có `admitted_member_id`.
5. **Gửi mail hàng loạt:** hộp xác nhận "Gửi cho N người?" (ghi rõ số đã gửi trước đó); mặc định chỉ gửi dòng chưa gửi hoặc lỗi; chặn khi tiêu đề/nội dung rỗng; nhắc giới hạn Gmail ~500 mail/ngày khi N lớn. Gửi từng người một như hiện tại.
6. **Import đơn ứng tuyển trong Gửi mail:** có ô chọn đợt (và vị trí, tùy chọn), loại email trùng, hiện số người trước khi nạp; tải phân trang (không cắt 1000).
7. **Bản nháp mail:** KHÔNG lưu danh sách người nhận (`rows`) vào localStorage — chỉ tiêu đề, nội dung, mẫu. Khóa localStorage gắn theo `clubId`. Mọi `localStorage` bọc try/catch.
8. **Đọc file người nhận (`parse.ts`):** CSV một cột không lỗi; chỉ chặn lỗi Papa thật (bỏ qua `UndetectableDelimiter`, `TooFewFields`/`TooManyFields` thì cảnh báo); XLSX đọc `raw: false` để giữ số 0 đầu và ngày dạng chữ; thông báo lỗi tiếng Việt. Có test unit cho phần thuần nếu tách được.
9. **`src/lib/email/sender.ts`:** lấy `clubId` từ tham số (truyền từ context CLB đang chọn), không đọc cookie `admin_club`.
10. **Xem trước mail (`PreviewPanel`):** hiển thị trong `<iframe sandbox="" srcDoc=...>` (không cho script), bỏ `dangerouslySetInnerHTML`.
11. **Trang nộp đơn `src/app/positions/[id]/apply/page.tsx`:** XÓA đoạn tạo câu hỏi bằng service-role (DB đã có trigger mục 7). Chỉ đọc. Vẫn đọc ca phỏng vấn bằng service-role chỉ các cột `id,position_id,start_time,end_time`. Ẩn nút "Ứng tuyển" ở trang công khai khi vị trí chưa có biểu mẫu nếu dữ liệu sẵn có.
12. Lỗi Supabase hiện cho người dùng → `friendlyError`. `RecruitmentManager`: bỏ thông báo nhắc file migration không còn tồn tại; kiểm ngày kết thúc ≥ ngày bắt đầu trước khi lưu. Thông báo kỹ thuật "Hãy kiểm tra policy RLS…" ở trang công khai → câu thân thiện. `fetch` + `response.json()` bọc try/catch để không kẹt "Đang tải…". Hộp thoại `ApplicantImportDialog`, `ApplicantAnswersModal`: giữ focus trong hộp, Esc đóng, focus vào hộp khi mở.
13. Khi xóa đợt/vị trí/câu hỏi/biểu mẫu bị DB từ chối (`23503`) → hiện câu tiếng Việt (qua `friendlyError`).

## Giao diện nhóm 2 (frontend-agent FE-2: thành viên, tài khoản, nhiệm kỳ, việc, Facebook, khung, sự kiện, khung quản trị), skill `impeccable`
Files: `src/components/admin/*.tsx` (KHÔNG gồm thư mục `recruitment/`), `src/components/admin/memberImport.ts`, `src/components/admin/tasks/**`, `src/components/admin/scan/**`, `src/components/admin/frames/**`, `src/components/auth/**`, `src/components/member/**`, `src/components/navigation/**`, `src/components/home/**`, `src/app/manage-clubs/**` (TRỪ `mail/` và `recruitment/`), `src/app/me/**`, `src/app/login/**`, `src/app/page.tsx`, `src/app/events/**`, `src/app/clubs/**`.
1. **Dữ liệu cũ giữa các tab:** `ClubMembersManager`, `TasksManager`, `TermsManager`, `ContributionBoard`, `ClubAccountsManager` nghe sự kiện `bit:teams-changed` và `bit:members-changed` để tải lại; `MemberImportDialog`/`ClubMembersManager` phát `bit:members-changed` sau import, thêm/sửa/xóa thành viên. (`TeamsManager` đã phát `bit:teams-changed`; `RecruitmentManager` (FE-1) đang nghe sự kiện này — không đổi tên sự kiện.)
2. **Nhiệm kỳ:** đang sửa dở (`dirty`) mà chọn nhiệm kỳ khác → hỏi xác nhận; sau khi kích hoạt gọi `router.refresh()`.
3. **Quản lý thành viên:** ô "Đang hoạt động" và mọi ô thông tin bị vô hiệu khi người dùng không phải Chủ nhiệm mà dòng là owner/admin (khớp API mới), kèm một dòng giải thích; thêm ô tìm kiếm theo tên/MSSV/email (bỏ dấu tiếng Việt khi so, có sẵn `src/lib/recruitment/search.ts`); thông báo import đổi theo hành vi mới của `staff_team_skipped` ("Bỏ qua W người thuộc Ban chủ nhiệm/Ban chủ chốt (chỉ Chủ nhiệm cập nhật được).") trong `memberImport.ts`; xử lý 409 khi xóa người có lịch sử việc (gợi ý tạm khóa).
4. **Quản lý tài khoản:** nhấn Enter trong ô email KHÔNG gửi mời — mặc định là "Tạo tài khoản (đăng nhập bằng Google)"; xóa `memberId` sau khi gán thành công.
5. **Quản lí ban (`src/components/admin/recruitment/TeamsManager.tsx` — NGOẠI LỆ: file này FE-2 sửa, FE-1 không đụng):** chặn xóa ban khi còn việc (`tasks.team_id`) chưa đóng, báo số việc.
6. **Đối chiếu Facebook:** khi việc loại "Tương tác bài viết" có `post_url` khác bài đã quét (`scan.source`, so theo id bài / đường dẫn sau khi bỏ query) → cảnh báo vàng trước nút "Đánh dấu xong" và cần bấm xác nhận.
7. **Sự kiện:** thêm nút ↑/↓ để sắp xếp bằng bàn phím/điện thoại (ngoài kéo thả).
8. **Hộp thoại** `MemberImportDialog`, hộp xác nhận ở `ClubMembersManager`/`TasksManager`/`FramesManager`/`TermsManager`: giữ focus trong hộp, Esc đóng, focus vào hộp khi mở.
9. Lỗi Supabase hiện cho người dùng → `friendlyError`; `fetch` + `response.json()` bọc try/catch. `LoginGate`: sửa chữ "email/password do quản trị viên cấp" thành hướng dẫn đăng nhập bằng Google. Cookie `admin_club` đặt thêm `Secure` khi chạy https.

## Kiểm thử (tester, sau khi các nhóm trên xong)
Chạy toàn bộ: `npm test`, `npx tsc --noEmit`, `npm run build`, `npx supabase db reset && npx supabase test db`, lint các file đã đổi. Dựng web local nối Supabase local (dữ liệu thử: CLB, 4 ban, Chủ nhiệm, 1 admin có quyền members+recruitment ở một ban, 1 member), đi thử từng mục của hợp đồng bằng trình duyệt và bằng gọi API/REST trực tiếp (thử vượt quyền). Báo cáo từng mục: đạt/không đạt kèm bằng chứng.

## Thứ tự
DB ‖ API ‖ FE-1 ‖ FE-2 (song song, file tách biệt) → lead chạy test + build → tester + reviewer (song song) → sửa → lead kiểm chứng cuối → người dùng merge PR → `npx supabase db push --remote` TRƯỚC khi merge (migration tương thích ngược với code cũ).
