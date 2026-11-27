# Quy tắc giao diện quản trị (`/manage-clubs`)

Bộ dùng chung nằm ở `src/components/admin/ui/`. Chỉ dùng, không sửa. Chế độ thiết kế: Operate (gọn, quen thuộc, thống nhất). Màu: zinc nền, emerald nhấn, rose nguy hiểm, amber cảnh báo.
Mẫu tham khảo: `src/components/admin/recruitment/TeamsManager.tsx`, `src/components/admin/AdminOverview.tsx`.

## Nguyên tắc

1. **Đầu trang = `PageHeader`**: h1 + mô tả ngắn (nếu cần) + hành động bên phải. Không có nhãn nhỏ phía trên tiêu đề.
2. **Một hành động chính mỗi màn** (`primary`). Còn lại `secondary` hoặc `ghost`. Không đặt 2 nút đặc cạnh nhau.
3. **Danh sách trước, form sau.** Form tạo mới ẩn sau nút "Thêm …" (primary, ở PageHeader), mở trong `CreatePanel` phía trên danh sách. Danh sách dùng hết bề ngang.
4. **Xóa không nằm trên mỗi dòng.** "Xóa" là nút `danger` ở cuối form sửa/chi tiết, giữ hộp xác nhận cũ. Trên dòng chỉ còn 1 hành động.
5. **Không lồng khung trong khung.** Một cấp viền (`Panel`). Nhóm bên trong dùng khoảng cách hoặc đường kẻ mảnh.
6. **Thông báo dùng `Notice`**, không tự viết class thông báo.
7. **Icon dùng `Icon`.** Không dùng ký tự ☰ ▲ ▼ ✕ + ⠿ làm icon.
8. **Đủ trạng thái**: hover, focus-visible, disabled, đang tải (khung chờ `animate-pulse`, không spinner giữa nội dung), rỗng (`EmptyState`), lỗi.
9. **Mobile 375px không tràn ngang.** Bảng rộng thì bọc `overflow-x-auto` trong khung riêng hoặc đổi thành danh sách.

Khung trang: `<section className="mx-auto max-w-6xl p-5 sm:p-8">` rồi `PageHeader`, các `Notice`, `CreatePanel`, nội dung.
Chữ: h1 `text-2xl font-semibold`, h2 trong Panel `text-base font-semibold`, thân `text-sm`, phụ `text-xs text-zinc-500`.

## Component

Import tương đối, ví dụ `import { Button } from "../ui/Button";`

### Button, ButtonLink

```tsx
<Button variant="primary" icon="plus" onClick={openCreate}>Thêm thành viên</Button>
<Button type="submit" variant="primary" loading={busy}>{busy ? "Đang lưu…" : "Lưu"}</Button>
<Button variant="secondary" size="sm" icon="upload">Import Excel</Button>
<Button variant="danger" icon="trash" onClick={remove}>Xóa ban</Button>
<Button variant="ghost" size="sm" icon="arrow-up" aria-label="Chuyển lên" />   {/* chỉ icon: bắt buộc aria-label */}
<ButtonLink href="/manage-clubs/members" variant="secondary" size="sm">Xem</ButtonLink>
```

- `variant`: `primary | secondary | ghost | danger` (mặc định `secondary`). `size`: `sm` (30px) | `md` (36px, mặc định).
- `type` mặc định là `"button"`: nút gửi form phải ghi `type="submit"`.
- `loading` = vô hiệu hóa + `aria-busy`; tự đổi chữ nút ("Đang lưu…") ở chỗ gọi.
- Nhận mọi thuộc tính của `<button>` (`onClick`, `disabled`, `aria-*`, `className`…).

### PageHeader

```tsx
<PageHeader title="Thành viên" description="Danh sách thành viên CLB." actions={<Button variant="primary" icon="plus" onClick={open}>Thêm thành viên</Button>} />
```

### Panel

```tsx
<Panel title="Danh sách" actions={<Button variant="secondary" size="sm">Lọc</Button>}>…</Panel>
<Panel padded={false}><div className="overflow-x-auto"><table>…</table></div></Panel>   {/* bảng tràn mép */}
```

### CreatePanel

Mở tại chỗ, không phải modal. Esc và nút X gọi `onClose`; focus vào phần tử có `data-autofocus` (không có thì ô nhập đầu). Tự đặt nút "Hủy" trong form nếu cần.

```tsx
<CreatePanel open={creating} title="Thêm thành viên" onClose={() => setCreating(false)}>
  <form onSubmit={save} className="space-y-4">
    <Field label="Họ tên"><input required value={name} onChange={…} className={inputClass} data-autofocus /></Field>
    <div className="flex gap-2"><Button type="submit" variant="primary" loading={busy}>Thêm</Button><Button onClick={() => setCreating(false)}>Hủy</Button></div>
  </form>
</CreatePanel>
```

### Notice

```tsx
{error && <Notice tone="error">{error}</Notice>}
{notice && <Notice tone="success">{notice}</Notice>}
<Notice tone="warning" action={<Button variant="secondary" size="sm">Tạo tài khoản</Button>}>3 thành viên chưa có tài khoản.</Notice>
```

`tone`: `error` (rose, `role="alert"`) | `success` | `warning` | `info` (mặc định). Có sẵn `mb-4`.

### EmptyState

Không có viền, đặt trong `Panel`.

```tsx
<Panel padded={false}><EmptyState title="Chưa có sự kiện" description="Thêm sự kiện đầu tiên." action={<Button variant="primary" icon="plus" onClick={open}>Thêm sự kiện</Button>} /></Panel>
```

### Field, inputClass

`Field` bọc nhãn + một control (input/select/textarea) và tự gắn `aria-describedby`, `aria-invalid`. `inputClass` dùng cho mọi ô nhập.

```tsx
<Field label="Email" hint="Dùng để tạo tài khoản." error={emailError}><input type="email" value={email} onChange={…} className={inputClass} /></Field>
<Field label="Ghi chú"><textarea rows={3} className={inputClass} /></Field>
```

Ô nhập không nằm trong `Field` (vd. ô lọc) vẫn dùng `className={inputClass}` kèm `aria-label`.

### Icon

```tsx
<Icon name="plus" />            {/* 16px */}
<Icon name="chevron-down" size={20} className="text-zinc-500" />
```

Tên: `plus edit trash chevron-down chevron-right arrow-up arrow-down grip close search upload refresh external menu check mail calendar users`. Luôn `aria-hidden`; icon đứng một mình trong nút phải có `aria-label` ở nút. Xoay bằng class (vd. `rotate-180` cho chevron mở/đóng).
