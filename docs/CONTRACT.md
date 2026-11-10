# Hợp đồng Đợt 4: phân quyền theo chức năng + Chủ nhiệm

Hợp đồng cũ vẫn có hiệu lực trừ chỗ bị thay ở đây: `docs/CONTRACT-1.md` (vai trò, nhiệm kỳ), `docs/CONTRACT-2.md` (giao việc), `docs/CONTRACT-3.md` (Facebook, khung avatar, import).

## 0. Quyết định của người dùng (2026-11-10)
Cơ cấu CLB: Ban chủ nhiệm = 1 Chủ nhiệm + 3 Phó chủ nhiệm (mỗi phó phụ trách 1 ban). Ban chủ chốt = trưởng ban + phó ban của từng ban (Chuyên môn, Truyền thông, Nhân sự); số người đổi theo năm.
- **Ban chủ nhiệm (`owner`)**: toàn quyền vận hành, giao việc cho mọi ban.
- **Chủ nhiệm** (một người trong Ban chủ nhiệm, cờ `is_head`): DUY NHẤT được kích hoạt nhiệm kỳ, sửa danh sách nhiệm kỳ, cấp/gỡ vai trò Ban chủ nhiệm/Ban chủ chốt và cấp/gỡ quyền chức năng.
- **Ban chủ chốt (`admin`)**: chỉ có các **quyền chức năng** được tick riêng cho từng người; giao việc / xem đóng góp **chỉ trong ban của mình** (`club_members.team_id`).
- **Thành viên (`member`)**: như cũ.

Quyền chức năng (`club_permission`, lưu dạng `text[]`):
| Mã | Tên hiển thị | Phạm vi |
|---|---|---|
| `events` | Quản lý sự kiện | bảng `events`, ảnh sự kiện |
| `recruitment` | Tuyển thành viên | đợt tuyển, vị trí, biểu mẫu, mẫu biểu mẫu, đơn ứng tuyển, câu trả lời, ca/xếp ca phỏng vấn, kết nạp, import Excel |
| `members` | Quản lý thành viên | thành viên, tài khoản, ban (`teams`) — trừ đổi vai trò/quyền (chỉ Chủ nhiệm) |
| `mail` | Gửi mail | `/api/send-email`, chọn Gmail gửi nhắc việc |
| `facebook` | Đối chiếu Facebook & khung avatar | khung avatar, alias Facebook, `apply_task_scan`, tạo việc loại `engagement`/`avatar` cho toàn CLB |

`owner` coi như có MỌI quyền. `member` không có quyền nào.

## 1. Database (migration mới `supabase/migrations/20261115000000_permissions.sql`)

### 1.1. Cột
- `club_members`: `permissions text[] not null default '{}'` (check: mọi phần tử thuộc 5 mã trên), `is_head boolean not null default false`; unique một phần `(club_id) where is_head`.
- `club_term_roles`: `permissions text[] not null default '{}'` (cùng check), `is_head boolean not null default false`. Grant insert/update cho authenticated thêm 2 cột này (RLS vẫn chỉ cho Chủ nhiệm ghi — xem 1.3).
- `tasks`: `team_id uuid null references teams(id) on delete set null` — ban sở hữu việc; null = việc toàn CLB do Ban chủ nhiệm (hoặc người có quyền `facebook` cho việc engagement/avatar) tạo. Không grant update cột này.

### 1.2. Hàm phụ (security definer, search_path public, revoke public/anon, grant authenticated/service_role)
- `is_club_head(p_club_id uuid) returns boolean` — người gọi là thành viên active, role `owner`, `is_head`.
- `has_club_permission(p_club_id uuid, p_permission text) returns boolean` — người gọi active và (`role = 'owner'` hoặc (`role = 'admin'` và `p_permission = any(permissions)`)).
- `my_club_team(p_club_id uuid) returns uuid` — `team_id` của người gọi trong CLB (null nếu không có).
- `is_club_admin` GIỮ NGUYÊN nghĩa (owner hoặc admin) — dùng cho các chỗ đọc chung của quản trị (đọc danh sách thành viên, ban, đợt tuyển…).

### 1.3. Thay quyền ở RLS / RPC (rà mọi chỗ dùng `is_club_admin` trong các migration cũ; tạo lại policy/hàm bằng `create or replace` / drop + create)
- Ghi `events` + policy storage ảnh sự kiện → `has_club_permission(club, 'events')`.
- Ghi đợt tuyển, vị trí, biểu mẫu, câu hỏi, ca, xếp ca, thành viên hỗ trợ ca, cập nhật `applications.status`; ĐỌC `applications`, `application_answers`, `interview_assignments`; các RPC `admit_applications`, `import_applications`, `create_application_form_from_template`, `save_application_form_questions`, `can_delete_empty_interview_session` → `has_club_permission(club, 'recruitment')`. `form_templates`/`form_template_questions` (dùng chung toàn hệ thống): người có `recruitment` ở ít nhất một CLB, hoặc owner.
- Ghi `teams` → `has_club_permission(club, 'members')`.
- `member_facebook_aliases` (đọc/ghi), `apply_task_scan` → `has_club_permission(club, 'facebook')`.
- Nhiệm kỳ: ghi `club_terms` / `club_term_roles` và `activate_term` → `is_club_head`. Đọc nhiệm kỳ: owner/admin như cũ.
- `activate_term`: danh sách phải có ĐÚNG MỘT người `is_head = true`, người đó role `owner`, active, có `user_id`; người `admin` trong danh sách nhận `permissions` của dòng; người `owner` nhận `permissions = '{}'` (owner đã có mọi quyền); mọi người ngoài danh sách: role `member`, title null, `permissions = '{}'`, `is_head = false`. Lỗi tiếng Việt.
- Trigger giữ owner (`enforce_club_has_owner`): đổi thành "CLB phải còn đúng một Chủ nhiệm (`is_head`) active có `user_id`" (giữ nguyên tinh thần deferred, bỏ qua khi xóa CLB; thông báo tiếng Việt).
- Giao việc:
  - `create_task`: owner như cũ (đặt `tasks.team_id = coalesce(p_team_id, null)` — việc giao theo ban gắn ban đó, giao lẻ/toàn CLB → null). Admin: mọi người nhận phải thuộc `my_club_team`; `p_team_id` (nếu có) phải bằng ban của mình; `p_all_members` chỉ được khi `p_kind in ('engagement','avatar')` VÀ có quyền `facebook` (khi đó `team_id` null); ngược lại `tasks.team_id = my_club_team`. Admin không có ban → không giao việc được (lỗi rõ).
  - RLS `tasks` / `task_assignees` (đọc, sửa trạng thái/ghi chú, đóng, xóa): owner mọi việc của CLB; admin chỉ việc có `team_id = my_club_team(club)`, CỘNG việc `team_id is null` loại engagement/avatar nếu có quyền `facebook`; member như cũ (việc của mình).
  - `club_contribution`: owner như cũ; admin chỉ trả các thành viên thuộc ban của mình.
- Dữ liệu sẵn có: với mỗi CLB, đặt `is_head = true` cho owner active có `user_id` tạo sớm nhất; mọi `admin` hiện có nhận đủ 5 quyền (giữ hành vi cũ). Cập nhật `club_term_roles` cũ: admin nhận đủ 5 quyền, người `is_head` của term active = người vừa đặt.
- Đặt revoke/grant tường minh cho mọi hàm mới (anon không execute).

## 2. API (`src/app/api`, `src/lib`)
- `src/lib/admin/api.ts`: `getClubAdminContext(clubId, options?)` trả thêm `permissions: string[]`, `isHead: boolean`, `teamId: string | null`; `options.permission?: ClubPermission` → thiếu quyền trả 403 "Bạn không có quyền <tên hiển thị> trong CLB này."; `options.head?: true` → chỉ Chủ nhiệm. Giữ tham số cũ `allowClubStaffRead` nếu còn chỗ dùng (hoặc gỡ nếu không còn).
- Export `CLUB_PERMISSIONS` (mã + tên hiển thị) ở `src/lib/admin/permissions.ts` (thuần TS, không import) để FE dùng chung.
- Gắn quyền: `events/*` → `events`; `frames` → `facebook`; `mail-sender` (GET/POST) và `/api/send-email` → `mail`; `club-members` GET → mọi owner/admin, POST/PATCH/DELETE → `members`; **đổi `role`, `permissions`, `is_head` → chỉ Chủ nhiệm** (kể cả khi tạo mới với role ≠ member); `accounts` (+ `bulk`) → `members`; gán/sửa tài khoản của owner/admin → chỉ Chủ nhiệm (thay quy tắc cũ "owner"); `tasks/remind` → owner, hoặc admin khi việc thuộc ban mình / việc engagement-avatar và có `facebook`.
- `club-members` nhận và trả thêm `permissions`, `is_head` (chỉ đọc qua GET; chỉ Chủ nhiệm ghi `permissions`; `is_head` chỉ đổi qua nhiệm kỳ — API không cho ghi).

## 3. Giao diện
- `AdminShell`: ẩn mục điều hướng người dùng không có quyền (Sự kiện ← `events`; Tuyển gen / Biểu mẫu ← `recruitment`; Thành viên / Tài khoản / Ban ← `members`; Gửi mail ← `mail`; Đối chiếu Facebook / Khung avatar ← `facebook`; Giao việc / Đóng góp / Nhiệm kỳ: owner + admin). Vào thẳng URL không có quyền → hiện thông báo "Bạn chưa được cấp quyền …" thay vì lỗi. Hiển thị chức danh + "Chủ nhiệm" ở thanh bên.
- `TermsManager`: mỗi dòng danh sách thêm ô chọn "Chủ nhiệm" (radio, đúng 1 người, chỉ với role Ban chủ nhiệm) và các checkbox quyền (chỉ với Ban chủ chốt); chỉ Chủ nhiệm sửa/kích hoạt; nút kích hoạt khóa khi chưa có đúng 1 Chủ nhiệm có tài khoản. "Lấy từ danh sách hiện tại" chép cả quyền + Chủ nhiệm.
- `ClubMembersManager`: hiện quyền của từng Ban chủ chốt (nhãn); Chủ nhiệm sửa được quyền (checkbox) và vai trò; người khác chỉ xem.
- `TasksManager` / `ContributionBoard`: Ban chủ chốt chỉ thấy thành viên trong ban mình khi chọn người nhận / xem đóng góp; ẩn "Giao cho cả ban" khác ban mình; "Giao cho tất cả thành viên" chỉ hiện với owner hoặc (có `facebook` và loại engagement/avatar).
- Đọc quyền của chính mình: `club_members` (dòng của mình: `role, permissions, is_head, team_id, title`).

## 4. Test
- pgTAP `supabase/tests/permissions.test.sql`: mỗi quyền mở đúng phần của nó và không mở phần khác (admin chỉ có `events` không đọc được đơn ứng tuyển, không ghi được vị trí; admin có `recruitment` không sửa được sự kiện…); owner làm được hết; chỉ Chủ nhiệm kích hoạt nhiệm kỳ / ghi danh sách nhiệm kỳ (Phó chủ nhiệm bị chặn); `activate_term` đòi đúng 1 Chủ nhiệm có tài khoản, chép quyền, xóa quyền người ngoài danh sách; trigger "đúng một Chủ nhiệm"; giao việc của admin chỉ trong ban mình (người nhận ban khác → lỗi; `p_all_members` chỉ engagement/avatar + `facebook`); admin chỉ đọc/sửa việc của ban mình; `club_contribution` của admin chỉ ban mình; migration dữ liệu: admin cũ có đủ 5 quyền, owner cũ sớm nhất thành Chủ nhiệm.
- Cập nhật các test cũ (`roles_terms`, `tasks`, `engagement`, `import`, `function_grants`) cho khớp: fixture admin cần quyền tương ứng (hoặc dựa vào migration dữ liệu), owner tạo ra trong test cần `is_head` nếu test kích hoạt nhiệm kỳ.
- Unit: `tests/unit/permissions.test.ts` cho `CLUB_PERMISSIONS` (đủ 5 mã, không trùng).
