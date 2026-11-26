"use client";

import type { RecipientRow } from "../data/RecipientsTable";
import type { EmailImageAsset } from "../../lib/email/template";

export type PreviewPanelProps = {
  html: string;
  subject: string;
  recipient?: RecipientRow | null;
  importedImage?: EmailImageAsset | null;
};

function buildPreviewDocument(html: string) {
  const body = html.trim() ? html : "<p>Chưa có nội dung.</p>";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'"><style>body{margin:0;padding:16px;font:14px/1.6 system-ui,sans-serif;color:#27272a;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${body}</body></html>`;
}

export function PreviewPanel({
  html,
  subject,
  recipient,
  importedImage,
}: PreviewPanelProps) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Preview theo người nhận
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {recipient?.email ? `Người nhận: ${recipient.email}` : "Chọn dòng dữ liệu để preview."}
        </p>
      </div>
      {importedImage ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
          Ảnh sẽ được đính kèm trong email: <span className="font-semibold text-zinc-800 dark:text-zinc-100">{importedImage.name}</span>
          {importedImage.isSvg ? <span className="ml-2 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200">SVG</span> : null}
        </div>
      ) : null}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-semibold text-zinc-800 dark:text-zinc-100">{subject || "(Chưa có tiêu đề)"}</p>
      </div>
      {/* sandbox="" = không chạy script, không gửi form; CSP chặn mọi thứ ngoài ảnh và style. */}
      <iframe
        title="Xem trước nội dung thư"
        sandbox=""
        srcDoc={buildPreviewDocument(html)}
        className="h-96 w-full rounded-xl border border-zinc-200 bg-white shadow-inner dark:border-zinc-800"
      />
    </section>
  );
}
