"use client";

import type { RecipientRow } from "../data/RecipientsTable";
import type { EmailImageAsset } from "../../lib/email/template";
import { Panel } from "../admin/ui/Panel";

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

/** Bước 3: xem trước thư đã điền biến cho người nhận đang chọn. */
export function PreviewPanel({
  html,
  subject,
  recipient,
  importedImage,
}: PreviewPanelProps) {
  return (
    <Panel
      title="3. Xem trước"
      actions={<span className="min-w-0 break-all text-xs text-zinc-500">{recipient?.email ? `Người nhận: ${recipient.email}` : "Chọn dòng dữ liệu để preview."}</span>}
    >
      <div className="space-y-3">
        <p className="break-words text-sm"><span className="text-zinc-500">Tiêu đề: </span><span className="font-semibold text-zinc-900">{subject || "(Chưa có tiêu đề)"}</span></p>
        {importedImage ? (
          <p className="break-words text-xs text-zinc-600">
            Ảnh sẽ được đính kèm trong email: <span className="font-semibold text-zinc-800">{importedImage.name}</span>
            {importedImage.isSvg ? " (SVG)" : null}
          </p>
        ) : null}
        {/* sandbox="" = không chạy script, không gửi form; CSP chặn mọi thứ ngoài ảnh và style. */}
        <iframe
          title="Xem trước nội dung thư"
          sandbox=""
          srcDoc={buildPreviewDocument(html)}
          className="h-80 w-full rounded-lg border border-zinc-200 bg-white sm:h-96"
        />
      </div>
    </Panel>
  );
}
