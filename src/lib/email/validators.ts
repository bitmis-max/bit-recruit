export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Giới hạn của /api/send-email (đếm ký tự; base64 ≈ 1 ký tự/byte).
export const MAX_SUBJECT_LENGTH = 300;
export const MAX_HTML_LENGTH = 500 * 1024;
export const MAX_IMAGE_CONTENT_LENGTH = 7 * 1024 * 1024;
export const MAX_FILENAME_LENGTH = 200;

/** Đúng MỘT địa chỉ email; không chứa `,;<>"` hay khoảng trắng. Trả về địa chỉ đã cắt khoảng trắng, hoặc null nếu sai. */
export function parseSingleRecipient(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const to = value.trim();
  if (!to || /[,;<>"\s]/.test(to) || !isValidEmail(to)) return null;
  return to;
}

/** Tên hiển thị đã làm sạch, bọc trong dấu nháy kép (an toàn cho header From). */
export function quoteDisplayName(name: string): string {
  const clean = name.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${clean}"`;
}

/**
 * Header From an toàn: bỏ địa chỉ client gửi, luôn dùng `accountEmail`, chỉ giữ tên hiển thị
 * (phần trước `<` nếu client gửi dạng `"Tên" <x>`). Không có tên thì chỉ trả địa chỉ.
 */
export function buildFromHeader(clientFrom: unknown, accountEmail: string): string {
  let name = "";
  if (typeof clientFrom === "string") {
    const lt = clientFrom.indexOf("<");
    // Không có `<` thì client gửi mỗi địa chỉ (không có tên): bỏ.
    if (lt >= 0) name = clientFrom.slice(0, lt).trim().replace(/^"([\s\S]*)"$/, "$1").replace(/\\(.)/g, "$1");
  }
  name = name.replace(/[\s\u0000-\u001f\u007f<>]+/g, " ").trim().slice(0, 100);
  return name ? `${quoteDisplayName(name)} <${accountEmail}>` : accountEmail;
}

type ImageAttachmentInput = { filename?: unknown; content?: unknown; contentType?: unknown } | null | undefined;

/** Kiểm giới hạn kích thước của thư. Trả về thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ. */
export function checkEmailLimits(input: { subject: string; html: string; imageAttachment?: ImageAttachmentInput }): string | null {
  if (input.subject.length > MAX_SUBJECT_LENGTH) return `Tiêu đề không được vượt quá ${MAX_SUBJECT_LENGTH} ký tự.`;
  if (input.html.length > MAX_HTML_LENGTH) return "Nội dung thư quá lớn (tối đa 500 KB).";
  const image = input.imageAttachment;
  if (image) {
    if (typeof image.content !== "string" || typeof image.filename !== "string") return "Ảnh đính kèm không hợp lệ.";
    if (image.content.length > MAX_IMAGE_CONTENT_LENGTH) return "Ảnh đính kèm quá lớn (tối đa 7 MB).";
    if (image.filename.length > MAX_FILENAME_LENGTH) return `Tên tệp đính kèm không được vượt quá ${MAX_FILENAME_LENGTH} ký tự.`;
    if (typeof image.contentType !== "string" || !image.contentType.startsWith("image/")) return "Tệp đính kèm phải là ảnh.";
  }
  return null;
}
