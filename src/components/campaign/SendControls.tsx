"use client";

import type { RecipientRow } from "../data/RecipientsTable";

export type SendControlsProps = {
  subject: string;
  onSubjectChange: (value: string) => void;
  senderEmail: string;
  onSenderEmailChange: (value: string) => void;
  testEmail: string;
  onTestEmailChange: (value: string) => void;
  selectedRecipient?: RecipientRow | null;
  canSendTest: boolean;
  canSendBulk: boolean;
  progress: number;
  sending: boolean;
  errorMessage?: string | null;
  onSendTest: () => void;
  onSendBulk: () => void;
  onSaveTemplate: () => void;
};

export function SendControls({
  subject,
  onSubjectChange,
  senderEmail,
  onSenderEmailChange,
  testEmail,
  onTestEmailChange,
  selectedRecipient,
  canSendTest,
  canSendBulk,
  progress,
  sending,
  errorMessage,
  onSendTest,
  onSendBulk,
  onSaveTemplate,
}: SendControlsProps) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Gửi email
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Thiết lập tiêu đề và gửi thử.
        </p>
      </div>
      <label className="flex flex-col gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
        Tiêu đề email
        <input
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          value={subject}
          onChange={(event) => onSubjectChange(event.target.value)}
          placeholder="Ví dụ: Thư mời tham dự sự kiện"
        />
      </label>
      <label className="flex flex-col gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
        Email người gửi
        <input
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          value={senderEmail}
          onChange={(event) => onSenderEmailChange(event.target.value)}
          placeholder="sender@company.com"
        />
      </label>
      <label className="flex flex-col gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
        Email gửi thử
        <input
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          value={testEmail}
          onChange={(event) => onTestEmailChange(event.target.value)}
          placeholder="test@company.com"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200"
          onClick={onSendTest}
          disabled={sending || !selectedRecipient || !canSendTest}
        >
          Gửi thử
        </button>
        <button
          type="button"
          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onSendBulk}
          disabled={sending || !canSendBulk}
        >
          Gửi hàng loạt
        </button>
      </div>
      <button
        type="button"
        onClick={onSaveTemplate}
        className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200"
      >
        Lưu template
      </button>
      {errorMessage ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
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
    </section>
  );
}
