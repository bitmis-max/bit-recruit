"use client";

import { useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { parseFile, type ParsedData } from "../../lib/files/parse";
import type { EmailImageAsset } from "../../lib/email/template";
import { friendlyError } from "../../lib/ui/friendly-error";
import { ApplicationImport } from "./ApplicationImport";

export type ImportPanelProps = {
  onDataParsed: (data: ParsedData, file?: File) => void;
  onImageParsed: (image: EmailImageAsset) => void;
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

export function ImportPanel({
  onDataParsed,
  onImageParsed,
  clubId,
  externalError,
}: ImportPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showApplications, setShowApplications] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
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

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Import hình ảnh
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Hỗ trợ PNG, JPG, WebP, SVG. SVG có thể dùng biến {"{"}var{"}"}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-zinc-100 hover:text-indigo-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-indigo-400 dark:hover:bg-zinc-800"
          >
            Chọn ảnh
          </button>
        </div>
        <input
          ref={imageInputRef}
          type="file"
          className="hidden"
          accept="image/*,.svg"
          onChange={(event) => void handleImageFiles(event.target.files)}
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {imageName ? `Đã chọn: ${imageName}` : "Chưa có ảnh nào được chọn."}
        </span>
        {imageError ? <p className="text-xs text-rose-500">{imageError}</p> : null}
      </div>

      <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Import dữ liệu
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Hỗ trợ CSV, XLSX. Kéo thả hoặc chọn file.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowApplications((open) => !open)}
          aria-expanded={showApplications}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60"
        >
          Import đơn ứng tuyển
        </button>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-zinc-100 hover:text-indigo-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-indigo-400 dark:hover:bg-zinc-800"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Mẫu Excel
        </button>
      </div>
      {showApplications ? (
        <ApplicationImport
          clubId={clubId}
          onImport={(data) => { setError(null); setWarning(null); setFileName(null); onDataParsed(data); }}
          onClose={() => setShowApplications(false)}
        />
      ) : null}
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center text-sm transition ${
          isDragging
            ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-500/10"
            : "border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400"
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
        <input
          type="file"
          className="hidden"
          accept=".csv,.xlsx,.xls"
          ref={dataInputRef}
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <span className="font-medium">
          {fileName ? `Đã chọn: ${fileName}` : "Kéo thả file vào đây"}
        </span>
        <span className="text-xs">Hoặc click để chọn file</span>
      </label>
      {error || externalError ? (
        <p role="alert" className="text-xs text-rose-500">{externalError ?? error}</p>
      ) : warning ? (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{warning}</p>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Tự động đọc tiêu đề cột.
        </p>
      )}
    </section>
  );
}
