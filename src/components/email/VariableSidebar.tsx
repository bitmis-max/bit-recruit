"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

type VariableSidebarProps = {
  variables: string[];
  dataValues: Record<string, string>;
  values: Record<string, string>;
  onValuesChange: (values: Record<string, string>) => void;
  onInsert: (variable: string) => void;
};

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
    localStorage.setItem("mailmerge.sidebarVariables", JSON.stringify(customVariables));
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

  return <aside className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
    <div>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Biến động</h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Nhập giá trị để thay thế biến tương ứng trong tiêu đề và nội dung email.</p>
    </div>
    <form onSubmit={handleAdd} className="flex gap-2">
      <input type="text" value={newVarName} onChange={(event) => setNewVarName(event.target.value)} placeholder="Tên biến mới..." className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-1.5 text-xs text-zinc-800 outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200" />
      <button type="submit" className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Thêm biến</button>
    </form>
    <div className="max-h-72 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"><tr><th className="w-2/5 px-3 py-2">Biến</th><th className="px-3 py-2">Giá trị</th><th className="w-10 px-2 py-2"><span className="sr-only">Xóa</span></th></tr></thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {variablesList.map((variable) => <tr key={variable}>
            <td className="truncate px-3 py-2"><button type="button" onClick={() => onInsert(variable)} title="Chèn biến vào email" className="font-mono text-xs text-indigo-700 hover:underline dark:text-indigo-300">{`{{${variable}}}`}</button></td>
            <td className="px-2 py-1.5"><input type="text" aria-label={`Giá trị cho ${variable}`} value={variables.includes(variable) ? dataValues[variable] ?? dataValues[variable.toLowerCase()] ?? "" : values[variable] ?? ""} readOnly={variables.includes(variable)} onChange={(event) => onValuesChange({ ...values, [variable]: event.target.value })} placeholder={variables.includes(variable) ? "Lấy từ dữ liệu" : `Giá trị cho ${variable}`} className={`w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs outline-none dark:border-zinc-700 ${variables.includes(variable) ? "cursor-not-allowed bg-zinc-100 text-zinc-500 dark:bg-zinc-800" : "bg-white focus:border-indigo-500 dark:bg-zinc-900"}`} /></td>
            <td className="px-2 py-1.5">{customVariables.includes(variable) && <button type="button" onClick={() => handleDelete(variable)} aria-label={`Xóa biến ${variable}`} className="rounded px-2 py-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600">×</button>}</td>
          </tr>)}
          {!variablesList.length && <tr><td colSpan={3} className="px-3 py-4 text-center text-xs text-zinc-400">Chưa có biến nào.</td></tr>}
        </tbody>
      </table>
    </div>
  </aside>;
}
