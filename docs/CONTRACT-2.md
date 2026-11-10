# Hợp đồng Đợt 2: giao việc, nhắc hạn, đóng góp

Mọi agent làm theo đúng tên ở đây. Muốn đổi tên hay chữ ký thì báo lead, không tự đổi. Hợp đồng Đợt 1 (vai trò, nhiệm kỳ, kết nạp) nằm ở `docs/CONTRACT-1.md` và vẫn có hiệu lực.

Vai trò: `owner` = Ban chủ nhiệm, `admin` = Ban chủ chốt, `member` = Thành viên. "Admin của CLB" = `is_club_admin(club_id)` (owner hoặc admin).

## 1. Database (migration mới `supabase/migrations/20261111000000_tasks.sql`)

### 1.1. Bảng
```
clubs: thêm cột mail_sender_user_id uuid null references auth.users(id) on delete set null
       (KHÔNG grant update cho authenticated; chỉ service-role ghi)

tasks (
  id uuid pk default gen_random_uuid(),
  club_id uuid not null fk clubs cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  description text,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid null fk club_members(id) set null,
  created_at timestamptz default now(), updated_at timestamptz default now()  -- trigger set_updated_at
)

task_assignees (
  task_id uuid fk tasks cascade, member_id uuid fk club_members cascade,
  status text not null default 'pending' check (status in ('pending','done','missed')),
  completed_at timestamptz,          -- trigger: đặt now() khi status chuyển sang 'done', null khi rời 'done'
  note text,                         -- ghi chú của Ban chủ chốt
  reminded_before_at timestamptz,    -- đã gửi nhắc trước hạn
  reminded_overdue_at timestamptz,   -- đã gửi nhắc quá hạn
  primary key (task_id, member_id)
)  -- trigger: member phải cùng CLB với task
```
Index: `tasks (club_id, due_at)`, `task_assignees (member_id)`.

### 1.2. RLS và grant
- `tasks`: SELECT cho admin của CLB, hoặc thành viên có dòng `task_assignees` của chính mình (theo `club_members.user_id = auth.uid()`). INSERT/UPDATE/DELETE: admin của CLB. Grant update theo cột: `title, description, due_at, status`.
- `task_assignees`: SELECT cho admin của CLB chứa task, hoặc dòng của chính mình. INSERT/DELETE: admin. UPDATE: admin, grant theo cột `status, note` (các cột `reminded_*`, `completed_at` chỉ trigger/service-role ghi).
- Tránh đệ quy RLS giữa hai bảng: dùng hàm `security definer` phụ nếu cần (vd `is_task_assignee(p_task_id uuid)`, `task_club_id(p_task_id uuid)`).

### 1.3. Hàm (security definer, `set search_path = public`, revoke from public, anon; grant execute cho authenticated, service_role; lỗi tiếng Việt)
- `create_task(p_club_id uuid, p_title text, p_description text, p_due_at timestamptz, p_member_ids uuid[], p_team_id uuid) returns uuid`: chỉ admin của CLB. `p_due_at` phải sau thời điểm hiện tại (lỗi "Hạn chót phải ở tương lai."). Người nhận = các `p_member_ids` + mọi thành viên đang hoạt động của `p_team_id` (nếu khác null), đều phải thuộc CLB và đang hoạt động; phải có ít nhất 1 người nhận. `created_by` = dòng `club_members` của người gọi. Trả id task.
- `set_my_task_done(p_task_id uuid, p_done boolean) returns void`: người gọi phải là người nhận và đang hoạt động (`is_active`); task phải `open`. `true` → `done`; `false` → `pending`. Không đổi được dòng đang `missed` (báo lỗi "Việc này đã bị đánh dấu chưa hoàn thành, hãy liên hệ Ban chủ chốt.").
- `club_contribution(p_club_id uuid, p_from timestamptz, p_to timestamptz) returns table (member_id uuid, full_name text, team_id uuid, role club_role, is_active boolean, assigned int, done_on_time int, done_late int, missed int, pending int)`: chỉ admin. Tính trên task có `due_at` trong `[p_from, p_to)`. Trả MỌI thành viên của CLB (kể cả 0 việc). `done_on_time` = done và `completed_at <= due_at`; `done_late` = done và trễ; `missed` = status `missed` HOẶC (`pending` và `due_at < now()` và task `open`); `pending` = pending, task `open` và chưa tới hạn. Dòng `pending` của task `closed` (việc bị hủy/ngừng theo dõi) KHÔNG được đếm ở bất kỳ cột nào. `assigned` = tổng bốn số.

## 2. API (`src/app/api`, `src/lib`)

Trả `{ ok: true, data }` hoặc `{ error }`, lỗi tiếng Việt. Service-role chỉ dùng phía server.

- `src/lib/email/gmail.ts` (tách từ `send-email/route.ts`, route đó dùng lại):
  - `getGmailAccessToken(admin: SupabaseClient, userId: string): Promise<string>` (đọc `google_mail_tokens`, giải mã, đổi refresh token; lỗi thì throw Error tiếng Việt).
  - `sendGmail(accessToken: string, mail: { from?: string; to: string; subject: string; html: string; attachments?: [...] }): Promise<{ id: string }>`.
- `src/lib/tasks/reminders.ts` (thuần TS, KHÔNG import gì, để chạy `node --test`):
  - `type ReminderRow = { taskId: string; memberId: string; title: string; dueAt: string; email: string | null; fullName: string; remindedBeforeAt: string | null; remindedOverdueAt: string | null }`
  - `pickReminders(rows: ReminderRow[], now: Date): { before: ReminderRow[]; overdue: ReminderRow[] }`: bỏ dòng không có email. `before` = `now < dueAt <= now + 36 giờ` và `remindedBeforeAt` null. `overdue` = `dueAt <= now` và `dueAt > now - 7 ngày` và `remindedOverdueAt` null.
  - `buildReminderEmail(fullName: string, clubName: string, before: ReminderRow[], overdue: ReminderRow[], baseUrl: string): { subject: string; html: string }`: một mail gộp cho một người; escape HTML mọi chuỗi; có link `${baseUrl}/me`; giờ hiển thị theo `Asia/Ho_Chi_Minh`.
- `GET /api/cron/task-reminders`: yêu cầu header `Authorization: Bearer ${CRON_SECRET}` (thiếu biến môi trường → 503; sai → 401; so sánh an toàn thời gian). Dùng service-role: với mỗi CLB có `mail_sender_user_id`, lấy các dòng `pending` của task `open`, gọi `pickReminders`, gửi mỗi người một mail gộp qua Gmail của người gửi, rồi ghi `reminded_before_at` / `reminded_overdue_at`. Một người lỗi không làm hỏng cả lượt. Trả `{ ok: true, data: { clubs, sent, failed, skippedNoSender } }`. Luôn chạy một truy vấn DB (giữ Supabase Free không bị tạm dừng).
  - Người gửi hợp lệ = `mail_sender_user_id` là thành viên `is_active` của CLB với role `owner`/`admin`; không hợp lệ thì coi như chưa có người gửi (đếm `skippedNoSender`; `GET /api/admin/mail-sender` trả `configured: false`).
  - Chống gửi trùng: trước khi gửi cho một người, "giữ chỗ" bằng update có điều kiện (`reminded_before_at`/`reminded_overdue_at` đang null → đặt now(), trả về dòng đã giữ); chỉ gửi các dòng giữ được; gửi lỗi thì trả mốc về null.
  - Nạp người nhận theo lô (≤ 100 task id mỗi truy vấn, có `.range()` phân trang) để không bị cắt ở giới hạn 1000 dòng.
- `GET /api/admin/mail-sender?clubId=`: owner/admin. Trả `{ ok: true, data: { configured: boolean, isMe: boolean, senderName: string | null } }`.
- `POST /api/admin/mail-sender` body `{ clubId }`: owner/admin; người gọi phải đã kết nối Gmail (có dòng `google_mail_tokens`), nếu chưa → 400 "Bạn chưa kết nối Gmail. Vào mục Gửi mail để kết nối trước.". Đặt `clubs.mail_sender_user_id` = người gọi.
- `POST /api/admin/tasks/remind` body `{ clubId, taskId }`: owner/admin; gửi ngay mail nhắc cho mọi người `pending` có email của task đó (bỏ qua mốc `reminded_*`, sau đó vẫn ghi mốc phù hợp). Trả `{ ok: true, data: { sent, failed, noEmail } }`. CLB chưa có người gửi → 400.
- `vercel.json`: `{ "crons": [{ "path": "/api/cron/task-reminders", "schedule": "0 1 * * *" }] }` (08:00 giờ Việt Nam; gói Hobby chỉ cho cron mỗi ngày một lần).
- Biến môi trường mới: `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` (tùy chọn; thiếu thì dùng origin của request). Ghi vào README mục cấu hình.

## 3. Giao diện

- `/manage-clubs/tasks` (màn hình mới, `src/components/admin/tasks/TasksManager.tsx`): tạo việc (tiêu đề, mô tả, hạn `datetime-local`, chọn nhiều thành viên và/hoặc cả ban) qua `rpc("create_task")`; danh sách việc (lọc Đang mở / Đã đóng, sắp theo hạn, nhãn "Quá hạn"); mở một việc thấy bảng người nhận với trạng thái Chờ / Xong / Chưa hoàn thành, Ban chủ chốt đổi trạng thái và ghi chú (update `task_assignees.status, note`); nút "Gửi nhắc ngay" (`POST /api/admin/tasks/remind`); đóng/mở lại việc; xóa việc (có xác nhận). Khung "Gmail gửi nhắc việc": hiện trạng thái từ `GET /api/admin/mail-sender`, nút "Dùng Gmail của tôi để gửi nhắc".
- `/manage-clubs/contribution` (màn hình mới, `src/components/admin/tasks/ContributionBoard.tsx`): chọn khoảng thời gian (mặc định 90 ngày gần nhất), gọi `rpc("club_contribution")`; bảng: thành viên, ban, được giao, đúng hạn, trễ, bỏ lỡ, đang chờ, tỉ lệ hoàn thành = (đúng hạn + trễ) / (được giao − đang chờ); sắp xếp theo tỉ lệ; nhãn "Cần nhắc nhở" khi đã có ≥ 3 việc tới hạn và tỉ lệ < 50%; lọc "chỉ người cần nhắc nhở"; link sang Quản lý thành viên để Ban chủ chốt xử lý (đặt ngừng hoạt động). Không tự động phạt ai.
- `/me`: thêm mục "Việc của tôi" (`src/components/member/MyTasks.tsx`): việc đang chờ (sắp theo hạn, nhãn "Còn N ngày" / "Quá hạn"), nút "Đánh dấu đã xong" / "Bỏ đánh dấu" qua `rpc("set_my_task_done")`; việc đã xong và việc bị đánh dấu chưa hoàn thành hiển thị riêng.
- `AdminShell`: thêm mục "Giao việc" và "Đóng góp".

## 4. Test

- Unit: `tests/unit/reminders.test.ts` cho `pickReminders` (biên 36 giờ, 7 ngày, đã nhắc rồi, không email) và `buildReminderEmail` (escape HTML, có link `/me`).
- pgTAP: `supabase/tests/tasks.test.sql`: quyền `create_task` (member bị chặn, admin CLB khác bị chặn, người nhận ngoài CLB bị lỗi, giao theo ban); member chỉ thấy việc của mình và không thấy người nhận khác; member không update trực tiếp được `task_assignees`; `set_my_task_done` (đúng người, task đóng, dòng missed); admin không ghi được `reminded_*`; `completed_at` do trigger; `club_contribution` đúng số với dữ liệu mẫu và chặn member; authenticated không update được `clubs.mail_sender_user_id`.
- Lệnh: `npm test`, `npx supabase db reset` → `npx supabase test db` (chỉ Supabase local).
