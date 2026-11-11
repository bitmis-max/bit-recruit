# Handoff

Cập nhật: 2026-11-11 — Đợt 0–5 đã lên production. Còn lại: người dùng chuyển dữ liệu thật + thử 3 luồng chưa kiểm chứng + vài quyết định.

## Trạng thái
- **Web:** https://bit-bav.vercel.app (Vercel project `bit-bav`, tài khoản `bitmis-3939`, Auto-assign tên miền production đã bật).
- **Git:** `main` = `d4caa31` (merge PR #3). Các PR đã merge: #1 Đợt 0–3 + import ứng viên, #2 Đợt 4 phân quyền, #3 Đợt 5 import thành viên + hướng dẫn. Không còn nhánh đang làm.
- **DB thật** (`rftgnkgnyvtehnsjwuhp`): đã nâng cấp từ schema legacy, giữ dữ liệu (55 đơn, 2365 câu trả lời…). Migration local = remote: `20261023000000` (baseline, đánh dấu bằng `migration repair`) → `20261110` vai trò/nhiệm kỳ → `20261111` giao việc → `20261112` Facebook/khung avatar → `20261113` thu quyền anon → `20261114` import ứng viên → `20261115` phân quyền → `20261116` import thành viên.
- **Dữ liệu quản trị hiện có:** 1 Chủ nhiệm (tài khoản BIT, owner `is_head`), 2 thành viên. Chưa ai khác có tài khoản / quyền.
- **Test (local):** `npm test` 104/104, `npx supabase test db` 934/934 (7 file). tsc sạch, build sạch.
- **Tài liệu:** hướng dẫn người dùng `docs/HUONG-DAN-SU-DUNG.md`; thiết kế DB `docs/database.md`; hợp đồng từng đợt `docs/CONTRACT-1.md` … `docs/CONTRACT-4.md`, `docs/CONTRACT.md` (Đợt 5).

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

## Đợt bảo mật (2026-11-11, nhánh `fix/security-hardening`, đã push + mở PR, chờ tài khoản BIT merge)
- Rà soát: API, RLS, storage, thư viện, header. Báo cáo đã gửi người dùng; người dùng duyệt Đợt A.
- Đã làm (local, test xanh: unit 104/104, pgTAP 939/939, build sạch):
  - Migration `20261117000000_security_hardening.sql`: bỏ policy cho phép ai cũng tải lên bucket mẫu `thumbnails`/`videos` (khóa bucket); thu quyền ghi bảng của `anon`; `submit_application` từ chối đơn > 100 KB hoặc > 200 câu trả lời. Test: `supabase/tests/security_hardening.test.sql`.
  - `next` 16.2.6 → 16.4.6 (lỗ hổng critical), `@tiptap/*` 3.33.1, `prosemirror-view` 1.42.9 (XSS khi dán).
  - `next.config.ts`: header chống clickjacking (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), `nosniff`, `Referrer-Policy`, tắt `X-Powered-By`.
  - `/api/admin/accounts` PATCH: chỉ Chủ nhiệm đổi được email đăng nhập.
  - Danh sách thành viên: ẩn nút "Xóa" ở dòng Chủ nhiệm (và dòng BCN/BCC khi không phải Chủ nhiệm). Server vốn đã chặn.
- Người dùng cần làm: commit/PR → merge; `npx supabase db push --remote`; dashboard Supabase: tắt "Allow new users to sign up" (hiện vẫn MỞ), bật Leaked password protection; sau đó thử thành viên tạo sẵn đăng nhập Google; xóa hẳn bucket `thumbnails`/`videos` trong Storage nếu muốn.
- Để sau (người dùng chọn "tính sau"): Turnstile chống spam; thay `xlsx` (dùng cho import thành viên, import ứng viên, gửi mail); nâng `nodemailer` v10 (major).

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
