import type { EmailAttachment } from "./template";

export type SendEmailPayload = {
  to: string;
  /** Chỉ dạng `Tên hiển thị <email>`; máy chủ bỏ địa chỉ và luôn gửi từ Gmail của người gọi. */
  from?: string;
  subject: string;
  html: string;
  attachmentUrl?: string;
  driveId?: string;
  attachmentName?: string;
  imageAttachment?: EmailAttachment;
  variables?: Record<string, string>;
  recipientId?: string;
  campaignId?: string;
  /** CLB đang chọn (bắt buộc: máy chủ kiểm quyền theo CLB này). */
  clubId: string;
};

const DEBUG = process.env.NEXT_PUBLIC_EMAIL_DEBUG === "true";

function debugLog(message: string, detail?: unknown) {
  if (!DEBUG) return;
  console.info(`[send-email] ${message}`, detail ?? "");
}

export async function sendEmail(payload: SendEmailPayload) {
  debugLog("Calling /api/send-email", { to: payload.to });
  let response: Response;
  try {
    response = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    debugLog("API route error", data);
    throw new Error(typeof data?.error === "string" ? data.error : "Gửi mail không thành công. Hãy thử lại.");
  }
  debugLog("API route ok", data);
  return data;
}
