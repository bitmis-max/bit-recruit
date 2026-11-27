"use client";

import { useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { parseFile, type ParsedData } from "../../lib/files/parse";
import type { EmailImageAsset } from "../../lib/email/template";
import { friendlyError } from "../../lib/ui/friendly-error";
import { Button } from "../admin/ui/Button";
import { Notice } from "../admin/ui/Notice";
import { ApplicationImport } from "./ApplicationImport";

export type ImportPanelProps = {
  onDataParsed: (data: ParsedData, file?: File) => void;
  /** CLB đang chọn (để import đơn ứng tuyển). */
  clubId: string;
  externalError?: string | null;
};

async function readImageFile(file: File): Promise<EmailImageAsset> {
  const isSvg =
    file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");

  if (isSvg) {
    const svgText = await file.text();
    return {
      name: file.name,
      mimeType: file.type || "image/svg+xml",
      source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`,
      svgText,
      isSvg: true,
    };
  }

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Không thể đọc file ảnh."));
    reader.readAsDataURL(file);
  });

  return {
    name: file.name,
    mimeType: file.type,
    source,
    isSvg: false,
  };
}

/** Nội dung bước 1 (nhập người nhận). Panel và bảng người nhận do MailMergeApp bọc. */
export function ImportPanel({ onDataParsed, clubId, externalError }: ImportPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showApplications, setShowApplications] = useState(false);
  const dataInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      setError(null);
      setWarning(null);
      setFileName(file.name);
      try {
        const parsed = await parseFile(file);
        setWarning(parsed.warnings?.join(" ") ?? null);
        onDataParsed(parsed, file);
      } catch (err) {
        setError(friendlyError(err, "Không đọc được file. Hãy kiểm tra định dạng CSV hoặc Excel."));
      }
    },
    [onDataParsed]
  );

  const handleDownloadTemplate = () => {
    const headers = [
      "email",
      "attachment_url",
      "drive_id",
      "attachment_name",
      "name",
      "company",
    ];

    const explanations = [
      "Địa chỉ email nhận (Bắt buộc - Hệ thống xử lý tự động)",
      "URL file đính kèm công khai (Tùy chọn - Hệ thống xử lý tự động)",
      "ID file Google Drive để đính kèm (Tùy chọn - Hệ thống xử lý tự động)",
      "Tên hiển thị file đính kèm, vd: HopDong.pdf (Tùy chọn - Hệ thống xử lý tự động)",
      "Cột tự thêm tùy chỉnh - Dùng làm biến {{name}} trong thư",
      "Cột tự thêm tùy chỉnh - Dùng làm biến {{company}} trong thư",
    ];

    const data = [headers, explanations];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Huong dan");
    XLSX.writeFile(wb, "bit_mail_template.xlsx");
  };

  const shownError = externalError ?? error;

  return (
    <div className="p-4 sm:p-5">
      {shownError ? <Notice tone="error">{shownError}</Notice> : warning ? <Notice tone="warning">{warning}</Notice> : null}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-4 transition-colors ${
          isDragging ? "border-emerald-500 bg-emerald-50" : "border-zinc-300"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-zinc-800">
            {fileName ? `Đã chọn: ${fileName}` : "Kéo thả file CSV hoặc XLSX vào đây"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">Tự động đọc tiêu đề cột. Cần có cột email.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            accept=".csv,.xlsx,.xls"
            ref={dataInputRef}
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <Button variant="secondary" icon="upload" onClick={() => dataInputRef.current?.click()}>Chọn file</Button>
          <Button variant="secondary" icon="users" aria-expanded={showApplications} onClick={() => setShowApplications((open) => !open)}>
            Import đơn ứng tuyển
          </Button>
          <Button variant="ghost" icon="arrow-down" onClick={handleDownloadTemplate}>Mẫu Excel</Button>
        </div>
      </div>
      {showApplications ? (
        <ApplicationImport
          clubId={clubId}
          onImport={(data) => { setError(null); setWarning(null); setFileName(null); onDataParsed(data); }}
          onClose={() => setShowApplications(false)}
        />
      ) : null}
    </div>
  );
}

/** Ảnh đính kèm (không bắt buộc) cho bước soạn thư. */
export function ImageImport({ onImageParsed }: { onImageParsed: (image: EmailImageAsset) => void }) {
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      setImageError(null);
      setImageName(file.name);
      try {
        const image = await readImageFile(file);
        onImageParsed(image);
      } catch (err) {
        setImageError(friendlyError(err, "Không đọc được file ảnh."));
      }
    },
    [onImageParsed]
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <input
          ref={imageInputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          accept="image/*,.svg"
          onChange={(event) => void handleImageFiles(event.target.files)}
        />
        <Button variant="secondary" size="sm" icon="upload" onClick={() => imageInputRef.current?.click()}>Chọn ảnh đính kèm</Button>
        <span className="min-w-0 break-words text-xs text-zinc-500">
          {imageName ? `Đã chọn: ${imageName}` : "Chưa có ảnh nào được chọn."} Hỗ trợ PNG, JPG, WebP, SVG. SVG có thể dùng biến {"{"}var{"}"}.
        </span>
      </div>
      {imageError ? <Notice tone="error" className="mt-3 mb-0!">{imageError}</Notice> : null}
    </div>
  );
}
