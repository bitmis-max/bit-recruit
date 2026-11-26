import { useEffect, useRef } from "react";
import { friendlyError } from "../../lib/ui/friendly-error";

// Các tab quản trị được giữ mounted (AdminShell), nên dữ liệu ở tab khác dễ cũ.
// Màn nào đổi ban/thành viên thì phát sự kiện; màn nào hiển thị chúng thì nghe để tải lại.
export const TEAMS_CHANGED = "bit:teams-changed";
export const MEMBERS_CHANGED = "bit:members-changed";

export function notifyMembersChanged() {
  window.dispatchEvent(new Event(MEMBERS_CHANGED));
}

/** Gọi `reload` mỗi khi ban hoặc thành viên đổi ở màn khác. Gỡ listener khi unmount. */
export function useReloadOnAdminChange(reload: () => void) {
  const latest = useRef(reload);
  useEffect(() => { latest.current = reload; });
  useEffect(() => {
    const handler = () => latest.current();
    window.addEventListener(TEAMS_CHANGED, handler);
    window.addEventListener(MEMBERS_CHANGED, handler);
    return () => {
      window.removeEventListener(TEAMS_CHANGED, handler);
      window.removeEventListener(MEMBERS_CHANGED, handler);
    };
  }, []);
}

/** Gọi API JSON mà không ném lỗi: phản hồi không phải JSON hoặc mất mạng vẫn trả `error` tiếng Việt. */
export async function requestJson<T extends object>(url: string, init: RequestInit | undefined, fallbackError: string): Promise<{ ok: boolean; status: number; error: string; data: Partial<T> }> {
  try {
    const response = await fetch(url, init);
    const body = (await response.json().catch(() => ({}))) as Partial<T> & { error?: unknown };
    const message = typeof body.error === "string" && body.error ? body.error : "";
    const ok = response.ok && !message;
    return { ok, status: response.status, error: ok ? "" : message || fallbackError, data: body };
  } catch (error) {
    return { ok: false, status: 0, error: friendlyError(error, fallbackError), data: {} };
  }
}

/** Ghi cookie CLB đang chọn cho khu quản trị; thêm `Secure` khi trang chạy https. */
export function setAdminClubCookie(clubId: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `admin_club=${encodeURIComponent(clubId)}; Path=/manage-clubs; SameSite=Lax; Max-Age=2592000${secure}`;
}
