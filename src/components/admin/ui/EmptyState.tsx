import type { ReactNode } from "react";

/** Trạng thái rỗng: nói rõ đang trống gì, kèm nút làm việc đầu tiên. Đặt trong Panel (tự nó không có viền). */
export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return <div className="px-4 py-10 text-center">
    <p className="text-sm font-semibold text-zinc-900">{title}</p>
    {description && <p className="mx-auto mt-1 max-w-md text-sm text-zinc-600">{description}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>;
}
