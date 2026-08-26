"use client";

import { useCallback, useState } from "react";
import * as XLSX from "xlsx";
import { parseFile, type ParsedData } from "../../lib/files/parse";

export type ImportPanelProps = {
  onDataParsed: (data: ParsedData, file: File) => void;
  externalError?: string | null;
};

export function ImportPanel({ onDataParsed, externalError }: ImportPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      setError(null);
      setFileName(file.name);
      try {
        const parsed = await parseFile(file);
        onDataParsed(parsed, file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Parse error");
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

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
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
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <span className="font-medium">
          {fileName ? `Đã chọn: ${fileName}` : "Kéo thả file vào đây"}
        </span>
        <span className="text-xs">Hoặc click để chọn file</span>
      </label>
      {error || externalError ? (
        <p className="text-xs text-rose-500">{externalError ?? error}</p>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Tự động đọc tiêu đề cột.
        </p>
      )}
    </section>
  );
}
