"use client";

import { useCallback, useState } from "react";
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

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Import dữ liệu
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Hỗ trợ CSV, XLSX. Kéo thả hoặc chọn file.
        </p>
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
