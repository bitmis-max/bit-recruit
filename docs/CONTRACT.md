# Hợp đồng Đợt 3: đối chiếu tương tác Facebook + avatar khung

Mọi agent làm theo đúng tên ở đây. Muốn đổi tên hay chữ ký thì báo lead, không tự đổi. Hợp đồng cũ vẫn có hiệu lực: `docs/CONTRACT-1.md` (vai trò, nhiệm kỳ), `docs/CONTRACT-2.md` (giao việc, nhắc hạn, đóng góp).

## 0. Ý tưởng

- Không máy chủ nào tự vào Facebook (Graph API không cho danh sách người react; cào bằng bot vi phạm điều khoản). Thay vào đó Ban chủ chốt mở bài viết trên trình duyệt **của chính họ**, mở hộp danh sách react (hoặc phần bình luận), bấm **bookmarklet**. Bookmarklet đọc tên + link hồ sơ (+ ảnh avatar nhỏ) đang hiện trên màn hình, rồi mở trang `/manage-clubs/scan#<dữ liệu>` của web CLB. Dữ liệu nằm trong phần `#` của URL nên không gửi lên máy chủ nào; trang scan so khớp ngay trên trình duyệt.
- "Nhiệm vụ tương tác" và "thay avatar" là **việc** (bảng `tasks` của Đợt 2) với `kind` mới, nên tự có nhắc hạn qua Gmail và bảng đóng góp.
- Avatar khung: Ban chủ chốt tải lên khung PNG; thành viên ghép ảnh của mình với khung ngay trên trình duyệt (ảnh không tải lên đâu) rồi tải về. Kiểm tra ai đã thay avatar là **thử nghiệm**: bookmarklet đo màu vòng viền của avatar nhỏ trong danh sách react và so với khung; Ban chủ chốt luôn xác nhận lại bằng tay.

## 1. Database (migration mới `supabase/migrations/20261112000000_engagement_frames.sql`)

### 1.1. Bảng / cột
```
avatar_frames (
  id uuid pk default gen_random_uuid(),
  club_id uuid not null fk clubs cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  image_path text not null,              -- đường dẫn trong bucket 'avatar-frames', dạng '<club_id>/<uuid>.png'
  created_by uuid null fk club_members(id) set null,
  created_at timestamptz default now()
)

tasks: thêm
  kind text not null default 'general' check (kind in ('general','engagement','avatar')),
  post_url text null,      -- bắt buộc khi kind='engagement'; check khớp ^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+
  frame_id uuid null fk avatar_frames(id) on delete set null   -- chỉ dùng khi kind='avatar'
  (constraint: kind='engagement' => post_url not null; kind<>'avatar' => frame_id is null;
   frame phải cùng CLB với task — trigger)

member_facebook_aliases (
  club_id uuid not null fk clubs cascade,
  fb_key text not null check (fb_key ~ '^(id:[0-9]{3,25}|u:[a-z0-9.]{1,80})$'),
  member_id uuid not null fk club_members cascade,
  created_at timestamptz default now(),
  primary key (club_id, fb_key)
)  -- trigger: member cùng CLB
```

### 1.2. RLS / grant
- `avatar_frames`: SELECT cho `anon, authenticated` (khung là ảnh quảng bá, trang ghép avatar công khai) — grant theo cột `(id, club_id, name, image_path, created_at)`, không lộ `created_by` (sửa sau review). Không grant ghi cho authenticated (API dùng service-role).
- `member_facebook_aliases`: SELECT/INSERT/DELETE cho admin của CLB (`is_club_admin`). Grant insert `(club_id, fb_key, member_id)`, không grant update.
- `tasks`: grant update theo cột giữ như cũ (`title, description, due_at, status`) — `kind`, `post_url`, `frame_id` chỉ đặt qua `create_task`.
- Bucket `avatar-frames`: public, giới hạn 2 MB, chỉ `image/png`. Policy storage: đọc công khai; ghi/xóa chỉ service-role (không tạo policy ghi cho authenticated).

### 1.3. Hàm
- `create_task(...)`: GIỮ chữ ký cũ và thêm tham số có default ở cuối: `p_kind text default 'general', p_post_url text default null, p_frame_id uuid default null, p_all_members boolean default false`. `p_all_members = true` → giao cho mọi thành viên đang hoạt động của CLB (hợp với người chọn lẻ/ban). Kiểm tra theo 1.1; lỗi tiếng Việt. Drop hàm cũ rồi tạo lại (cùng grant/revoke). Gọi theo tham số có tên như Đợt 2 vẫn chạy.
- `apply_task_scan(p_task_id uuid, p_member_ids uuid[]) returns int`: chỉ admin của CLB chứa task; task phải `open`; đặt `status = 'done'` cho các dòng `task_assignees` của task đó có `member_id` trong mảng VÀ đang `pending` (không đụng `done`/`missed`); trả số dòng đã đổi. `completed_at` do trigger.

## 2. Thư viện + API (`src/lib`, `src/app/api`)

Các hàm dưới đây phải **tự đóng gói** (self-contained): không tham chiếu biến/hàm ngoài thân hàm, không import, chỉ cú pháp ES2017 cơ bản (không spread `...`, không optional chaining `?.`, không `??`, không async/await, không class, không regex có cờ `s`/`u`/lookbehind). Lý do: bookmarklet nhúng chúng bằng `fn.toString()` và chạy trên trang Facebook.

- `src/lib/facebook/profile-key.ts`: `export function facebookProfileKey(raw: string): string | null`
  - Nhận URL tuyệt đối hoặc đường dẫn tương đối bắt đầu bằng `/` (coi như trên facebook.com). Host hợp lệ: `facebook.com`, `www.`/`m.`/`web.`/`mbasic.` + `facebook.com`, `fb.com`, `www.fb.com`.
  - `profile.php?id=<số>` → `id:<số>`; `/people/<tên>/<số>` → `id:<số>`; `/<toàn chữ số>` (3–25 chữ số) → `id:<số>` (Facebook không cho username chỉ gồm số); `/<username>` (chữ, số, dấu chấm; 1–80 ký tự) → `u:<username viết thường>`. Bỏ query/fragment (trừ `id` của profile.php), bỏ `/` cuối, bỏ đoạn sau username (vd `/username/posts/...` vẫn là `u:username`... TRỪ khi đoạn đầu là từ dành riêng).
  - (Sửa sau review) `/p/<slug>-<số>` → `id:<số>` (lấy dãy số cuối, 3–25 chữ số); `/profile/<số>` → `id:<số>`. Đoạn đầu toàn chữ số nhưng KHÔNG phải 3–25 chữ số → `null`. Username hợp lệ: 5–80 ký tự `[a-z0-9.]`, có ít nhất một chữ cái (không chỉ số/dấu chấm); không hợp lệ → `null`. Thêm từ dành riêng: `p` (khi không có số), `profile`, `me`, `public`, `about`, `lite`, `legal`, `directory`, `r.php`, `reg`, `apps`, `games`, `jobs`, `offers`, `places`, `lists`, `communities`.
  - Trả `null` với: host khác; từ dành riêng ở đoạn đầu (ít nhất: `groups, pages, events, photo, photo.php, photos, watch, hashtag, story.php, permalink.php, reel, reels, share, sharer, login, help, notifications, messages, marketplace, gaming, friends, settings, bookmarks, search, ufi, reactions, profile.php` (khi thiếu id), `home.php, privacy, policies, ads, business, l.php, stories, live, media, saved, memories, fundraisers, people` (khi thiếu số), `dialog, plugins, sharer.php, video, videos, posts`); chuỗi rỗng/không parse được.
- `src/lib/facebook/frame-signature.ts`:
  - (Sửa sau review) Vành `[0.80, 0.98]` chia thành **24 ô** = 3 dải bán kính bằng nhau (`[0.80,0.86)`, `[0.86,0.92)`, `[0.92,0.98]`) × 8 cung. Thứ tự ô: dải trong → ngoài, mỗi dải cung 0..7.
  - `export function ringSignature(rgba: ArrayLike<number>, size: number): number[]`: trả **72 số** = trung bình R,G,B (0–255, làm tròn) của mỗi ô; bỏ qua pixel alpha < 128 (ô không có pixel nào → 0,0,0).
  - `export function ringCoverage(rgba: ArrayLike<number>, size: number): number[]` (tự đóng gói): trả **24 số** 0–1 = tỉ lệ pixel alpha ≥ 128 trong mỗi ô (dùng cho ảnh khung).
  - `export function signatureDistance(a: number[], b: number[], coverage?: number[]): number`: trung bình khoảng cách Euclid RGB theo từng ô, CHỈ trên các ô có `coverage[i] >= 0.6` (không truyền coverage → mọi ô). Nếu ít hơn 4 ô dùng được → trả `Infinity`.
  - Phía trang scan: đo khung bằng canvas lớn (vd 192×192, `imageSmoothingQuality = "high"`) rồi tính `ringSignature` + `ringCoverage` trên ảnh đó; số ô dùng được < 4 → báo "Khung không có viền đủ dày để nhận diện" và không đoán.
  - `export const FRAME_MATCH_THRESHOLD = 60` (hằng số này được phép nằm ngoài; hai hàm trên vẫn tự đóng gói).
- `src/lib/facebook/bookmarklet.ts`:
  - `export function scanFacebookPage(profileKey, ringSig, siteOrigin: string): void` (tự đóng gói; nhận hai hàm trên làm tham số): lấy vùng quét = hộp thoại `[role="dialog"]` cuối cùng nếu có, ngược lại `[role="main"]`, ngược lại `document.body`; với mọi `<a href>` trong vùng: `key = profileKey(href)`, tên = text đã trim (bỏ nếu rỗng hoặc > 100 ký tự); gộp theo `key` (giữ tên đầu tiên khác rỗng); avatar: tìm `img` hoặc `image` (SVG) gần nhất trong hàng chứa link (đi lên tối đa 4 cấp cha) → vẽ lên canvas 48×48 với `crossOrigin` nếu cần, gọi `ringSig`; lỗi CORS/tainted thì `sig = null`. Hiện một khung thông báo nhỏ chèn vào trang (không `alert`), rồi `window.open(siteOrigin + "/manage-clubs/scan#" + encodeURIComponent(JSON.stringify(payload)))` với `payload = { v: 1, source: location.href, scannedAt: ISO, items: [{ key, name, sig }] }`; tối đa 3000 item.
  - `export function buildBookmarklet(siteOrigin: string): string`: trả `"javascript:" + encodeURIComponent("(" + scanFacebookPage.toString() + ")(" + facebookProfileKey.toString() + "," + ringSignature.toString() + "," + JSON.stringify(siteOrigin) + ")")`.
  - `export function parseScanPayload(hash: string): { source: string; scannedAt: string; items: { key: string; name: string; sig: number[] | null }[] } | null`: giải mã phần `#`, kiểm tra kiểu chặt (v=1; items là mảng ≤ 3000; key khớp regex của 1.1; name là chuỗi ≤ 100 ký tự; sig null hoặc mảng **72** số hữu hạn 0–255); sai → null.
  - (Sửa sau review) Bookmarklet: nếu URL mở trang scan dài hơn 1.500.000 ký tự thì bỏ `sig` của mọi item và báo trong khung thông báo; vẫn quá dài thì báo lỗi "Danh sách quá dài, hãy quét từng phần" và không mở.
- `POST /api/admin/frames` (multipart: `clubId`, `name`, `file`): owner/admin; file PNG thật (kiểm tra 8 byte chữ ký PNG), ≤ 2 MB, đọc IHDR: rộng = cao, 400–2048 px; upload service-role lên `avatar-frames/<clubId>/<uuid>.png`; insert `avatar_frames`; trả `{ ok: true, data: { id, name, image_path, publicUrl } }`. Theo mẫu `src/app/api/admin/events/image/route.ts`.
- `DELETE /api/admin/frames?clubId=&id=`: owner/admin; xóa object storage + dòng (task đang dùng frame sẽ có `frame_id` null).

## 3. Giao diện

- `/manage-clubs/scan` (mới; `src/components/admin/scan/ScanImport.tsx`):
  - Không có `#` dữ liệu: hướng dẫn từng bước + link bookmarklet kéo lên thanh dấu trang (đặt `href` bằng `buildBookmarklet(window.location.origin)` qua ref/`setAttribute` vì React chặn `javascript:` trong JSX) + nút "Sao chép mã" dự phòng.
  - Có dữ liệu: `parseScanPayload(location.hash)` rồi `history.replaceState` xóa `#` ngay. Nạp thành viên đang hoạt động (có `facebook_url`) + `member_facebook_aliases`; tính key bằng `facebookProfileKey`; chia 3 nhóm: **Khớp**, **Không khớp** (chọn thành viên để gắn → insert alias, chuyển sang Khớp), **Thành viên chưa thấy**. Chọn một việc `open` loại `engagement` hoặc `avatar` của CLB; với việc `avatar` có khung: tải ảnh khung (public URL) → canvas 48×48 → `ringSignature` → so `signatureDistance` với `sig` từng người; hiện "Có vẻ đã thay khung" / "Chưa thấy khung" / "Không đọc được ảnh"; KHÔNG tick sẵn ai (sửa sau review): admin chọn bằng tay hoặc nút "Chọn hết người khớp" / "Chọn người có vẻ đã thay khung". Luôn hiện cảnh báo: dữ liệu đến từ địa chỉ trang, chỉ dùng nếu bạn vừa tự quét (kèm thời điểm quét, số người, nguồn). Ghi rõ giới hạn: khi quét phần bình luận, người được nhắc tên (@) trong bình luận cũng bị tính. Nút "Đánh dấu xong cho N người" → `rpc("apply_task_scan")`. Có thể quét nhiều lần (react rồi bình luận) — mỗi lần chỉ thêm "xong".
  - (Sửa sau review) Lưu payload đã đọc vào `sessionStorage` (key `bit-scan-payload`) để không mất khi đổi CLB/remount; nút "Xóa kết quả quét" xóa nó. Màn hướng dẫn nhắc "Chọn đúng CLB ở thanh bên trước khi quét".
  - (Sửa sau review) Mục "Tài khoản Facebook đã gắn" liệt kê `member_facebook_aliases` của CLB (key, tên thành viên) với nút "Gỡ" (delete). Gắn một key đã có alias → báo tiếng Việt "Tài khoản này đã được gắn với <tên>. Gỡ trước rồi gắn lại." (không hiện lỗi gốc của Postgres).
- `/manage-clubs/frames` (mới; `src/components/admin/frames/FramesManager.tsx`): tải khung (tên + PNG), danh sách khung (ảnh, link công khai `/frames/<id>` có nút sao chép), xóa (hộp xác nhận trong trang).
- `/frames/[id]` (mới, CÔNG KHAI, không cần đăng nhập; `src/components/frames/FrameMaker.tsx`): chọn ảnh từ máy, kéo để căn và thanh trượt phóng to, xem trước tròn, tải về PNG 1080×1080 (canvas). Ảnh không rời khỏi máy. Dùng được tốt trên điện thoại (kéo bằng ngón tay, nút lớn). Khung không tồn tại → thông báo.
- `TasksManager`: chọn loại việc (Việc thường / Tương tác bài viết / Thay avatar); "Tương tác" bắt nhập link bài viết; "Thay avatar" chọn khung; tùy chọn "Giao cho tất cả thành viên"; việc loại tương tác/avatar có nút "Đối chiếu bằng bookmarklet" dẫn tới `/manage-clubs/scan`.
- `MyTasks` (`/me`): việc tương tác hiện link bài viết ("Mở bài viết"); việc avatar hiện link "Tạo avatar khung" tới `/frames/<frame_id>`.
- `AdminShell`: thêm "Đối chiếu Facebook" (`/manage-clubs/scan`) và "Khung avatar" (`/manage-clubs/frames`).
- Mail nhắc (Đợt 2) không đổi.

## 4. Test

- Unit:
  - `tests/unit/profile-key.test.ts`: nhiều dạng URL (username, profile.php?id, people, m./web./mbasic./fb.com, đường dẫn tương đối, query/fragment, `/` cuối, chữ hoa, đoạn sau username), các từ dành riêng, host lạ (`facebook.com.evil.com`, `evilfacebook.com`), chuỗi rác → null.
  - `tests/unit/bookmarklet.test.ts`: `facebookProfileKey`, `ringSignature`, `scanFacebookPage` đều chạy được khi dựng lại từ `toString()` bằng `new Function` (chứng minh tự đóng gói); `buildBookmarklet` bắt đầu bằng `javascript:` và giải mã ra code có `siteOrigin`; `parseScanPayload` nhận đúng và từ chối dữ liệu sai (key sai, quá 3000 item, sig sai độ dài, JSON hỏng).
  - `tests/unit/frame-signature.test.ts`: ảnh tổng hợp có vòng màu đỏ vs vòng xanh → khoảng cách lớn; cùng vòng + nhiễu nhỏ → dưới ngưỡng; pixel trong suốt bị bỏ qua.
- pgTAP `supabase/tests/engagement.test.sql`: ràng buộc kind/post_url/frame_id; `create_task` với `p_all_members`, với frame CLB khác bị lỗi; gọi kiểu cũ (không tham số mới) vẫn chạy; `apply_task_scan` (quyền, chỉ pending → done, không đụng missed/done, task closed bị lỗi, trả đúng số); alias (admin CLB khác bị chặn, fb_key sai định dạng bị lỗi, member khác CLB bị lỗi); anon đọc được `avatar_frames`, không ghi được.

## 5. (Bổ sung sau khi gộp `main`) Import ứng viên từ Excel trên mô hình form theo vị trí

Bối cảnh: `main` (2026-10-27) có tính năng import ứng viên/ca phỏng vấn từ Excel ở `ApplicationsManager` và `InterviewsManager` (xem `git show origin/main:<file>`), ghi thẳng từ trình duyệt và tạo **một form theo đợt tuyển** (`campaign_id`). DB hiện dùng **một form cho mỗi vị trí** và không cho client insert `applications`/`application_answers`. Chuyển toàn bộ việc ghi vào một RPC chạy trong một transaction.

### 5.1. DB (migration mới `supabase/migrations/20261114000000_import_applications.sql`)
`import_applications(p_campaign_id uuid, p_form_name text, p_form_description text, p_questions text[], p_rows jsonb) returns jsonb` — security definer, `set search_path = public`, revoke from public, anon; grant execute cho authenticated, service_role.
- Người gọi phải là admin của CLB chứa đợt tuyển (`is_club_admin`). Lỗi tiếng Việt.
- `p_questions`: tiêu đề câu hỏi riêng (cột "Câu hỏi riêng" trong Excel), theo thứ tự; trim; bỏ rỗng; không trùng; tối đa 100 câu, mỗi câu ≤ 500 ký tự.
- `p_rows`: mảng tối đa 2000 object `{ position, session, full_name, email, phone, student_code, class_name, answers }`; `position` bắt buộc (≤ 200 ký tự); `session` tùy chọn (≤ 200); các trường còn lại chuỗi hoặc null (trim, rỗng → null; email viết thường); `answers` là object `{ "<tiêu đề câu hỏi>": "<giá trị>" }` chỉ dùng các khóa có trong `p_questions`. Dữ liệu sai → raise "Dòng N: …" (N bắt đầu từ 1) và không ghi gì.
- Với mỗi tên vị trí: tìm `recruitment_positions` theo `(campaign_id, name)`, không có thì tạo (team_id null).
- Với mỗi vị trí được dùng: lấy form theo `position_id`; chưa có thì tạo `application_forms(position_id, name = coalesce(nullif(trim(p_form_name),''), 'Biểu mẫu import'), description)`. Với mỗi câu trong `p_questions`: dùng câu cùng `question_text` (field_key null) trong form đó, chưa có thì thêm (`question_type 'text'`, `is_required false`, `order_index` nối tiếp).
- `session` có giá trị: tìm `interview_sessions` theo `(campaign_id, position_id, note = session)`, không có thì tạo (`round 1`, `start_time now()`, `end_time now() + 1 giờ`, `note = session`).
- Thêm `applications` (campaign_id, position_id, các trường, status mặc định). Trùng `(position_id, email)` (email khác null, đã có trong DB hoặc lặp trong chính file) → bỏ qua dòng đó, đếm `skipped_duplicates`.
- Thêm `application_answers` (answer_text) cho từng câu có giá trị không rỗng; có ca thì thêm `interview_assignments`.
- Trả `{ "imported": n, "skipped_duplicates": n, "positions_created": n, "forms_created": n, "sessions_created": n }`.

### 5.2. Giao diện
- Đưa giao diện import từ `origin/main` (nút chọn file, đọc Excel/CSV bằng `xlsx`, hộp ghép cột với các lựa chọn vị trí / ca / họ tên / email / SĐT / MSSV / lớp / câu hỏi riêng / bỏ qua, tên + mô tả biểu mẫu) vào **cả hai** màn hình hiện có (`ApplicationsManager`, `InterviewsManager`) — GIỮ NGUYÊN mọi tính năng hiện có của nhánh (đổi trạng thái, kết nạp, kết quả/điểm phỏng vấn…).
- Gom phần dùng chung vào `src/components/admin/recruitment/applicantImport.ts` (kiểu dữ liệu, danh sách lựa chọn cột, đọc file, dựng `p_questions` + `p_rows`). Nút Import gọi `supabase.rpc("import_applications", {...})` một lần, hiện kết quả "Đã import X, bỏ qua Y đơn trùng" và tải lại danh sách. Không còn insert trực tiếp vào bảng nào.

### 5.3. Test
- pgTAP `supabase/tests/import.test.sql`: quyền (member, admin CLB khác, anon bị chặn); tạo vị trí/form/câu hỏi/ca mới; dùng lại vị trí/form/câu hỏi/ca có sẵn; đơn trùng email (trong DB và trong file) bị bỏ qua; câu trả lời gắn đúng câu hỏi thuộc form của đúng vị trí; dữ liệu sai ở dòng 3 → lỗi chứa "Dòng 3" và không ghi gì; giới hạn 2000 dòng / 100 câu hỏi.

### 5.4. Sửa sau review (bắt buộc trước khi áp lên DB thật)
- Form MỚI tạo trong lúc import: tạo giống `create_application_form_from_template` với mẫu mặc định (`form_templates.is_default`) — chép đủ câu hỏi mẫu (kể cả field_key) và câu hỏi chọn ca nếu hàm đó có thêm — rồi mới thêm các câu hỏi riêng còn thiếu. Không có mẫu mặc định → tạo form trống như cũ.
- Đợt tuyển đang `open`: KHÔNG thêm câu hỏi mới vào form ĐÃ CÓ của vị trí. Nếu import cần thêm câu hỏi vào form như vậy → raise "Đợt tuyển đang mở: không thể thêm câu hỏi mới vào biểu mẫu đang nhận đơn của vị trí \"<tên>\". Hãy đóng đợt tuyển trước hoặc bỏ các cột câu hỏi riêng chưa có trong biểu mẫu." (không ghi gì).
- Cấm câu hỏi riêng có tiêu đề (so `lower(btrim())`) = "thời gian có thể tham gia phỏng vấn" → lỗi rõ (cả SQL và client).
- Giới hạn `số dòng × số câu hỏi riêng ≤ 20000` (cả SQL và client).
- Bỏ khối bắt lỗi mỗi dòng (savepoint/dòng): dùng biến số dòng hiện tại và MỘT khối exception bao ngoài để thêm tiền tố "Dòng N: " (hoặc đưa số dòng thẳng vào từng thông báo lỗi).
- Email (khác null) phải khớp regex email mà `submit_application` dùng; sai → "Dòng N: email không hợp lệ".
- Tên vị trí so khớp `lower(btrim(name))` trong cùng đợt.
- Client: file tối đa 5 MB; file nhiều sheet → báo "Chỉ đọc sheet <tên>"; ghi chú trong hộp thoại: ca phỏng vấn tạo mới có giờ tạm (sửa ở màn hình Phỏng vấn), dòng không có email không được lọc trùng.
