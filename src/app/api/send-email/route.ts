import { createClient } from "@supabase/supabase-js";
import type { EmailAttachment } from "../../../lib/email/template";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getGmailAccessToken, GmailError, sendGmail } from "../../../lib/email/gmail";
import { fetchPublicFile } from "../../../lib/security/safe-fetch";
import { hasPermission } from "../../../lib/admin/permissions";

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
    const { data: membership } = await supabase.from("club_members").select("role,permissions").eq("user_id", user.id).eq("club_id", body.clubId).eq("is_active", true).limit(1).maybeSingle();
    if (!membership || !hasPermission(membership.role, membership.permissions, "mail")) return Response.json({ ok: false, error: "Bạn không có quyền gửi mail cho CLB này." }, { status: 403 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return Response.json({ ok: false, error: "Máy chủ chưa cấu hình kết nối Gmail." }, { status: 503 });
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const providerToken = await getGmailAccessToken(admin, user.id);
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

    debugLog("Sending via Gmail REST API for: " + from);
    const { id } = await sendGmail(providerToken, { from, to, subject, html, attachments });
    debugLog("Gmail API ok", { messageId: id });
    return Response.json({ ok: true, data: { messageId: id } });
  } catch (error) {
    if (error instanceof GmailError) return Response.json({ ok: false, error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "Unknown error";
    debugLog("Unhandled error", { message });
    return Response.json({ ok: false, error: "Không gửi được email. Vui lòng thử lại." }, { status: 500 });
  }
}
