# Hợp đồng Đợt 8: trang Giới thiệu "bản đồ cơ cấu" (2026-11-26)

Hợp đồng cũ vẫn có hiệu lực: `docs/CONTRACT-1.md` … `docs/CONTRACT-7.md`. Nhánh: `feat/about-page`.

## DB (lead đã làm) — `supabase/migrations/20261120000000_team_profile.sql`
- `teams.duties text[] not null default '{}'`: việc chính của ban, tối đa 6 phần tử, tổng ≤ 1200 ký tự (check `23514`).
- `teams.fit_for text` (null được): câu "Hợp với bạn nếu…", ≤ 300 ký tự.
- Quyền: theo policy sẵn có của `teams` (anon/authenticated đọc; admin có quyền `members` ghi). Không có RPC/API mới.
- Migration điền nội dung nháp cho 4 ban BIT (khớp theo tên) nếu chưa có nội dung.
- **Thứ tự lên production:** người dùng `db push` migration TRƯỚC, rồi mới merge code (code chọn cột mới; DB chưa có cột thì trang lỗi).

## FE (frontend-agent)
Skill chính: `impeccable` (giao diện đã có). Phạm vi file:
`src/components/recruitment/ClubsPage.tsx`, `src/components/recruitment/ClubStructureTabs.tsx` (được đổi tên/tách file trong `src/components/recruitment/`), `src/components/home/FlipClockCountdown.tsx`, `src/components/admin/recruitment/TeamsManager.tsx`, phần CSS `.clubs-*`, `.club-team-*`, `.countdown-*` trong `src/app/globals.css`.

1. **Trang `/clubs`**
   - Hero: tiêu đề tiếng Việt (gợi ý: nhãn "Cơ cấu CLB", tiêu đề "Bốn ban, một bản giao hưởng" — lấy từ ẩn dụ "bản giao hưởng BIT - BAV" CLB đang dùng). Câu giới thiệu "Được thành lập vào năm 2010…" đưa vào hero. Chữ không đè lên mặt người (đặt góc dưới, nền tối dần). Bỏ hộp giới thiệu + nút "Tìm hiểu thêm".
   - Các ban: hiện **tất cả** ban cùng lúc dạng thẻ (desktop 2 cột, mobile 1 cột; số ban bất kỳ). Thẻ: ảnh (`image_url`, thiếu thì ảnh dự phòng như hiện tại), tên ban, danh sách `duties` (ẩn nếu rỗng), dòng "Hợp với bạn nếu…" + `fit_for` (ẩn nếu null), và cách xem `description` đầy đủ (mở rộng tại chỗ hoặc hộp thoại; phải dùng được bằng bàn phím, có focus rõ). Ban chưa có `duties`/`fit_for` thì thẻ hiện đoạn đầu `description`.
   - Giữ thông báo khi lỗi tải / không có ban như hiện tại.
2. **Khối đếm ngược dùng chung (`FlipClockCountdown`)**: khi KHÔNG có đợt tuyển đang mở (không có hạn hoặc đã hết hạn) thì không hiện nút "Đăng ký ngay"; thay bằng nút phụ "Theo dõi BIT trên Facebook" → `https://www.facebook.com/BIT.BAV` (mở tab mới, `rel="noopener noreferrer"`). Có đợt mở thì giữ nguyên. Áp dụng cho cả trang chủ, `/events`, `/clubs`.
3. **Quản lí ban (`TeamsManager`)**: thêm 2 ô dưới "Mô tả":
   - "Việc chính" — textarea, gợi ý "Mỗi dòng một việc, tối đa 6". Lưu: tách dòng, trim, bỏ dòng rỗng → `duties`. Hơn 6 dòng hoặc một dòng > 200 ký tự thì báo lỗi tiếng Việt, không lưu.
   - "Hợp với bạn nếu…" — input/textarea ngắn, `maxLength` 300, rỗng → `null`.
   - Đọc/ghi cùng câu `select`/`update`/`insert` hiện có (thêm `duties,fit_for`).
4. Không thêm thư viện. Nội dung giao diện tiếng Việt. Giữ Tailwind v4 + CSS hiện có.

## Admin A + B (frontend-agent, agent mới) — `src/components/admin/AdminShell.tsx`, file mới `src/components/admin/AdminOverview.tsx`, `src/app/manage-clubs/recruitment/layout.tsx`, `src/components/admin/recruitment/RecruitmentTabs.tsx`
Skill chính: `impeccable` (màn đã có). Giữ phong cách admin hiện tại (Tailwind, zinc + emerald). Không sửa `globals.css`, không sửa các màn quản lý khác, không thêm thư viện, không đổi quyền.

**A. Menu theo nhóm** (giữ nguyên `allowed` của từng mục; nhóm không còn mục nào thì ẩn cả nhóm):
- (đầu) Tổng quan `/manage-clubs`
- **Thành viên:** Thành viên `/members` · Tài khoản `/accounts` · Ban `/teams` · Nhiệm kỳ `/terms`
- **Tuyển thành viên:** Đợt tuyển `/recruitment` · Đơn ứng tuyển `/recruitment/applications` · Phỏng vấn `/recruitment/interviews` · Biểu mẫu `/form-templates`
- **Hoạt động:** Giao việc `/tasks` · Đóng góp `/contribution` · Sự kiện `/events`
- **Truyền thông:** Gửi mail `/mail` · Đối chiếu Facebook `/scan` · Khung avatar `/frames`
- Mục đang mở được đánh dấu (`aria-current="page"`); "Đợt tuyển" chỉ sáng ở đúng `/manage-clubs/recruitment`.
- Đơn ứng tuyển / Phỏng vấn đã có trong menu nên bỏ thanh tab trên cùng (`RecruitmentTabs`) khỏi 3 màn tuyển (xóa component nếu không còn ai dùng).
- Mobile (375px): menu vẫn dùng được, không tràn.

**B. Tổng quan** (`AdminOverview`, thay nội dung trống của `/manage-clubs`): các ô số liệu, mỗi ô bấm được tới màn tương ứng; chỉ hiện ô người dùng có quyền (dùng `useAdminClub()` + `hasPermission` như AdminShell). Đọc bằng supabase client, RLS lo phạm vi; dùng `count: "exact", head: true` khi chỉ cần số.
- Quyền `recruitment`: **Đơn mới chờ xử lý** = `applications.status = 'submitted'` thuộc các đợt tuyển của CLB đang chọn → `/recruitment/applications`. **Đợt tuyển đang mở** = `recruitment_campaigns.status = 'open'` của CLB: tên + còn bao nhiêu ngày đến `end_date` (không có thì "Chưa có đợt mở") → `/recruitment`.
- Owner/admin (`isStaff`): **Việc quá hạn** = `tasks.status = 'open'` và `due_at < now`; **Việc sắp đến hạn** = `open` và `due_at` trong 72 giờ tới → `/tasks`.
- Quyền `members`: **Thành viên đang hoạt động** (`club_members.is_active`) và **Chưa có tài khoản** (`is_active`, `email` khác null, `user_id` null) → `/members`.
- Mỗi ô tự xử lý: đang tải (khung chờ), lỗi (hiện "—" + câu ngắn, không làm hỏng ô khác), số 0 (trạng thái bình thường, không báo động). Số cần chú ý (đơn chờ, việc quá hạn > 0) được nhấn mạnh nhẹ.

## Admin C — dọn gọn toàn bộ màn quản trị (2026-11-26)
Skill chính: `impeccable`, chế độ **Operate**, lệnh `distill` (+ `craft-floor`). Đây là REFINE trên giao diện đã có: giữ màu (zinc nền, emerald nhấn, rose = nguy hiểm, amber = cảnh báo), font, Tailwind; giữ nguyên mọi chức năng, quyền, câu chữ nghiệp vụ, luồng dữ liệu (supabase/API). Không thêm thư viện (icon tự vẽ SVG). Chỉ đổi cách trình bày và mức ẩn/hiện.

### Nguyên tắc chung (mọi màn)
1. **Đầu trang = `PageHeader`**: tiêu đề (h1) + 1 câu mô tả ngắn (nếu cần) + vùng hành động bên phải. **Bỏ nhãn nhỏ phía trên tiêu đề** ("Quản trị CLB", "Không gian CLB", "Hồ sơ tuyển thành viên"…) — skill cấm.
2. **Một hành động chính mỗi màn** (nút `primary`, emerald đặc). Hành động khác là `secondary` (viền) hoặc `ghost`. Không có 2 nút đặc cạnh nhau.
3. **Danh sách trước, form sau**: form "tạo mới" KHÔNG mở sẵn. Nút "+ Thêm …" (primary, ở PageHeader) mở form tạo trong `CreatePanel` (khung mở tại chỗ phía trên danh sách, có "Hủy", Esc đóng, focus vào ô đầu). Danh sách dùng hết bề ngang.
4. **Nút xóa không nằm trên mỗi dòng**: "Xóa" chuyển vào bên trong form sửa/chi tiết của mục đó (nút `danger` dạng ghost, cuối form, có xác nhận như hiện tại). Trên dòng chỉ còn 1 hành động (vd. "Sửa" hoặc bấm cả dòng).
5. **Không lồng khung trong khung**: một cấp viền. Nhóm bên trong dùng khoảng cách/đường kẻ mảnh, không thêm `border rounded` lồng nhau.
6. **Thông báo dùng `Notice`** (error = rose, role="alert"; success = emerald, role="status"; warning = amber). Không tự viết class thông báo riêng.
7. **Icon = `Icon`** (SVG tự vẽ, một nét). Không dùng ký tự ☰ ↑ ↓ ⠿ ✕ + làm icon.
8. Trạng thái đủ: hover, focus-visible (vòng emerald), disabled, đang tải (khung chờ, không spinner giữa nội dung), rỗng (câu hướng dẫn + nút làm việc đầu tiên), lỗi.
9. Mobile 375px: không tràn ngang; bảng rộng thì cuộn ngang trong khung riêng hoặc chuyển thành danh sách.

### Bộ dùng chung — `src/components/admin/ui/` (agent KIT làm trước, agent khác chỉ DÙNG, không sửa)
- `Button.tsx`: `<Button variant="primary|secondary|ghost|danger" size="sm|md" loading? icon?>`; `ButtonLink` (cùng kiểu, dùng `next/link`). Chiều cao md 36px, sm 30px, bo `rounded-lg`.
- `PageHeader.tsx`: `<PageHeader title description? actions? />` (h1 `text-2xl font-semibold`, mô tả `text-sm text-zinc-600`, max-w hợp lý; actions xuống dòng trên mobile).
- `Panel.tsx`: `<Panel title? actions? padded?>` — khung trắng viền zinc-200 bo xl; `title` là h2 `text-base font-semibold`.
- `CreatePanel.tsx`: `<CreatePanel open title onClose>{form}</CreatePanel>` — hiện tại chỗ, Esc/nút Hủy gọi onClose, focus phần tử `data-autofocus`.
- `Notice.tsx`: `<Notice tone="error|success|warning|info">`.
- `EmptyState.tsx`: `<EmptyState title description? action? />`.
- `Field.tsx`: `inputClass`, `<Field label hint? error?>{control}</Field>` (thống nhất ô nhập).
- `Icon.tsx`: `<Icon name="plus|edit|trash|chevron-down|chevron-right|arrow-up|arrow-down|grip|close|search|upload|refresh|external|menu|check|mail|calendar|users" />` (16px mặc định, `aria-hidden`).
- `docs/ADMIN-UI.md`: 1 trang quy tắc trên + ví dụ dùng.
- Agent KIT cũng áp bộ này cho: `AdminShell.tsx` (bỏ ký tự ▲/☰ nếu có), `AdminOverview.tsx` (bỏ nhãn nhỏ), `recruitment/TeamsManager.tsx` (màn mẫu: danh sách ban + form sửa; nút Xóa ban vào cuối form).

### Phân việc màn (sau khi KIT xong, chạy song song, không trùng file)
- **M — Thành viên:** `ClubMembersManager.tsx`, `ClubAccountsManager.tsx`, `MemberImportDialog.tsx`, `TermsManager.tsx`. Thành viên: bảng/danh sách full width; "+ Thêm thành viên" (primary) mở CreatePanel; "Import Excel" secondary; khối "Tạo tài khoản…" thành `Notice` warning chỉ hiện khi số > 0, kèm nút secondary; Sửa mở form (CreatePanel chế độ sửa hoặc mở rộng dòng), Xóa trong form.
- **R1 — Đợt tuyển & biểu mẫu:** `recruitment/RecruitmentManager.tsx`, `FormBuilder.tsx`, `QuestionFields.tsx`, `FormTemplatesManager.tsx`. Giữ chia 2 cột (danh sách đợt | chi tiết đợt). Form "Tạo đợt tuyển" ẩn sau nút "+ Đợt tuyển mới". Vị trí tuyển = danh sách dòng gọn (tên, ban, số câu hỏi, "Sửa"). **Trình sửa biểu mẫu KHÔNG nằm sẵn trong trang**: bấm "Sửa biểu mẫu (N câu)" trên vị trí → chi tiết đợt được thay bằng màn sửa biểu mẫu có nút "← Quay lại đợt tuyển". Câu hỏi = dòng thu gọn (số thứ tự, nội dung, loại, bắt buộc) bấm để mở sửa; trong dòng mở mới có Xóa; đổi thứ tự bằng nút icon lên/xuống (`ghost` sm, có `aria-label`).
- **R2 — Đơn & phỏng vấn:** `recruitment/ApplicationsManager.tsx`, `ApplicantAnswersModal.tsx`, `ApplicantImportDialog.tsx`, `InterviewsManager.tsx`. Đơn: thanh lọc gọn 1 hàng; bảng không tràn (cột: chọn, Ứng viên, Vị trí, Trạng thái, Nộp lúc, "Xem"); thời gian phỏng vấn + câu trả lời vào khung chi tiết (giữ modal câu trả lời hiện có nhưng áp kit); nút "Kết nạp" chỉ hiện ở thanh hành động khi đã chọn ≥1 đơn. Phỏng vấn: cùng nguyên tắc 1–5.
- **A1 — Hoạt động:** `tasks/TasksManager.tsx`, `tasks/ContributionBoard.tsx`, `EventsManager.tsx`. Giao việc: danh sách việc full width; "+ Giao việc" mở CreatePanel; khối "Gmail gửi nhắc việc" thu thành 1 dòng trạng thái nhỏ dưới PageHeader (nút secondary). Sự kiện: "+ Thêm sự kiện" mở CreatePanel.
- **A2 — Truyền thông:** `scan/ScanImport.tsx`, `frames/FramesManager.tsx`, `src/components/MailMergeApp.tsx` (+ chỉ phần trình bày trong `src/components/campaign/*`, `src/components/data/*`, `src/components/email/*` nếu chúng chỉ dùng cho trang Gửi mail — kiểm tra bằng grep trước khi sửa). Áp nguyên tắc 1–9.

### Kiểm chứng (mỗi agent)
`npx tsc --noEmit`; `npx eslint <file của mình>` (không thêm lỗi mới); dev server ĐANG CHẠY ở http://localhost:3000 với Supabase LOCAL — đăng nhập `chunhiem@local.test` / `localtest123`, chọn CLB "CLB Thử Local"; chụp 1440px + 375px từng màn của mình, đi thử luồng chính (mở/đóng CreatePanel, sửa, lọc); KHÔNG bấm Xóa thật hay Gửi mail thật; `impeccable detect --json <file>` một lần cuối. Không khởi động/tắt dev server, không commit.
