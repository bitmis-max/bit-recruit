import type { ReactNode } from "react";

/** Đầu trang: h1 + mô tả 1 câu + vùng hành động (xuống dòng dưới tiêu đề trên mobile). Không thêm nhãn nhỏ phía trên tiêu đề. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
      {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
  </header>;
}
