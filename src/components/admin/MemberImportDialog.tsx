"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";
import { friendlyError } from "../../lib/ui/friendly-error";
import { notifyMembersChanged } from "./adminClient";
import { useDialog } from "./useDialog";
import { Button } from "./ui/Button";
import { Notice } from "./ui/Notice";
import { inputClass } from "./ui/Field";
import { readApplicantFile, type ImportData } from "./recruitment/applicantImport";
import { buildMemberPayload, guessMemberMapping, mapMemberRows, memberImportMessage, memberMappingOptions, type MemberImportResult, type MemberPayloadRow } from "./memberImport";

type Props = {
  clubId: string;
  /** Tắt nút khi trang đang bận (đang tải, đang lưu...). */
  disabled?: boolean;
  onError: (message: string) => void;
  /** Gọi sau khi import xong; trang tải lại danh sách và hiện thông báo. */
  onImported: (message: string) => void | Promise<void>;
};

export function MemberImportDialog({ clubId, disabled = false, onError, onImported }: Props) {
  const supabase = getSupabaseClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const openWrap = useRef<HTMLSpanElement>(null);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [data, setData] = useState<ImportData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importError, setImportError] = useState("");

  const payload = useMemo((): { value?: MemberPayloadRow[]; error: string } => {
    if (!data) return { error: "" };
    try { return { value: buildMemberPayload(data, mapping), error: "" }; }
    catch (e) { return { error: e instanceof Error ? e.message : "Cách ghép cột chưa hợp lệ." }; }
  }, [data, mapping]);

  const previewFields = memberMappingOptions.filter((option) => data?.headers.some((header) => mapping[header] === option.value));
  const previewRows = useMemo(() => (data ? mapMemberRows(data, mapping).slice(0, 5) : []), [data, mapping]);

  const close = useCallback(() => {
    if (running) return;
    setData(null); setImportError("");
    openWrap.current?.querySelector("button")?.focus();
  }, [running]);

  const dialogRef = useDialog<HTMLElement>(close, !!data);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setReading(true);
    try {
      const parsed = await readApplicantFile(file);
      setMapping(guessMemberMapping(parsed.headers));
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
    const { data: result, error } = await supabase.rpc("import_members", { p_club_id: clubId, p_rows: payload.value });
    setRunning(false);
    if (error) { setImportError(friendlyError(error, "Không import được. Vui lòng kiểm tra file rồi thử lại.")); return; }
    setData(null);
    openWrap.current?.querySelector("button")?.focus();
    notifyMembersChanged();
    await onImported(memberImportMessage((result ?? {}) as MemberImportResult));
  }

  return <>
    <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" aria-label="Chọn file Excel hoặc CSV để import thành viên" tabIndex={-1} className="hidden" onChange={(event) => void chooseFile(event)} />
    <span ref={openWrap} className="contents"><Button icon="upload" loading={reading} disabled={disabled || !supabase || !clubId} onClick={() => fileInput.current?.click()}>{reading ? "Đang đọc file…" : "Import Excel"}</Button></span>
    {data && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="member-import-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl outline-none">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 id="member-import-title" className="text-base font-semibold">Import thành viên từ file</h2>
            <p className="mt-1 text-sm text-zinc-600">{data.rows.length} dòng, {data.headers.length} cột</p>
          </div>
          <Button variant="ghost" size="sm" icon="close" onClick={close} disabled={running} aria-label="Đóng cửa sổ" />
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {data.sheetCount > 1 && <Notice tone="warning" className="mb-0!">Chỉ đọc sheet &ldquo;{data.sheetName}&rdquo;. {data.sheetCount - 1} sheet còn lại bị bỏ qua.</Notice>}
          <details className="text-sm text-zinc-600">
            <summary className="cursor-pointer font-medium text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">Lưu ý trước khi import</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Vai trò và quyền không lấy từ file; cấp ở mục Nhiệm kỳ. Người thuộc Ban chủ nhiệm/Ban chủ chốt chỉ được cập nhật khi Chủ nhiệm import.</li>
              <li>Trùng Mã sinh viên (hoặc email nếu không có Mã sinh viên) với người đã có trong CLB thì cập nhật người đó. Ô trống trong file không xóa dữ liệu cũ.</li>
              <li>Tên ban phải đúng như trên web, ban chưa có thì tạo trước ở mục Quản lí ban.</li>
              <li>Số dòng được tính không kể dòng tiêu đề, tối đa 1000 dòng. Lỗi ở một dòng thì cả file không được ghi.</li>
            </ul>
          </details>
          <div>
            <p className="text-sm font-semibold text-zinc-800">Ánh xạ cột dữ liệu</p>
            <div className="mt-2 grid grid-cols-2 gap-3 text-xs font-medium text-zinc-500"><span>Cột trong file</span><span>Ghép với</span></div>
            {data.headers.map((header) => <div key={header} className="mt-2 grid grid-cols-2 items-center gap-3 border-t border-zinc-100 pt-2">
              <span className="break-words text-sm" title={header}>{header}</span>
              <select aria-label={`Ghép cột ${header}`} disabled={running} value={mapping[header] ?? ""} onChange={(event) => setMapping({ ...mapping, [header]: event.target.value })} className={inputClass}>
                <option value="">Bỏ qua</option>
                {memberMappingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>)}
          </div>
          {previewFields.length > 0 && <div>
            <p className="text-sm font-semibold text-zinc-800">Xem trước {previewRows.length} dòng đầu</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Xem trước dữ liệu sẽ import</caption>
                <thead className="border-b border-zinc-200 text-zinc-500"><tr>{previewFields.map((field) => <th key={field.value} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{field.label}</th>)}</tr></thead>
                <tbody className="divide-y divide-zinc-100">{previewRows.map((row, index) => <tr key={index}>{previewFields.map((field) => <td key={field.value} className="max-w-48 truncate px-3 py-2" title={row[field.value] ?? undefined}>{row[field.value] ?? <span className="text-zinc-400">—</span>}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>}
          {payload.error && <Notice tone="warning" className="mb-0!">{payload.error}</Notice>}
          {importError && <Notice tone="error" className="mb-0! whitespace-pre-line">{importError}</Notice>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-4">
          <Button onClick={close} disabled={running}>Hủy</Button>
          <Button variant="primary" loading={running} disabled={!payload.value} onClick={() => void runImport()}>{running ? "Đang import…" : "Xác nhận import"}</Button>
        </footer>
      </section>
    </div>}
  </>;
}
