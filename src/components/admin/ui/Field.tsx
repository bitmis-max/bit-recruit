import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

/** Class chung cho input/select/textarea (input một dòng cao 36px). */
export const inputClass = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-[7px] text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 disabled:bg-zinc-50 disabled:text-zinc-500 aria-[invalid=true]:border-rose-400";

/** Nhãn + một ô nhập + gợi ý/lỗi. Control con tự được gắn aria-describedby và aria-invalid. */
export function Field({ label, hint, error, className, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string; children: ReactElement }) {
  const id = useId();
  const note = error ?? hint;
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, { "aria-describedby": note ? id : undefined, "aria-invalid": error ? true : undefined })
    : children;
  return <div className={className}>
    <label className="block text-sm font-medium text-zinc-800"><span className="block">{label}</span><span className="mt-1 block font-normal">{control}</span></label>
    {note && <p id={id} role={error ? "alert" : undefined} className={`mt-1 text-xs ${error ? "text-rose-700" : "text-zinc-500"}`}>{note}</p>}
  </div>;
}
