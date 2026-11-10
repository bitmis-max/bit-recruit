"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { buildImportPayload, importResultMessage, mappingOptions, readApplicantFile, type ImportData, type ImportPayload, type ImportResult } from "./applicantImport";

const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";

type Props = {
  campaignId: string;
  campaignName: string;
  /** Tắt nút khi trang đang bận (đang tải, đang lưu...). */
  disabled?: boolean;
  onError: (message: string) => void;
  /** Gọi sau khi import xong; trang tải lại danh sách và hiện thông báo. */
  onImported: (message: string) => void | Promise<void>;
};

export function ApplicantImportDialog({ campaignId, campaignName, disabled = false, onError, onImported }: Props) {
  const supabase = getSupabaseClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [data, setData] = useState<ImportData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [formMeta, setFormMeta] = useState({ name: "", description: "" });
  const [importError, setImportError] = useState("");

  const payload = useMemo((): { value?: ImportPayload; error: string } => {
    if (!data) return { error: "" };
    try { return { value: buildImportPayload(data, mapping), error: "" }; }
    catch (e) { return { error: e instanceof Error ? e.message : "Cách ghép cột chưa hợp lệ." }; }
  }, [data, mapping]);

  const close = useCallback(() => {
    if (running) return;
    setData(null); setImportError("");
    openButton.current?.focus();
  }, [running]);

  useEffect(() => {
    if (!data) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [data, close]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setReading(true);
    try {
      const parsed = await readApplicantFile(file);
      setMapping(Object.fromEntries(parsed.headers.map((header) => [header, ""])));
      setImportError("");
      setData(parsed);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Không đọc được file.");
    } finally {
      setReading(false);
      input.value = "";
    }
  }

  async function runImport() {
    if (!supabase || !payload.value) return;
    setRunning(true); setImportError("");
    const { data: result, error } = await supabase.rpc("import_applications", {
      p_campaign_id: campaignId,
      p_form_name: formMeta.name.trim(),
      p_form_description: formMeta.description.trim(),
      p_questions: payload.value.questions,
      p_rows: payload.value.rows,
    });
    setRunning(false);
    if (error) { setImportError(error.message); return; }
    setData(null); setFormMeta({ name: "", description: "" });
    openButton.current?.focus();
    await onImported(importResultMessage((result ?? {}) as ImportResult));
  }

  const customCount = data ? data.headers.filter((header) => mapping[header] === "custom").length : 0;

  return <>
    <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" aria-label="Chọn file Excel hoặc CSV để import" tabIndex={-1} className="hidden" onChange={(event) => void chooseFile(event)} />
    <button ref={openButton} type="button" disabled={disabled || reading || !supabase || !campaignId} title={campaignId ? undefined : "Chọn đợt tuyển trước khi import"} onClick={() => fileInput.current?.click()} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{reading ? "Đang đọc file…" : "Import Excel"}</button>
    {data && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="applicant-import-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b bg-zinc-50 px-5 py-4">
          <div>
            <h2 id="applicant-import-title" className="font-semibold">Ghép cột dữ liệu từ file</h2>
            <p className="mt-1 text-sm text-zinc-600">{data.rows.length} dòng, {data.headers.length} cột · Đợt tuyển: {campaignName}</p>
          </div>
          <button type="button" onClick={close} disabled={running} aria-label="Đóng cửa sổ" className="rounded-md px-2 py-1 text-xl leading-none text-zinc-500 hover:bg-zinc-200 disabled:opacity-50">×</button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Tên biểu mẫu (không bắt buộc)<input autoFocus type="text" className={inputClass} value={formMeta.name} onChange={(event) => setFormMeta({ ...formMeta, name: event.target.value })} placeholder="Ví dụ: Đơn nhập từ Excel Gen 17" /></label>
            <label className="text-sm font-medium">Mô tả biểu mẫu (không bắt buộc)<input type="text" className={inputClass} value={formMeta.description} onChange={(event) => setFormMeta({ ...formMeta, description: event.target.value })} placeholder="Mô tả ngắn gọn" /></label>
          </div>
          <p className="text-sm text-zinc-600">Biểu mẫu chỉ được tạo cho vị trí chưa có biểu mẫu. Vị trí, ca phỏng vấn chưa tồn tại sẽ được tạo mới; đơn trùng email trong cùng vị trí sẽ bị bỏ qua. Số dòng được tính không kể dòng tiêu đề.</p>
          <div>
            <p className="text-sm font-semibold text-zinc-700">Ánh xạ cột dữ liệu</p>
            <div className="mt-2 grid grid-cols-2 gap-3 text-xs font-bold uppercase text-zinc-500"><span>Cột trong file</span><span>Ghép với</span></div>
            {data.headers.map((header) => <div key={header} className="mt-3 grid grid-cols-2 items-center gap-3 border-t pt-3">
              <span className="break-words text-sm" title={header}>{header}</span>
              <select aria-label={`Ghép cột ${header}`} value={mapping[header] ?? ""} onChange={(event) => setMapping({ ...mapping, [header]: event.target.value })} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
                <option value="">Bỏ qua</option>
                {mappingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>)}
          </div>
          {payload.error ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{payload.error}</p> : customCount > 0 && <p className="text-sm text-zinc-600">{customCount} cột sẽ trở thành câu hỏi riêng.</p>}
          {importError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{importError}</p>}
        </div>
        <footer className="flex justify-end gap-3 border-t px-5 py-4">
          <button type="button" onClick={close} disabled={running} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">Hủy</button>
          <button type="button" disabled={running || !payload.value} onClick={() => void runImport()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{running ? "Đang import…" : "Xác nhận import"}</button>
        </footer>
      </section>
    </div>}
  </>;
}
