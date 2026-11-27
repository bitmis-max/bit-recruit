"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "../admin/ui/Button";
import { inputClass } from "../admin/ui/Field";

type VariableSidebarProps = {
  variables: string[];
  dataValues: Record<string, string>;
  values: Record<string, string>;
  onValuesChange: (values: Record<string, string>) => void;
  onInsert: (variable: string) => void;
};

const cellInputClass = `${inputClass} py-1! text-xs! read-only:cursor-default read-only:bg-zinc-50 read-only:text-zinc-500`;

/** Cột biến động trong bước soạn thư. Không có khung riêng: MailMergeApp đặt nó cạnh trình soạn bằng đường kẻ. */
export function VariableSidebar({ variables, dataValues, values, onValuesChange, onInsert }: VariableSidebarProps) {
  const [customVariables, setCustomVariables] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("mailmerge.sidebarVariables");
        if (stored) return JSON.parse(stored) as string[];
      } catch { /* Ignore invalid local storage data. */ }
    }
    return ["name", "email", "company", "phone", "code"];
  });
  const [newVarName, setNewVarName] = useState("");

  useEffect(() => {
    try { localStorage.setItem("mailmerge.sidebarVariables", JSON.stringify(customVariables)); } catch { /* không lưu được thì bỏ qua */ }
  }, [customVariables]);

  const variablesList = useMemo(() => Array.from(new Set([...customVariables, ...variables])), [customVariables, variables]);

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = newVarName.trim().replace(/[{}]/g, "");
    if (!clean) return;
    if (!customVariables.includes(clean)) setCustomVariables((current) => [...current, clean]);
    setNewVarName("");
  };

  const handleDelete = useCallback((variable: string) => {
    setCustomVariables((current) => current.filter((item) => item !== variable));
  }, []);

  return <aside aria-label="Biến động" className="flex flex-col gap-3">
    <div>
      <h3 className="text-sm font-semibold text-zinc-900">Biến động</h3>
      <p className="mt-0.5 text-xs text-zinc-500">Bấm tên biến để chèn vào thư. Nhập giá trị để thay biến trong tiêu đề và nội dung email.</p>
    </div>
    <form onSubmit={handleAdd} className="flex gap-2">
      <input type="text" value={newVarName} onChange={(event) => setNewVarName(event.target.value)} placeholder="Tên biến mới..." aria-label="Tên biến mới" className={`${inputClass} min-w-0 flex-1`} />
      <Button type="submit" variant="secondary" icon="plus">Thêm biến</Button>
    </form>
    <div className="max-h-72 overflow-auto border-t border-zinc-100">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="text-xs font-semibold text-zinc-600"><tr><th className="w-2/5 py-2 pr-2">Biến</th><th className="py-2">Giá trị</th><th className="w-9 py-2"><span className="sr-only">Xóa</span></th></tr></thead>
        <tbody className="divide-y divide-zinc-100">
          {variablesList.map((variable) => <tr key={variable}>
            <td className="truncate py-1.5 pr-2"><button type="button" onClick={() => onInsert(variable)} title="Chèn biến vào email" className="rounded font-mono text-xs text-emerald-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">{`{{${variable}}}`}</button></td>
            <td className="py-1.5"><input type="text" aria-label={`Giá trị cho ${variable}`} value={variables.includes(variable) ? dataValues[variable] ?? dataValues[variable.toLowerCase()] ?? "" : values[variable] ?? ""} readOnly={variables.includes(variable)} onChange={(event) => onValuesChange({ ...values, [variable]: event.target.value })} placeholder={variables.includes(variable) ? "Lấy từ dữ liệu" : "Nhập giá trị"} className={cellInputClass} /></td>
            <td className="py-1.5 pl-1">{customVariables.includes(variable) && <Button variant="ghost" size="sm" icon="close" onClick={() => handleDelete(variable)} aria-label={`Xóa biến ${variable}`} />}</td>
          </tr>)}
          {!variablesList.length && <tr><td colSpan={3} className="py-4 text-center text-xs text-zinc-500">Chưa có biến nào.</td></tr>}
        </tbody>
      </table>
    </div>
  </aside>;
}
