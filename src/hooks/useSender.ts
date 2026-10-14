import { useState, useCallback, useMemo } from "react";
import { type Session } from "@supabase/supabase-js";
import { type RecipientRow } from "./useTemplates";
import { sendEmail } from "../lib/email/sender";
import { isValidEmail } from "../lib/email/validators";
import {
  buildImageAttachment,
  interpolateTemplate,
  type EmailImageAsset,
} from "../lib/email/template";

const MAX_RETRY = 2;
const RATE_LIMIT_MS = 600;

export function useSender({
  session,
  supabaseConfigured,
  rows,
  setRows,
  subject,
  html,
  importedImage,
}: {
  session: Session | null;
  supabaseConfigured: boolean;
  rows: RecipientRow[];
  setRows: (rows: RecipientRow[]) => void;
  subject: string;
  html: string;
  importedImage: EmailImageAsset | null;
}) {
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sendingError, setSendingError] = useState<string | null>(null);

  const canSendBulk = useMemo(
    () => Boolean(rows.length) && (!supabaseConfigured || Boolean(session)),
    [rows.length, supabaseConfigured, session]
  );

  const handleSend = useCallback(
    async (targets: RecipientRow[]) => {
      if (!targets.length) return;
      if (supabaseConfigured && !session) {
        setSendingError("Vui lòng đăng nhập Google trước khi gửi.");
        return;
      }
      setSending(true);
      setProgress(0);
      setSendingError(null);

      let completed = 0;
      const updatedRows = [...rows];

      for (const recipient of targets) {
        const index = updatedRows.findIndex((row) => row.__id === recipient.__id);
        if (index === -1) continue;

        const cleanRecipient = Object.fromEntries(
          Object.entries(recipient).filter(([key]) => !key.startsWith("__"))
        ) as Record<string, string>;

        const attachmentUrl =
          cleanRecipient.attachment_url ??
          cleanRecipient.file_url ??
          cleanRecipient.document_url ??
          "";
        const driveId = cleanRecipient.drive_id ?? "";
        const attachmentName =
          cleanRecipient.attachment_name ??
          cleanRecipient.file_name ??
          cleanRecipient.filename ??
          "";
        const imageAttachment = importedImage
          ? buildImageAttachment(importedImage, cleanRecipient)
          : undefined;

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
              to: emailValue,
              from: session?.user?.email ?? undefined,
              subject: interpolateTemplate(subject, cleanRecipient),
              html: interpolateTemplate(html, cleanRecipient),
              attachmentUrl: attachmentUrl || undefined,
              driveId: driveId || undefined,
              attachmentName: attachmentName || undefined,
              imageAttachment,
              variables: cleanRecipient,
              providerToken: session?.provider_token ?? undefined,
            });
            success = true;
            break;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Send failed";
            setSendingError(message);
            console.error("Send attempt failed", {
              to: emailValue,
              attempt,
              message,
            });
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

        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
      }

      setSending(false);
    },
    [html, importedImage, rows, subject, session, supabaseConfigured, setRows]
  );

  const handleSendBulk = useCallback(() => {
    void handleSend(rows);
  }, [handleSend, rows]);

  const handleSendSelf = useCallback(async (selectedRecipient: RecipientRow | null) => {
    const targetEmail = session?.user?.email;
    if (!targetEmail) {
      setSendingError("Không tìm thấy email của bạn. Vui lòng đăng nhập lại.");
      return;
    }

    setSending(true);
    setSendingError(null);

    const cleanRecipient = selectedRecipient
      ? (Object.fromEntries(
          Object.entries(selectedRecipient).filter(([key]) => !key.startsWith("__"))
        ) as Record<string, string>)
      : {};

    const attachmentUrl =
      cleanRecipient.attachment_url ??
      cleanRecipient.file_url ??
      cleanRecipient.document_url ??
      "";
    const driveId = cleanRecipient.drive_id ?? "";
    const attachmentName =
      cleanRecipient.attachment_name ??
      cleanRecipient.file_name ??
      cleanRecipient.filename ??
      "";
    const imageAttachment = importedImage
      ? buildImageAttachment(importedImage, cleanRecipient)
      : undefined;

    try {
      await sendEmail({
        to: targetEmail,
        from: session?.user?.email ?? undefined,
        subject: "[TEST] " + interpolateTemplate(subject, cleanRecipient),
        html: interpolateTemplate(html, cleanRecipient),
        attachmentUrl: attachmentUrl || undefined,
        driveId: driveId || undefined,
        attachmentName: attachmentName || undefined,
        imageAttachment,
        variables: cleanRecipient,
        providerToken: session?.provider_token ?? undefined,
      });
      alert("Đã gửi email test thành công đến: " + targetEmail);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gửi email test thất bại";
      setSendingError(message);
    } finally {
      setSending(false);
    }
  }, [html, importedImage, subject, session]);

  return {
    sending,
    progress,
    sendingError,
    setSendingError,
    canSendBulk,
    handleSend,
    handleSendBulk,
    handleSendSelf,
  };
}
