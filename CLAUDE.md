# bit-recruit

Hệ thống tuyển thành viên cho câu lạc bộ (đa CLB). Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Supabase (Postgres, Auth, Storage, RLS). Giao diện và tài liệu bằng tiếng Việt.

Tham khảo thiết kế DB tại `docs/database.md`. Schema nằm ở `supabase/migrations/` (migration gốc + các migration tăng dần, áp theo thứ tự); `supabase/migration/legacy/` chỉ để tham khảo, không áp dụng cho DB mới. Hợp đồng giữa các agent cho đợt đang làm: `docs/CONTRACT.md`. Trạng thái và việc còn mở: `docs/HANDOFF.md`.

## Lệnh
- `npm run dev` / `npm run build` / `npm run lint`
- `npm test`: unit test (`tests/unit/`, chạy bằng `node --test`, không cần dependency).
- Test DB (pgTAP, `supabase/tests/`): `npx supabase start` (cần Docker) → `npx supabase db reset` → `npx supabase test db`. Chỉ chạy trên Supabase local.

## Vai trò
`owner` = Ban chủ nhiệm (đổi nhiệm kỳ, cấp quyền Ban chủ chốt), `admin` = Ban chủ chốt (quản trị CLB), `member` = Thành viên (chỉ vào `/me`). Ứng viên không có tài khoản; đơn `passed` được kết nạp thành `member`. Dữ liệu ứng viên chỉ owner/admin đọc được.

## Đội agent

Phiên chính đóng vai **lead**. Các agent chuyên trách nằm trong `.claude/agents/`:

| Agent | Phạm vi |
|---|---|
| `db-agent` | `supabase/migrations/`, RLS, RPC, `docs/database.md` |
| `frontend-agent` | `src/components/`, trang trong `src/app/` |
| `api-agent` | `src/app/api/`, `src/app/auth/`, `src/lib/`, `src/proxy.ts` |
| `reviewer` | Chỉ đọc; rà soát lỗi và bảo mật |

### Quy trình của lead với việc lớn
1. Đọc yêu cầu và code liên quan, lập kế hoạch ngắn: chia việc theo phạm vi ở bảng trên và nêu phụ thuộc giữa các phần (thường DB trước, rồi API, rồi UI).
2. Giao việc cho đúng agent kèm ngữ cảnh đầy đủ (agent không thấy cuộc trò chuyện). Chạy song song các phần độc lập; không để hai agent sửa cùng một file.
3. Với phần phụ thuộc nhau, chờ kết quả bước trước rồi mới giao bước sau (ví dụ: tên RPC/cột do db-agent chốt thì api-agent và frontend-agent mới dùng).
4. Sau khi xong, giao `reviewer` rà soát toàn bộ thay đổi, rồi sửa hoặc giao sửa các vấn đề tìm thấy.
5. Báo cáo cho người dùng: đã làm gì, kiểm tra gì, còn gì chưa chắc.

Việc nhỏ (sửa một file, đổi chữ) thì lead làm trực tiếp, không cần chia agent.

## Skill thiết kế giao diện (FE)

Mọi việc liên quan giao diện (trang, component, layout, màu, font, hiệu ứng) giao cho `frontend-agent`, và phải dùng skill theo bảng. Khi giao việc, lead ghi rõ tên skill trong prompt.

| Loại việc | Skill chính |
|---|---|
| Trang hoặc giao diện **mới** (landing, trang CLB, màn hình admin mới) | `hallmark` |
| Thiết kế lại, rà soát, tinh chỉnh, làm gọn, sửa responsive hoặc accessibility cho giao diện **đã có** | `impeccable` |
| Trang công khai cần "có gu" (landing, trang CLB, hero); khi trang trông rập khuôn, "AI-made" | `design-taste-frontend` (thay hallmark nếu người dùng nêu tên) |
| Chọn phong cách, bảng màu, cặp font, quy tắc UX/accessibility, loại biểu đồ cho một màn hình (có dữ liệu tra cứu sẵn); cần Python 3 | `ui-ux-pro-max` |
| Chi tiết tinh tế, cảm giác "mượt" của component | `emil-design-eng` |
| Chuyển động bằng GSAP (chỉ khi người dùng muốn dùng GSAP): timeline, cuộn | `gsap-core`, `gsap-react`, `gsap-scrolltrigger`, `gsap-timeline`, `gsap-performance` |
| Landing 3D cuộn xuyên cảnh (chỉ khi người dùng yêu cầu; cần Higgsfield, tốn phí) | `scroll-world` |
| Thêm hoặc làm lại chuyển động | `animate` (xây mới), `review-animations` (kiểm tra), `animation-performance` (giật lag) |
| Thử dữ liệu cực đoan (tên dài, 0 mục, tiếng Việt có dấu, số lớn) | `break-ui` |
| Màn hình dùng trên điện thoại | `mobile-native` |

Quy tắc:
1. **Một skill chính cho mỗi việc.** Không trộn hallmark và impeccable cho cùng một màn hình, vì chúng đưa ra hướng thẩm mỹ khác nhau. Skill phụ (animate, break-ui...) chỉ dùng sau khi hướng chính đã chốt.
2. **Quy ước dự án luôn thắng skill:** giữ Tailwind v4, cấu trúc component theo tính năng, nội dung giao diện bằng tiếng Việt. Nếu skill đề xuất thêm thư viện hay dependency, hỏi người dùng trước.
3. **Hallmark chỉ cho trang mới.** Với giao diện đã có, dùng `impeccable`, trừ khi người dùng gọi tên hallmark.
4. **Trước khi xong:** với dev server đang chạy, chạy `npx impeccable detect http://localhost:3000/<trang>` để bắt các mẫu giao diện rập khuôn và lỗi tương phản, rồi sửa các lỗi thật. Dùng skill `playwright-cli` để mở trang, chụp màn hình (desktop và mobile 375px) và đi thử luồng chính (bấm nút, điền form); xem ảnh chụp trước khi báo xong. Với màn hình có danh sách hoặc form, thử `break-ui`.
5. **Sửa nhỏ** (đổi chữ, đổi một class màu) thì lead làm trực tiếp, không cần skill.
6. Nếu người dùng nêu tên một skill khác (vd. `ui-ux-pro-max`, nếu đã cài), dùng skill đó làm skill chính.

## Quy ước
- Import tương đối, component nhóm theo tính năng.
- API trả `{ ok, data }` hoặc `{ error }`, lỗi bằng tiếng Việt.
- Service-role key và token Google chỉ dùng phía server.
- Không commit hay chạy lệnh thay đổi database thật nếu người dùng chưa yêu cầu.
