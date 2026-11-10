// Chống open redirect: chỉ cho phép quay lại "/" hoặc các trang nội bộ đã biết.
// File thuần TypeScript, không import gì để `node --test` chạy trực tiếp.
const ALLOWED_NEXT = /^\/(manage-clubs|me)(\/|\?|$)/;
// Dấu gạch ngược, tab, xuống dòng và mọi ký tự điều khiển: trình duyệt có thể bỏ hoặc đổi chúng thành "/".
const FORBIDDEN_CHARS = /[\\\u0000-\u001f\u007f]/;

export function safeNextPath(next: string | null | undefined, fallback = "/manage-clubs"): string {
  if (typeof next !== "string") return fallback;
  if (FORBIDDEN_CHARS.test(next)) return fallback;
  if (next === "/" || ALLOWED_NEXT.test(next)) return next;
  return fallback;
}
