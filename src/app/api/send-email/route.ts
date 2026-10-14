import * as nodemailer from "nodemailer";
import type { EmailAttachment } from "../../../lib/email/template";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

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
  providerToken?: string;
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
    const providerToken = body.providerToken?.trim();

    if (!providerToken) {
      debugLog("Missing Google providerToken");
      return Response.json(
        { ok: false, error: "Yêu cầu đăng nhập Google để thực hiện thao tác này." },
        { status: 401 }
      );
    }

    const to = body.to?.trim();
    const from = body.from?.trim();
    const subject = body.subject?.trim();
    const html = body.html ?? "";
    const driveId = body.driveId?.trim();
    const attachmentName = body.attachmentName?.trim();

    const attachmentUrl =
      body.attachmentUrl ??
      (driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : "");

    if (!to || !from || !subject || !html) {
      debugLog("Invalid payload", { to, from, subject });
      return Response.json(
        { ok: false, error: "Invalid payload" },
        { status: 400 }
      );
    }

    const attachments:
      Array<{ filename: string; content: Buffer | string; contentType?: string; encoding?: BufferEncoding }>
      = [];

    if (attachmentUrl) {
      debugLog("Fetching attachment", { url: attachmentUrl });
      const fileResponse = await fetch(attachmentUrl);
      if (!fileResponse.ok) {
        const errorText = await fileResponse.text();
        debugLog("Attachment download failed", {
          status: fileResponse.status,
          errorText,
        });
        return Response.json(
          { ok: false, error: "Attachment download failed" },
          { status: 400 }
        );
      }

      const arrayBuffer = await fileResponse.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_ATTACHMENT_BYTES) {
        debugLog("Attachment too large", {
          size: arrayBuffer.byteLength,
        });
        return Response.json(
          { ok: false, error: "Attachment too large" },
          { status: 400 }
        );
      }

      attachments.push({
        filename: attachmentName || getFileNameFromUrl(attachmentUrl),
        content: Buffer.from(arrayBuffer),
        contentType: fileResponse.headers.get("content-type") ?? undefined,
      });
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
        { ok: false, error: `Gmail API error: ${errorText}` },
        { status: gmailResponse.status }
      );
    }

    const gmailData = (await gmailResponse.json()) as { id: string };
    debugLog("Gmail API ok", { messageId: gmailData.id });
    return Response.json({ ok: true, data: { messageId: gmailData.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    debugLog("Unhandled error", { message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
