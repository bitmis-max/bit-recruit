import * as nodemailer from "nodemailer";

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
  providerToken?: string;
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

    let attachment:
      | { filename: string; content: Buffer; contentType?: string }
      | undefined;

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

      attachment = {
        filename: attachmentName || getFileNameFromUrl(attachmentUrl),
        content: Buffer.from(arrayBuffer),
        contentType: fileResponse.headers.get("content-type") ?? undefined,
      };
    }

    debugLog("Using Gmail OAuth2 SMTP for sender: " + from);
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        type: "OAuth2",
        user: from,
        accessToken: providerToken,
      },
    });

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      attachments: attachment ? [attachment] : [],
    });

    debugLog("SMTP ok", { messageId: info.messageId });
    return Response.json({ ok: true, data: { messageId: info.messageId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    debugLog("Unhandled error", { message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
