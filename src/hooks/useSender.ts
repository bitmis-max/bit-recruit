import { useState, useCallback, useMemo } from "react";
import { type Session } from "@supabase/supabase-js";
import { type RecipientRow } from "./useTemplates";
import { sendEmail } from "../lib/email/sender";
import { friendlyError } from "../lib/ui/friendly-error";
import { isValidEmail, MAX_IMAGE_CONTENT_LENGTH } from "../lib/email/validators";
import {
  buildImageAttachment,
  checkComposeBeforeSend,
  interpolateTemplate,
  type EmailImageAsset,
} from "../lib/email/template";

const MAX_RETRY = 2;
const RATE_LIMIT_MS = 600;
const MAX_CONSECUTIVE_FAILURES = 5;

/** Tên hiển thị của người gửi (nếu tài khoản Google có). Máy chủ chỉ dùng tên, địa chỉ luôn là Gmail của người gửi. */
function senderFrom(session: Session | null) {
  const email = session?.user?.email;
  const meta = session?.user?.user_metadata as { full_name?: unknown; name?: unknown } | undefined;
  const raw = typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : "";
  const name = raw.replace(/[\s<>"\\]+/g, " ").trim();
  return email && name ? `${name} <${email}>` : undefined;
}

export function useSender({
  session,
  supabaseConfigured,
  clubId,
  rows,
  setRows,
  subject,
  html,
  importedImage,
  variableValues,
}: {
  session: Session | null;
  supabaseConfigured: boolean;
  clubId: string;
  rows: RecipientRow[];
  setRows: (rows: RecipientRow[]) => void;
  subject: string;
  html: string;
  importedImage: EmailImageAsset | null;
  variableValues: Record<string, string>;
}) {
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sendingError, setSendingError] = useState<string | null>(null);

  const canSendBulk = useMemo(
    () => Boolean(rows.length) && (!supabaseConfigured || Boolean(session)),
    [rows.length, supabaseConfigured, session]
  );

  /** Lỗi chặn gửi (thiếu CLB, tiêu đề/nội dung rỗng, ảnh quá lớn), hoặc null nếu gửi được. */
  const precheck = useCallback(() => {
    if (!clubId) return "Chưa chọn CLB để gửi. Hãy quay lại trang quản trị và chọn CLB.";
    const composeError = checkComposeBeforeSend(subject, html);
    if (composeError) return composeError;
    if (importedImage && buildImageAttachment(importedImage).content.length > MAX_IMAGE_CONTENT_LENGTH) {
      return "Ảnh đính kèm quá lớn (tối đa 7 MB). Hãy chọn ảnh nhỏ hơn.";
    }
    return null;
  }, [clubId, subject, html, importedImage]);

  /** Ghép nội dung thư cho một người nhận (hoặc cho thư thử khi không có dòng nào). */
  const buildMessage = useCallback((cleanRecipient: Record<string, string>) => {
    const overrides = Object.fromEntries(Object.entries(variableValues).filter(([, value]) => value !== ""));
    const templateValues = { ...cleanRecipient, ...overrides };
    const attachmentUrl = cleanRecipient.attachment_url ?? cleanRecipient.file_url ?? cleanRecipient.document_url ?? "";
    const attachmentName = cleanRecipient.attachment_name ?? cleanRecipient.file_name ?? cleanRecipient.filename ?? "";
    return {
      subject: interpolateTemplate(subject, templateValues),
      html: interpolateTemplate(html, templateValues),
      attachmentUrl: attachmentUrl || undefined,
      driveId: cleanRecipient.drive_id || undefined,
      attachmentName: attachmentName || undefined,
      imageAttachment: importedImage ? buildImageAttachment(importedImage, cleanRecipient) : undefined,
      variables: templateValues,
    };
  }, [html, importedImage, subject, variableValues]);

  const handleSend = useCallback(
    async (targets: RecipientRow[]) => {
      if (!targets.length) return;
      if (supabaseConfigured && !session) {
        setSendingError("Vui lòng đăng nhập Google trước khi gửi.");
        return;
      }
      const blocked = precheck();
      if (blocked) {
        setSendingError(blocked);
        return;
      }
      setSending(true);
      setProgress(0);
      setSendingError(null);

      let completed = 0;
      let consecutiveFailures = 0;
      let lastMessage = "";
      const updatedRows = [...rows];

      for (const recipient of targets) {
        const index = updatedRows.findIndex((row) => row.__id === recipient.__id);
        if (index === -1) continue;

        const cleanRecipient = Object.fromEntries(
          Object.entries(recipient).filter(([key]) => !key.startsWith("__"))
        ) as Record<string, string>;

        const emailValue = cleanRecipient.email ?? "";
        if (!isValidEmail(emailValue)) {
          updatedRows[index] = { ...updatedRows[index], __status: "failed" };
          completed += 1;
          setProgress(completed / targets.length);
          setRows([...updatedRows]);
          continue;
        }

        let success = false;
        for (let attempt = 0; attempt <= MAX_RETRY; attempt += 1) {
          try {
            await sendEmail({
              to: emailValue.trim(),
              from: senderFrom(session),
              clubId,
              ...buildMessage(cleanRecipient),
            });
            success = true;
            break;
          } catch (error) {
            const message = friendlyError(error, "Gửi mail không thành công.");
            lastMessage = message;
            setSendingError(message);
            console.error("Send attempt failed", { attempt, message });
            await new Promise((resolve) =>
              setTimeout(resolve, 400 * (attempt + 1))
            );
          }
        }

        updatedRows[index] = {
          ...updatedRows[index],
          __status: success ? "sent" : "failed",
        };
        completed += 1;
        setProgress(completed / targets.length);
        setRows([...updatedRows]);

        // Lỗi lặp lại (chưa kết nối Gmail, hết hạn mức ngày...) thì dừng, không thử tiếp từng người.
        consecutiveFailures = success ? 0 : consecutiveFailures + 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          setSendingError(`${lastMessage} Đã dừng gửi sau ${MAX_CONSECUTIVE_FAILURES} thư thất bại liên tiếp.`);
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
      }

      setSending(false);
    },
    [buildMessage, clubId, precheck, rows, session, supabaseConfigured, setRows]
  );

  const handleSendSelf = useCallback(async (selectedRecipient: RecipientRow | null) => {
    const targetEmail = session?.user?.email;
    if (!targetEmail) {
      setSendingError("Không tìm thấy email của bạn. Vui lòng đăng nhập lại.");
      return;
    }
    const blocked = precheck();
    if (blocked) {
      setSendingError(blocked);
      return;
    }

    setSending(true);
    setSendingError(null);

    const cleanRecipient = selectedRecipient
      ? (Object.fromEntries(
          Object.entries(selectedRecipient).filter(([key]) => !key.startsWith("__"))
        ) as Record<string, string>)
      : {};
    const message = buildMessage(cleanRecipient);

    try {
      await sendEmail({
        to: targetEmail,
        from: senderFrom(session),
        clubId,
        ...message,
        subject: "[TEST] " + message.subject,
      });
      alert("Đã gửi email test thành công đến: " + targetEmail);
    } catch (error) {
      setSendingError(friendlyError(error, "Gửi email test thất bại."));
    } finally {
      setSending(false);
    }
  }, [buildMessage, clubId, precheck, session]);

  return {
    sending,
    progress,
    sendingError,
    setSendingError,
    canSendBulk,
    handleSend,
    precheck,
    handleSendSelf,
  };
}
