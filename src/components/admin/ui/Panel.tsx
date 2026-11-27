import type { ReactNode } from "react";

/** Khung trắng một cấp viền. `padded={false}` cho bảng/danh sách tràn mép. Không đặt Panel trong Panel. */
export function Panel({ title, actions, padded = true, className, children }: { title?: ReactNode; actions?: ReactNode; padded?: boolean; className?: string; children: ReactNode }) {
  return <section className={`rounded-xl border border-zinc-200 bg-white ${className ?? ""}`}>
    {(title || actions) && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 sm:px-5">
      <h2 className="min-w-0 text-base font-semibold text-zinc-900">{title}</h2>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>}
    <div className={padded ? "p-4 sm:p-5" : ""}>{children}</div>
  </section>;
}
