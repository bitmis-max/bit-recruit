"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { friendlyError } from "../../../lib/ui/friendly-error";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { useDialogFocus } from "./useDialogFocus";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { buildImportPayload, importResultMessage, mappingOptions, readApplicantFile, type ImportData, type ImportPayload, type ImportResult } from "./applicantImport";

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
  }, [running]);

  const dialogRef = useDialogFocus<HTMLElement>(!!data, close);

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
      onError(friendlyError(e, "Không đọc được file."));
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
    if (error) { setImportError(friendlyError(error, "Không import được. Hãy kiểm tra file rồi thử lại.")); return; }
    setData(null); setFormMeta({ name: "", description: "" });
    await onImported(importResultMessage((result ?? {}) as ImportResult));
  }

  const customCount = data ? data.headers.filter((header) => mapping[header] === "custom").length : 0;

  return <>
    <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" aria-label="Chọn file Excel hoặc CSV để import" tabIndex={-1} className="hidden" onChange={(event) => void chooseFile(event)} />
    <Button variant="secondary" icon="upload" disabled={disabled || reading || !supabase || !campaignId} title={campaignId ? undefined : "Chọn đợt tuyển trước khi import"} onClick={() => fileInput.current?.click()}>{reading ? "Đang đọc file…" : "Import Excel"}</Button>
    {data && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="applicant-import-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl outline-none">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="applicant-import-title" className="text-base font-semibold text-zinc-900">Ghép cột dữ liệu từ file</h2>
            <p className="mt-0.5 text-sm text-zinc-600">{data.rows.length} dòng, {data.headers.length} cột · Đợt tuyển: {campaignName}</p>
          </div>
          <Button variant="ghost" size="sm" icon="close" onClick={close} disabled={running} aria-label="Đóng cửa sổ" />
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tên biểu mẫu (không bắt buộc)"><input autoFocus type="text" className={inputClass} value={formMeta.name} onChange={(event) => setFormMeta({ ...formMeta, name: event.target.value })} placeholder="Ví dụ: Đơn nhập từ Excel Gen 17" /></Field>
            <Field label="Mô tả biểu mẫu (không bắt buộc)"><input type="text" className={inputClass} value={formMeta.description} onChange={(event) => setFormMeta({ ...formMeta, description: event.target.value })} placeholder="Mô tả ngắn gọn" /></Field>
          </div>
          {data.sheetCount > 1 && <Notice tone="warning" className="mb-0!">Chỉ đọc sheet &ldquo;{data.sheetName}&rdquo;. {data.sheetCount - 1} sheet còn lại bị bỏ qua.</Notice>}
          <div className="space-y-1 text-sm text-zinc-600">
            <p>Biểu mẫu chỉ được tạo cho vị trí chưa có biểu mẫu. Vị trí, ca phỏng vấn chưa tồn tại sẽ được tạo mới. Số dòng được tính không kể dòng tiêu đề.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Ca phỏng vấn tạo mới có giờ tạm thời; hãy sửa giờ ở màn hình Phỏng vấn.</li>
              <li>Đơn trùng email trong cùng vị trí sẽ bị bỏ qua. Dòng không có email thì không được lọc trùng.</li>
              <li>Khi đợt tuyển đang mở, không thể thêm câu hỏi mới vào biểu mẫu đã có của vị trí. Hãy đóng đợt tuyển hoặc bỏ các cột câu hỏi riêng chưa có trong biểu mẫu.</li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Ánh xạ cột dữ liệu</h3>
            <div className="mt-2 grid grid-cols-2 gap-3 text-xs font-medium text-zinc-500"><span>Cột trong file</span><span>Ghép với</span></div>
            {data.headers.map((header) => <div key={header} className="mt-2 grid grid-cols-2 items-center gap-3 border-t border-zinc-100 pt-2">
              <span className="break-words text-sm" title={header}>{header}</span>
              <select aria-label={`Ghép cột ${header}`} value={mapping[header] ?? ""} onChange={(event) => setMapping({ ...mapping, [header]: event.target.value })} className={inputClass}>
                <option value="">Bỏ qua</option>
                {mappingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>)}
          </div>
          {payload.error ? <Notice tone="warning" className="mb-0!">{payload.error}</Notice> : customCount > 0 && <p className="text-sm text-zinc-600">{customCount} cột sẽ trở thành câu hỏi riêng.</p>}
          {importError && <Notice tone="error" className="mb-0!">{importError}</Notice>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-4">
          <Button onClick={close} disabled={running}>Hủy</Button>
          <Button variant="primary" disabled={!payload.value} loading={running} onClick={() => void runImport()}>{running ? "Đang import…" : "Xác nhận import"}</Button>
        </footer>
      </section>
    </div>}
  </>;
}
