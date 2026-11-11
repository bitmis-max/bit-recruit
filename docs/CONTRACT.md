# Hợp đồng Đợt 6: một thành viên thuộc nhiều ban

Hợp đồng cũ vẫn có hiệu lực: `docs/CONTRACT-1.md` … `docs/CONTRACT-5.md`.

Mục đích: một người có thể đậu (và hoạt động ở) nhiều ban cùng lúc, ví dụ vừa Ban Tổ chức vừa Ban Truyền thông. Hiện `club_members.team_id` chỉ chứa một ban.

## Quyết định đã chốt
- Thêm bảng `club_member_teams` = tập ban của một thành viên. **`club_members.team_id` giữ nguyên, nghĩa là "ban chính"** và luôn nằm trong tập (hoặc null khi tập rỗng).
- **Phân quyền Ban chủ chốt không đổi:** ban mà admin quản lý vẫn là ban chính (`my_club_team` không đổi). Chỉ thay các chỗ hỏi "thành viên M có thuộc ban X không" sang đọc tập ban.
- **Import (`import_members`) = THÊM ban:** thành viên đã có (cùng MSSV/email) + cột Ban khác → giữ ban cũ, thêm ban mới vào tập; ban chính chỉ đặt khi đang null. Dòng owner/admin vẫn giữ quy tắc cũ (không đổi ban, đếm `staff_team_skipped`).
- Gỡ ban: làm tay trên web (chọn nhiều ban trong form sửa thành viên).

## DB (db-agent) — migration `supabase/migrations/20261118000000_member_teams.sql`
1. Bảng:
   ```sql
   create table public.club_member_teams (
     member_id uuid not null references public.club_members(id) on delete cascade,
     team_id   uuid not null references public.teams(id) on delete cascade,
     created_at timestamptz not null default now(),
     primary key (member_id, team_id)
   );
   create index club_member_teams_team_idx on public.club_member_teams (team_id);
   ```
   - Trigger chặn ghép thành viên với ban của CLB khác (giống `enforce_task_assignee_club`).
   - Backfill: `insert ... select id, team_id from club_members where team_id is not null`.
2. Đồng bộ ban chính → tập: trigger `after insert or update of team_id on club_members`: nếu `new.team_id` không null thì thêm `(new.id, new.team_id)` vào tập (`on conflict do nothing`). Trigger KHÔNG xóa ban cũ (nhờ vậy `admit_applications`, `activate_term`, API cũ vẫn đúng mà không phải sửa).
3. Khi xóa một dòng tập đúng bằng ban chính: trigger `after delete on club_member_teams` đặt `club_members.team_id` = một ban còn lại trong tập (cũ nhất theo `created_at`) hoặc null. Khi `teams` bị xóa, FK `on delete set null` sẵn có ở `club_members.team_id` + `cascade` ở tập vẫn đúng.
4. RPC `set_member_teams(p_member_id uuid, p_team_ids uuid[]) returns void`, `security definer`, **chỉ grant `service_role`** (API gọi bằng service-role sau khi đã kiểm tra quyền). Nguyên tử:
   - Bỏ trùng, giữ thứ tự; mọi ban phải thuộc CLB của thành viên, sai thì `raise exception` tiếng Việt.
   - Ban chính = phần tử đầu (null nếu mảng rỗng); thay toàn bộ tập bằng mảng.
5. RLS bảng `club_member_teams`: bật RLS. `select` cho authenticated khi `is_club_admin(club của member)` hoặc member đó là chính mình (`m.user_id = auth.uid()`). Không có policy ghi (chỉ service-role và hàm security definer). Grant: `select` cho authenticated; không grant gì cho anon.
6. Sửa các hàm đọc "thuộc ban" (chép thân hàm mới nhất ở `20261115000000_permissions.sql`, chỉ đổi phần ban):
   - `can_assign_task_member`: `m.team_id = my_club_team(...)` → `exists (select 1 from club_member_teams mt where mt.member_id = m.id and mt.team_id = my_club_team(t.club_id))`.
   - `create_task`: kiểm tra người được chọn thuộc ban của admin, và lấy "cả ban" (`p_team_id`) → đọc tập.
   - `club_contribution`: lọc của admin theo tập; **thêm cột trả về `team_ids uuid[]`** (tất cả ban, ban chính đứng đầu), giữ cột `team_id` (ban chính). Đổi kiểu trả về thì `drop function` rồi tạo lại, giữ nguyên grant.
   - `import_members`: hành vi THÊM ban như mục "Quyết định". Kết quả trả về giữ các khóa cũ.
7. Test pgTAP `supabase/tests/member_teams.test.sql`: backfill, trigger đồng bộ, `set_member_teams` (đổi ban chính, rỗng, ban CLB khác bị chặn, authenticated không gọi được), RLS đọc, admin ban B giao việc được cho người thuộc cả A và B, `club_contribution.team_ids`, import thêm ban. Các test cũ phải vẫn xanh (sửa test cũ nếu hành vi đổi có chủ đích, ghi rõ trong báo cáo).
8. Cập nhật `docs/database.md`.

## API (api-agent) — `src/app/api/admin/club-members/route.ts`
- `GET`: mỗi member có thêm `team_ids: string[]` (ban chính đứng đầu, rồi theo `created_at`). Giữ `team_id`.
- `POST` / `PATCH`: nhận `team_ids?: string[]` (mảng UUID; rỗng = không ban). Nếu có `team_ids` thì bỏ qua `team_id`. Mỗi ban phải thuộc CLB (lỗi tiếng Việt 400). Ghi bằng `context.admin.rpc("set_member_teams", ...)` sau khi insert/update các trường khác.
  - Quy tắc quyền giữ như đổi `team_id` hiện nay: đổi tập ban của dòng owner/admin, hoặc của chính mình, chỉ Chủ nhiệm làm được (`requireHeadForStaffRow(..., includeSelf = true)`). Coi là "đổi" khi tập mới khác tập cũ (không tính thứ tự) hoặc ban chính khác.
  - Vẫn nhận `team_id` (cũ) khi không có `team_ids`, hành vi như trước.
- Không sửa file khác ngoài `src/app/api/` và `src/lib/` trừ khi cần kiểu dùng chung.

## Giao diện (frontend-agent, skill chính `impeccable` — sửa giao diện đã có)
- `ClubMembersManager.tsx`: form thêm/sửa chọn **nhiều ban** (checkbox; ban đầu tiên được chọn = ban chính, có ghi chú nhỏ "Ban chính" hoặc cho chọn ban chính). Danh sách hiện tất cả tên ban. Gửi `team_ids`. Không cho chọn khi API sẽ chặn (dòng BCN/BCC hoặc chính mình khi không phải Chủ nhiệm) — đọc `isHead` từ `useCurrentAdminClub()`.
- `TasksManager.tsx`: danh sách người chọn được theo ban đọc thêm `club_member_teams` (`select member_id, team_id`) thay vì chỉ `team_id`.
- `ContributionBoard.tsx`: lọc của admin dùng `team_ids` từ RPC; dòng hiện tất cả tên ban.
- `MemberProfile.tsx` (`/me`): hiện tất cả ban (đọc `club_member_teams` của chính mình).
- Nội dung tiếng Việt, Tailwind v4, giữ cấu trúc component. Không thêm thư viện.

## Thứ tự
db-agent (xong, test xanh) → api-agent ‖ frontend-agent → reviewer → lead kiểm chứng (test, build, ảnh chụp). Người dùng merge rồi `npx supabase db push --remote`.
