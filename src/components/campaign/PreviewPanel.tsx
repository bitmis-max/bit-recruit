"use client";

import type { RecipientRow } from "../data/RecipientsTable";

export type PreviewPanelProps = {
  html: string;
  subject: string;
  recipient?: RecipientRow | null;
};

export function PreviewPanel({ html, subject, recipient }: PreviewPanelProps) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Preview theo người nhận
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {recipient?.email ? `Recipient: ${recipient.email}` : "Chọn dòng dữ liệu để preview."}
        </p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-semibold text-zinc-800 dark:text-zinc-100">{subject || "(Chưa có tiêu đề)"}</p>
      </div>
      <div
        className="preview-content rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800 shadow-inner dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        dangerouslySetInnerHTML={{ __html: html || "<p>Chưa có nội dung.</p>" }}
      />
    </section>
  );
}
