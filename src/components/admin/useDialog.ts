import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Hộp thoại dạng modal: khi mở thì đưa focus vào hộp (ưu tiên phần tử có `data-autofocus`),
 * giữ Tab quay vòng trong hộp, Esc gọi `onClose`, đóng xong trả focus về chỗ cũ.
 * Gắn `ref` và `tabIndex={-1}` vào phần tử có `role="dialog"`.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void, open: boolean) {
  const ref = useRef<T>(null);
  const latestClose = useRef(onClose);
  useEffect(() => { latestClose.current = onClose; });

  useEffect(() => {
    const node = ref.current;
    if (!open || !node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (node.querySelector<HTMLElement>("[data-autofocus]") ?? node).focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.stopPropagation(); latestClose.current(); return; }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) { event.preventDefault(); node.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === node)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }
    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  return ref;
}
