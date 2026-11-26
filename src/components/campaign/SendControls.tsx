"use client";

import { useState } from "react";
import { checkComposeBeforeSend } from "../../lib/email/template";
import type { RecipientRow } from "../../hooks/useTemplates";
import { useDialogFocus } from "../admin/recruitment/useDialogFocus";

// Gmail cho tài khoản thường gửi khoảng 500 thư/ngày (Google Workspace nhiều hơn một chút). Nhắc khi gần mức này.
const GMAIL_DAILY_WARNING = 400;

export type SendControlsProps = {
  rows: RecipientRow[];
  subject: string;
  html: string;
  canSendBulk: boolean;
  progress: number;
  sending: boolean;
  errorMessage?: string | null;
  onSendBulk: (targets: RecipientRow[]) => void;
  onSendSelf: () => void;
};

export function SendControls({
  rows,
  subject,
  html,
  canSendBulk,
  progress,
  sending,
  errorMessage,
  onSendBulk,
  onSendSelf,
}: SendControlsProps) {
  const [confirming, setConfirming] = useState(false);
  const [includeSent, setIncludeSent] = useState(false);
  const closeConfirm = () => setConfirming(false);
  const dialogRef = useDialogFocus<HTMLDivElement>(confirming, closeConfirm);

  const sentCount = rows.filter((row) => row.__status === "sent").length;
  const unsent = rows.filter((row) => row.__status !== "sent");
  const failedCount = rows.filter((row) => row.__status === "failed").length;
  const targets = includeSent ? rows : unsent;
  const composeError = checkComposeBeforeSend(subject, html);

  function openConfirm() {
    setIncludeSent(false);
    setConfirming(true);
  }

  function confirmSend() {
    setConfirming(false);
    onSendBulk(targets);
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Gửi email
        </h3>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200"
          onClick={onSendSelf}
          disabled={sending || Boolean(composeError)}
        >
          Gửi thử cho bản thân
        </button>
        <button
          type="button"
          className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={openConfirm}
          disabled={sending || !canSendBulk || Boolean(composeError)}
        >
          {sending ? "Đang gửi..." : "Gửi hàng loạt"}
        </button>
        {composeError ? (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
            {composeError} Hãy điền đủ để có thể gửi.
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {errorMessage}
        </p>
      ) : null}
      <div className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center justify-between">
          <span>Tiến độ</span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeConfirm(); }}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-confirm-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 text-zinc-900 shadow-2xl outline-none dark:bg-zinc-950 dark:text-zinc-100"
          >
            <h2 id="send-confirm-title" className="text-base font-semibold">
              Gửi cho {targets.length} người?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Danh sách có {rows.length} dòng: {sentCount} đã gửi trước đó, {failedCount} gửi lỗi, {rows.length - sentCount - failedCount} chưa gửi.
            </p>
            {sentCount > 0 && (
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={includeSent}
                  onChange={(event) => setIncludeSent(event.target.checked)}
                />
                <span>
                  Gửi lại cả {sentCount} người đã nhận thư
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">Mặc định chỉ gửi dòng chưa gửi hoặc gửi lỗi.</span>
                </span>
              </label>
            )}
            {targets.length >= GMAIL_DAILY_WARNING && (
              <p role="note" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                Gmail chỉ cho gửi khoảng 500 thư mỗi ngày. Với {targets.length} người, một phần có thể bị từ chối. Hãy chia thành nhiều ngày nếu cần.
              </p>
            )}
            {!targets.length && (
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Không còn ai chưa gửi. Tick ô trên nếu muốn gửi lại.</p>
            )}
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Thư gửi lần lượt từng người, không thể thu hồi sau khi gửi.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={closeConfirm}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={!targets.length}
                onClick={confirmSend}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Gửi {targets.length} thư
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
