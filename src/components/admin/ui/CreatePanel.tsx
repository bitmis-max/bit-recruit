"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { Panel } from "./Panel";

/**
 * Khung mở tại chỗ (không phải modal, không bẫy focus). Khi mở: focus vào `[data-autofocus]`
 * (không có thì ô nhập đầu tiên). Esc hoặc nút đóng gọi `onClose`. Nút "Hủy" nằm trong form của người dùng.
 */
export function CreatePanel({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    // Nhớ nút đã mở panel (nút mở KHÔNG được disabled, nếu không trình duyệt đã đẩy focus về body) để trả focus khi đóng.
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    el?.scrollIntoView({ block: "nearest" });
    const target = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>("input,textarea,select");
    target?.focus({ preventScroll: true });
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [open]);
  if (!open) return null;
  return <div ref={ref} className="mb-5" onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.stopPropagation(); onClose(); } }}>
    <Panel title={title} actions={<Button variant="ghost" size="sm" icon="close" aria-label="Đóng" onClick={onClose} />}>{children}</Panel>
  </div>;
}
