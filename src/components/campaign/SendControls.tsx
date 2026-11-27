"use client";

import { useState } from "react";
import { checkComposeBeforeSend } from "../../lib/email/template";
import type { RecipientRow } from "../../hooks/useTemplates";
import { useDialogFocus } from "../admin/recruitment/useDialogFocus";
import { Button } from "../admin/ui/Button";
import { Notice } from "../admin/ui/Notice";
import { Panel } from "../admin/ui/Panel";

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

/** Bước 4: gửi thử cho bản thân, rồi gửi hàng loạt (hành động chính duy nhất của màn). */
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
  const percent = Math.round(progress * 100);

  function openConfirm() {
    setIncludeSent(false);
    setConfirming(true);
  }

  function confirmSend() {
    setConfirming(false);
    onSendBulk(targets);
  }

  return (
    <Panel title="4. Gửi">
      {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
      {composeError ? <Notice tone="warning">{composeError} Hãy điền đủ để có thể gửi.</Notice> : null}

      <p className="mb-4 text-sm text-zinc-600">
        {rows.length
          ? `${rows.length} người nhận${sentCount ? `, ${sentCount} đã gửi` : ""}${failedCount ? `, ${failedCount} gửi lỗi` : ""}.`
          : "Chưa có người nhận. Hãy nhập danh sách ở bước 1."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon="mail" onClick={onSendSelf} disabled={sending || Boolean(composeError)}>
          Gửi thử cho bản thân
        </Button>
        <Button variant="primary" icon="mail" onClick={openConfirm} loading={sending} disabled={!canSendBulk || Boolean(composeError)}>
          {sending ? "Đang gửi..." : "Gửi hàng loạt"}
        </Button>
      </div>

      {sending || progress > 0 ? (
        <div className="mt-5 flex flex-col gap-1 text-xs text-zinc-500">
          <div className="flex items-center justify-between">
            <span>Tiến độ</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div role="progressbar" aria-label="Tiến độ gửi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full bg-emerald-600 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : null}

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
            className="w-full max-w-md rounded-2xl bg-white p-5 text-zinc-900 shadow-2xl outline-none"
          >
            <h2 id="send-confirm-title" className="text-base font-semibold">
              Gửi cho {targets.length} người?
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Danh sách có {rows.length} dòng: {sentCount} đã gửi trước đó, {failedCount} gửi lỗi, {rows.length - sentCount - failedCount} chưa gửi.
            </p>
            {sentCount > 0 && (
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-emerald-700"
                  checked={includeSent}
                  onChange={(event) => setIncludeSent(event.target.checked)}
                />
                <span>
                  Gửi lại cả {sentCount} người đã nhận thư
                  <span className="block text-xs text-zinc-500">Mặc định chỉ gửi dòng chưa gửi hoặc gửi lỗi.</span>
                </span>
              </label>
            )}
            {targets.length >= GMAIL_DAILY_WARNING && (
              <Notice tone="warning" className="mt-3 mb-0!">
                Gmail chỉ cho gửi khoảng 500 thư mỗi ngày. Với {targets.length} người, một phần có thể bị từ chối. Hãy chia thành nhiều ngày nếu cần.
              </Notice>
            )}
            {!targets.length && (
              <p className="mt-3 text-xs text-zinc-500">Không còn ai chưa gửi. Tick ô trên nếu muốn gửi lại.</p>
            )}
            <p className="mt-3 text-xs text-zinc-500">Thư gửi lần lượt từng người, không thể thu hồi sau khi gửi.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" autoFocus onClick={closeConfirm}>Hủy</Button>
              <Button variant="primary" disabled={!targets.length} onClick={confirmSend}>Gửi {targets.length} thư</Button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
