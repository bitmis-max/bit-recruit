import type { ReactNode } from "react";

export type NoticeTone = "error" | "success" | "warning" | "info";
const tones: Record<NoticeTone, { box: string; role: "alert" | "status" }> = {
  error: { box: "border-rose-200 bg-rose-50 text-rose-800", role: "alert" },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", role: "status" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", role: "status" },
  info: { box: "border-zinc-200 bg-zinc-50 text-zinc-700", role: "status" },
};

/** Thông báo ngắn. `action` (tùy chọn) là nút secondary nằm bên phải. Có sẵn margin dưới mb-4. */
export function Notice({ tone = "info", action, className, children }: { tone?: NoticeTone; action?: ReactNode; className?: string; children: ReactNode }) {
  const { box, role } = tones[tone];
  return <div role={role} className={`mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-3.5 py-2.5 text-sm ${box} ${className ?? ""}`}>
    {/* basis-56: chữ giữ tối thiểu ~14rem, màn hẹp thì nút action xuống dòng thay vì bóp chữ thành một cột. */}
    <div className="min-w-0 flex-1 basis-56">{children}</div>
    {action}
  </div>;
}
