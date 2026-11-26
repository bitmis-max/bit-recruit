// Đổi lỗi kỹ thuật (Supabase/Postgres/mạng) sang câu tiếng Việt cho người dùng.
// Thuần TS, không import: dùng được ở server lẫn client và chạy được bằng `node --test`.

// Có dấu tiếng Việt = thông báo do chính hệ thống viết (RPC, API) — giữ nguyên.
const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

type ErrorLike = { code?: unknown; message?: unknown } | null | undefined;

export function friendlyError(error: unknown, fallback: string): string {
  if (!error) return fallback;
  const e = (typeof error === "object" ? error : { message: String(error) }) as ErrorLike;
  const code = typeof e?.code === "string" ? e.code : "";
  const message = typeof e?.message === "string" ? e.message : "";

  // Chỉ giữ nguyên thông báo tiếng Việt do hệ thống tự viết (raise exception → P0001, hoặc lỗi không mã).
  // Lỗi ràng buộc/quyền (23xxx, 42xxx) có thể chứa dữ liệu tiếng Việt trong "Key (...)=(...)": không trả nguyên.
  if (message && VIETNAMESE.test(message) && (code === "" || code === "P0001")) return message;
  if (code === "23505" || /duplicate key/i.test(message)) return "Dữ liệu bị trùng với một mục đã có.";
  if (code === "23503" || /foreign key/i.test(message)) return "Không thực hiện được vì còn dữ liệu liên quan (ví dụ đơn ứng tuyển hoặc việc đã giao).";
  if (code === "23514" || /check constraint/i.test(message)) return "Dữ liệu không hợp lệ.";
  if (code === "42501" || /row-level security|permission denied/i.test(message)) return "Bạn không có quyền thực hiện thao tác này.";
  if (/invalid login credentials/i.test(message)) return "Email hoặc mật khẩu không đúng.";
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
  if (/jwt expired|refresh token/i.test(message)) return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
  return fallback;
}
