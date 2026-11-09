// Chỉ dùng phía server: đọc refresh token đã mã hóa và gửi thư qua Gmail REST API.
import * as nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptGoogleRefreshToken } from "./google-token";

const DEBUG =
  process.env.EMAIL_DEBUG === "true" ||
  process.env.NEXT_PUBLIC_EMAIL_DEBUG === "true";

function debugLog(message: string, detail?: unknown) {
  if (!DEBUG) return;
  console.info(`[email/gmail] ${message}`, detail ?? "");
}

/** Lỗi có thông báo tiếng Việt an toàn để trả về người dùng, kèm mã HTTP gợi ý. */
export class GmailError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GmailError";
    this.status = status;
  }
}

export type GmailAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  encoding?: BufferEncoding;
};

export type GmailMail = {
  from?: string;
  to: string;
  subject: string;
  html: string;
  attachments?: GmailAttachment[];
};

export async function getGmailAccessToken(admin: SupabaseClient, userId: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new GmailError("Máy chủ chưa cấu hình kết nối Gmail.", 503);

  const { data: stored, error } = await admin.from("google_mail_tokens")
    .select("encrypted_refresh_token").eq("user_id", userId).maybeSingle();
  if (error) {
    debugLog("Could not load stored Google token", error.message);
    throw new GmailError("Không tải được kết nối Gmail. Hãy kết nối lại Google.", 500);
  }
  if (!stored?.encrypted_refresh_token) {
    throw new GmailError("Hãy kết nối Gmail bằng nút Kết nối / làm mới quyền Gmail trước khi gửi.", 401);
  }

  let refreshToken: string;
  try {
    refreshToken = decryptGoogleRefreshToken(stored.encrypted_refresh_token);
  } catch (e) {
    debugLog("Could not decrypt Google refresh token", e instanceof Error ? e.message : "Unknown error");
    throw new GmailError("Không đọc được kết nối Gmail. Hãy kết nối lại Google.", 500);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({})) as { access_token?: string; error?: string };
  if (!response.ok || !result.access_token) {
    debugLog("Google token refresh failed", { status: response.status, error: result.error });
    throw new GmailError("Không làm mới được quyền Gmail. Hãy kết nối lại Google.", 401);
  }
  return result.access_token;
}

export async function sendGmail(accessToken: string, mail: GmailMail): Promise<{ id: string }> {
  const transporter = nodemailer.createTransport({ streamTransport: true, newline: "unix", buffer: true });
  const info = await transporter.sendMail({
    from: mail.from,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    attachments: mail.attachments ?? [],
  });
  const raw = info.message.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!response.ok) {
    debugLog("Gmail API send failed", { status: response.status, errorText: await response.text() });
    throw new GmailError("Gmail từ chối gửi thư. Hãy kiểm tra quyền Gmail hoặc kết nối lại Google.", response.status);
  }
  const data = (await response.json()) as { id: string };
  return { id: data.id };
}
