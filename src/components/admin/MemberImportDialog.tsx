"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";
import { friendlyError } from "../../lib/ui/friendly-error";
import { notifyMembersChanged } from "./adminClient";
import { useDialog } from "./useDialog";
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
  const openButton = useRef<HTMLButtonElement>(null);
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
    openButton.current?.focus();
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
    openButton.current?.focus();
    notifyMembersChanged();
    await onImported(memberImportMessage((result ?? {}) as MemberImportResult));
  }

  return <>
    <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" aria-label="Chọn file Excel hoặc CSV để import thành viên" tabIndex={-1} className="hidden" onChange={(event) => void chooseFile(event)} />
    <button ref={openButton} type="button" disabled={disabled || reading || !supabase || !clubId} onClick={() => fileInput.current?.click()} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{reading ? "Đang đọc file…" : "Import Excel"}</button>
    {data && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="member-import-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl outline-none">
        <header className="flex items-start justify-between gap-4 border-b bg-zinc-50 px-5 py-4">
          <div>
            <h2 id="member-import-title" className="font-semibold">Import thành viên từ file</h2>
            <p className="mt-1 text-sm text-zinc-600">{data.rows.length} dòng, {data.headers.length} cột</p>
          </div>
          <button type="button" onClick={close} disabled={running} aria-label="Đóng cửa sổ" className="rounded-md px-2 py-1 text-xl leading-none text-zinc-500 hover:bg-zinc-200 disabled:opacity-50">×</button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {data.sheetCount > 1 && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Chỉ đọc sheet &ldquo;{data.sheetName}&rdquo;. {data.sheetCount - 1} sheet còn lại bị bỏ qua.</p>}
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600">
            <li>Vai trò và quyền không lấy từ file; cấp ở mục Nhiệm kỳ. Người thuộc Ban chủ nhiệm/Ban chủ chốt chỉ được cập nhật khi Chủ nhiệm import.</li>
            <li>Trùng Mã sinh viên (hoặc email nếu không có Mã sinh viên) với người đã có trong CLB thì cập nhật người đó. Ô trống trong file không xóa dữ liệu cũ.</li>
            <li>Tên ban phải đúng như trên web, ban chưa có thì tạo trước ở mục Quản lí ban.</li>
            <li>Số dòng được tính không kể dòng tiêu đề, tối đa 1000 dòng. Lỗi ở một dòng thì cả file không được ghi.</li>
          </ul>
          <div>
            <p className="text-sm font-semibold text-zinc-700">Ánh xạ cột dữ liệu</p>
            <div className="mt-2 grid grid-cols-2 gap-3 text-xs font-bold uppercase text-zinc-500"><span>Cột trong file</span><span>Ghép với</span></div>
            {data.headers.map((header) => <div key={header} className="mt-3 grid grid-cols-2 items-center gap-3 border-t pt-3">
              <span className="break-words text-sm" title={header}>{header}</span>
              <select aria-label={`Ghép cột ${header}`} disabled={running} value={mapping[header] ?? ""} onChange={(event) => setMapping({ ...mapping, [header]: event.target.value })} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
                <option value="">Bỏ qua</option>
                {memberMappingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>)}
          </div>
          {previewFields.length > 0 && <div>
            <p className="text-sm font-semibold text-zinc-700">Xem trước {previewRows.length} dòng đầu</p>
            <div className="mt-2 overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Xem trước dữ liệu sẽ import</caption>
                <thead className="bg-zinc-50 text-zinc-500"><tr>{previewFields.map((field) => <th key={field.value} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{field.label}</th>)}</tr></thead>
                <tbody className="divide-y divide-zinc-100">{previewRows.map((row, index) => <tr key={index}>{previewFields.map((field) => <td key={field.value} className="max-w-48 truncate px-3 py-2" title={row[field.value] ?? undefined}>{row[field.value] ?? <span className="text-zinc-400">—</span>}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>}
          {payload.error && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{payload.error}</p>}
          {importError && <p role="alert" className="whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{importError}</p>}
        </div>
        <footer className="flex justify-end gap-3 border-t px-5 py-4">
          <button type="button" onClick={close} disabled={running} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">Hủy</button>
          <button type="button" disabled={running || !payload.value} onClick={() => void runImport()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{running ? "Đang import…" : "Xác nhận import"}</button>
        </footer>
      </section>
    </div>}
  </>;
}
