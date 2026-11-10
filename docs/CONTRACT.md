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
