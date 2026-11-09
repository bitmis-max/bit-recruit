import * as nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import type { EmailAttachment } from "../../../lib/email/template";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { decryptGoogleRefreshToken } from "../../../lib/email/google-token";
import { fetchPublicFile } from "../../../lib/security/safe-fetch";

export const runtime = "nodejs";

const DEBUG =
  process.env.EMAIL_DEBUG === "true" ||
  process.env.NEXT_PUBLIC_EMAIL_DEBUG === "true";

function debugLog(message: string, detail?: unknown) {
  if (!DEBUG) return;
  console.info(`[api/send-email] ${message}`, detail ?? "");
}

type SendRequest = {
  to: string;
  from?: string;
  subject: string;
  html: string;
  attachmentUrl?: string;
  driveId?: string;
  attachmentName?: string;
  imageAttachment?: EmailAttachment;
  clubId?: string;
};

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function getFileNameFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split("/").filter(Boolean).pop();
    return name || "attachment";
  } catch {
    return "attachment";
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendRequest;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    if (!supabase || !user || !body.clubId) return Response.json({ ok: false, error: "Cần đăng nhập và chọn CLB." }, { status: 401 });
    const { data: membership } = await supabase.from("club_members").select("role").eq("user_id", user.id).eq("club_id", body.clubId).eq("is_active", true).limit(1).maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) return Response.json({ ok: false, error: "Bạn không có quyền gửi mail cho CLB này." }, { status: 403 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!supabaseUrl || !serviceKey || !googleClientId || !googleClientSecret) {
      return Response.json({ ok: false, error: "Máy chủ chưa cấu hình kết nối Gmail." }, { status: 503 });
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: storedToken, error: tokenError } = await admin.from("google_mail_tokens")
      .select("encrypted_refresh_token").eq("user_id", user.id).maybeSingle();
    if (tokenError) {
      debugLog("Could not load stored Google token", tokenError.message);
      return Response.json({ ok: false, error: "Không tải được kết nối Gmail. Hãy kết nối lại Google." }, { status: 500 });
    }
    if (!storedToken?.encrypted_refresh_token) {
      return Response.json({ ok: false, error: "Hãy kết nối Gmail bằng nút Kết nối / làm mới quyền Gmail trước khi gửi." }, { status: 401 });
    }

    let refreshToken: string;
    try {
      refreshToken = decryptGoogleRefreshToken(storedToken.encrypted_refresh_token);
    } catch (error) {
      debugLog("Could not decrypt Google refresh token", error instanceof Error ? error.message : "Unknown error");
      return Response.json({ ok: false, error: "Không đọc được kết nối Gmail. Hãy kết nối lại Google." }, { status: 500 });
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });
    const tokenResult = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
    if (!tokenResponse.ok || !tokenResult.access_token) {
      debugLog("Google token refresh failed", { status: tokenResponse.status, error: tokenResult.error });
      return Response.json({ ok: false, error: "Không làm mới được quyền Gmail. Hãy kết nối lại Google." }, { status: 401 });
    }
    const providerToken = tokenResult.access_token;
    const to = body.to?.trim();
    const from = body.from?.trim();
    const subject = body.subject?.trim();
    const html = body.html ?? "";
    const driveId = body.driveId?.trim();
    const attachmentName = body.attachmentName?.trim();

    const rawAttachmentUrl = typeof body.attachmentUrl === "string" ? body.attachmentUrl.trim() : "";
    const attachmentUrl =
      rawAttachmentUrl ||
      (driveId ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}` : "");

    if (!to || !from || !subject || !html) {
      debugLog("Invalid payload", { to, from, subject });
      return Response.json(
        { ok: false, error: "Thiếu người nhận, người gửi, tiêu đề hoặc nội dung." },
        { status: 400 }
      );
    }

    const attachments:
      Array<{ filename: string; content: Buffer | string; contentType?: string; encoding?: BufferEncoding }>
      = [];

    if (attachmentUrl) {
      debugLog("Fetching attachment", { url: attachmentUrl });
      try {
        const file = await fetchPublicFile(attachmentUrl, { maxBytes: MAX_ATTACHMENT_BYTES });
        attachments.push({
          filename: attachmentName || getFileNameFromUrl(file.finalUrl),
          content: file.buffer,
          contentType: file.contentType ?? undefined,
        });
      } catch (error) {
        // fetchPublicFile chỉ ném lỗi tiếng Việt, an toàn để trả về cho người dùng.
        const message = error instanceof Error ? error.message : "Không tải được tệp đính kèm.";
        debugLog("Attachment download failed", { message });
        return Response.json({ ok: false, error: message }, { status: 400 });
      }
    }

    if (body.imageAttachment) {
      const imageAttachment = body.imageAttachment;
      attachments.push({
        filename: imageAttachment.filename,
        content: imageAttachment.content,
        contentType: imageAttachment.contentType,
        encoding: imageAttachment.encoding,
      });
    }

    debugLog("Compiling MIME message using nodemailer streamTransport");
    const transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: true,
    });

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      attachments,
    });

    const rawMessage = info.message.toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    debugLog("Sending via Gmail REST API for: " + from);
    const gmailResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${providerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: rawMessage,
        }),
      }
    );

    if (!gmailResponse.ok) {
      const errorText = await gmailResponse.text();
      debugLog("Gmail API send failed", {
        status: gmailResponse.status,
        errorText,
      });
      return Response.json(
        { ok: false, error: "Gmail từ chối gửi thư. Hãy kiểm tra quyền Gmail hoặc kết nối lại Google." },
        { status: gmailResponse.status }
      );
    }

    const gmailData = (await gmailResponse.json()) as { id: string };
    debugLog("Gmail API ok", { messageId: gmailData.id });
    return Response.json({ ok: true, data: { messageId: gmailData.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    debugLog("Unhandled error", { message });
    return Response.json({ ok: false, error: "Không gửi được email. Vui lòng thử lại." }, { status: 500 });
  }
}
