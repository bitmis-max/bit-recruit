# Hợp đồng: Đợt 0 (bảo mật) + Đợt 1 (vai trò, nhiệm kỳ, kết nạp)

Mọi agent làm theo đúng tên ở đây. Muốn đổi tên hay chữ ký hàm thì báo lead, không tự đổi.

## 1. Vai trò

| Giá trị enum `club_role` | Hiển thị | Quyền |
|---|---|---|
| `owner` | Ban chủ nhiệm | Toàn quyền, quản lý nhiệm kỳ, sửa owner khác |
| `admin` | Ban chủ chốt | Quản trị CLB (tuyển, thành viên, mail...), xem nhiệm kỳ |
| `member` (đổi tên từ `organizer`) | Thành viên | Chỉ vào `/me`, xem và sửa hồ sơ của mình |

Ứng viên **không phải vai trò**: vẫn là dòng `applications`, không có tài khoản. Khi đơn ở trạng thái `passed` (đã qua vòng cuối), Ban chủ chốt bấm "Kết nạp" để tạo dòng `club_members` vai trò `member`.

`club_members.title` là **chức danh** (vd. "Chủ nhiệm", "Phó chủ nhiệm", "Trưởng ban Truyền thông"), chỉ để hiển thị, không ảnh hưởng quyền.

## 2. Database (migration mới `supabase/migrations/20261110000000_member_roles_terms.sql`)

### 2.1. Thay đổi bảng
- `alter type club_role rename value 'organizer' to 'member'`.
- `club_members` thêm: `email text`, `phone text`, `facebook_url text`, `title text`. Unique một phần `(club_id, lower(email)) where email is not null`.
- `applications` thêm: `facebook_url text`, `admitted_member_id uuid references club_members(id) on delete set null`.
- `field_key` của `form_questions` và `form_template_questions` cho phép thêm `'facebook_url'`. `submit_application` lưu `facebook_url` vào `applications.facebook_url`.

### 2.2. Bảng mới
```
club_terms (
  id uuid pk, club_id uuid fk clubs cascade, name text not null,
  start_date date, end_date date,
  status text not null default 'draft' check in ('draft','active','ended'),
  activated_at timestamptz, activated_by uuid, created_at timestamptz default now()
)  -- tối đa 1 term 'active' mỗi CLB (unique index một phần)

club_term_roles (
  term_id uuid fk club_terms cascade, member_id uuid fk club_members cascade,
  role club_role not null check (role in ('owner','admin')),
  title text, team_id uuid null fk teams set null,
  primary key (term_id, member_id)
)  -- member và team phải cùng CLB với term (trigger)
```
RLS: owner/admin của CLB đọc; chỉ owner insert/update/delete, và chỉ khi term còn `draft`.

### 2.3. Hàm
- `is_club_owner(p_club_id uuid) returns boolean`: tương tự `is_club_admin`, chỉ role `owner`.
- `activate_term(p_term_id uuid) returns void`: chỉ owner của CLB; term phải `draft`; danh sách phải có ít nhất 1 `owner` là thành viên đang hoạt động **có `user_id`**. Trong một transaction:
  1. Term `active` cũ chuyển `ended` (nếu `end_date` null thì đặt bằng hôm nay).
  2. Mọi thành viên đang hoạt động của CLB **không có** trong danh sách: `role = 'member'`, `title = null`.
  3. Thành viên trong danh sách: cập nhật `role`, `title`, `team_id` (nếu khác null), `is_active = true`.
  4. Term chuyển `active`, ghi `activated_at`, `activated_by`.
- `admit_applications(p_application_ids uuid[]) returns jsonb` → `{ "admitted": n, "skipped": m }`. Người gọi phải là admin của CLB chứa đơn. Chỉ nhận đơn `status = 'passed'` và `admitted_member_id is null`. Tạo `club_members` (role `member`, `team_id` lấy từ `recruitment_positions.team_id`, copy `full_name`, `student_code`, `class_name`, `email`, `phone`, `facebook_url`). Nếu trùng `(club_id, student_code)` hoặc trùng email trong CLB thì gắn vào thành viên sẵn có. Ghi `admitted_member_id`. Chạy lại cũng không tạo trùng.
- `update_my_member_profile(p_club_id uuid, p_phone text, p_facebook_url text) returns void`: chỉ sửa dòng `club_members` của chính `auth.uid()` trong CLB đó. `facebook_url` rỗng thì đặt null; nếu có thì phải khớp `^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+`. Lỗi trả bằng tiếng Việt.
- Trigger bảo vệ (constraint trigger, deferred): sau update/delete trên `club_members`, CLB (nếu còn tồn tại) phải còn ít nhất 1 owner `is_active` có `user_id`. Nếu không thì báo lỗi "CLB phải còn ít nhất một thành viên Ban chủ nhiệm có tài khoản."

### 2.4. RLS siết lại
- `applications`, `application_answers`, `interview_assignments`: chỉ `is_club_admin` được SELECT (bỏ quyền đọc của mọi thành viên). Quyền ghi giữ nguyên (admin).
- Admin được update `applications.status` (đã có policy `admin update applications`, giữ nguyên).
- `club_members`: giữ nguyên (đọc dòng của mình + admin đọc tất cả).

## 3. API (`src/app/api`, `src/lib`)

Định dạng trả về giữ như route hiện có. Lỗi bằng tiếng Việt.

- `src/lib/security/safe-fetch.ts`:
  - `export function isPrivateIp(ip: string): boolean`: chặn IPv4 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16, 198.18/15, 224/4 trở lên; IPv6 `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, IPv4-mapped `::ffff:x.x.x.x` (xét theo phần IPv4).
  - `export async function assertPublicHttpsUrl(url: string): Promise<URL>`: phải là `https:`, không có user/password, cổng rỗng hoặc 443, mọi IP mà DNS trả về đều không private. Sai thì throw `Error` có message tiếng Việt.
  - `export async function fetchPublicFile(url: string, opts: { maxBytes: number; maxRedirects?: number }): Promise<{ buffer: Buffer; contentType: string | null; finalUrl: string }>`: dùng `redirect: "manual"`, kiểm tra lại từng bước chuyển hướng (tối đa 3), đọc stream và dừng khi vượt `maxBytes`.
  - File chỉ import module chuẩn của Node, không import file nội bộ khác, để test chạy bằng `node --test` không cần build.
- `POST /api/send-email`: dùng `fetchPublicFile` cho `attachmentUrl`/`driveId`.
- `PATCH /api/admin/accounts`: từ chối đổi email nếu tài khoản đó có membership ở CLB khác (403).
- `POST /api/admin/accounts` thêm `mode: "create"`: `auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name } })`, **không gửi mail**. Thành viên đăng nhập bằng Google cùng email. Nếu email đã có tài khoản thì gắn tài khoản đó (giống `link`).
- `POST /api/admin/accounts/bulk` body `{ clubId, memberIds: string[] }`: với từng thành viên đang hoạt động, có `email`, chưa có `user_id` thì làm như `mode: "create"`. Trả `{ ok: true, data: { results: [{ memberId, status: "created" | "linked" | "skipped" | "error", message? }] } }`. Chỉ owner/admin. Không xử lý thành viên `owner` nếu người gọi không phải owner.
- `/api/admin/club-members`: role hợp lệ là `owner|admin|member`, mặc định `member`. Nhận và trả thêm `email`, `phone`, `facebook_url`, `title`. Kiểm tra định dạng email và link Facebook (regex như mục 2.3).
- `src/proxy.ts`: matcher thêm `/me` và `/me/:path*`.

## 4. Giao diện

- `/register`: trang chỉ `redirect("/login")`.
- `/manage-clubs` (layout): chỉ tính membership `owner`/`admin`. Người chỉ có membership `member` thì chuyển sang `/me`.
- `/me` (trang mới): hồ sơ thành viên (tên, CLB, ban, chức danh, vai trò), sửa SĐT và link Facebook qua `update_my_member_profile`.
- `/manage-clubs/terms` (màn hình mới): danh sách nhiệm kỳ, tạo nhiệm kỳ nháp, chọn Ban chủ nhiệm/Ban chủ chốt + chức danh + ban, nút "Kích hoạt nhiệm kỳ" (có hộp xác nhận, gọi `activate_term`). Admin chỉ xem.
- Thành viên: nhãn vai trò tiếng Việt, thêm email/SĐT/Facebook/chức danh, nút "Tạo tài khoản cho thành viên có email" (gọi bulk API).
- Đơn ứng tuyển: đổi trạng thái từng đơn; chọn nhiều đơn `passed` rồi bấm "Kết nạp" (gọi `admit_applications`); nhãn "Đã kết nạp" khi có `admitted_member_id`; hiện link Facebook.
- Phỏng vấn: ghi `result` (`pending|pass|fail|consider`) và `score` cho từng ứng viên trong ca; hiện số vòng.
- Form builder: thêm lựa chọn field_key `facebook_url` (nhãn "Link Facebook").
- Navbar công khai: owner/admin thấy "Quản trị", member thấy "Trang thành viên".

## 5. Test

- `npm test` = `node --test "tests/unit/**/*.test.ts"` (Node 24 chạy TypeScript trực tiếp, không thêm dependency; truyền thư mục không chạy trên Windows).
- Test DB dạng pgTAP trong `supabase/tests/`, chạy bằng Supabase local (`npx supabase start`, `npx supabase test db`). Không chạy lên database thật.
