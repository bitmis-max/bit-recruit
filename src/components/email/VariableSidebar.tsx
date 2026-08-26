"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

type VariableSidebarProps = {
  variables: string[];
  onInsert: (variable: string) => void;
};

export function VariableSidebar({ variables, onInsert }: VariableSidebarProps) {
  const [customVariables, setCustomVariables] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("mailmerge.sidebarVariables");
      if (stored) {
        try {
          return JSON.parse(stored) as string[];
        } catch {
          // ignore
        }
      }
    }
    return ["name", "email", "company", "phone", "code"];
  });

  const [newVarName, setNewVarName] = useState("");

  // Sync custom variables to localStorage
  useEffect(() => {
    localStorage.setItem("mailmerge.sidebarVariables", JSON.stringify(customVariables));
  }, [customVariables]);

  // Merge custom variables and props-provided variables reactively
  const variablesList = useMemo(() => {
    return Array.from(new Set([...customVariables, ...variables]));
  }, [customVariables, variables]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newVarName.trim().replace(/[{}]/g, "");
    if (!clean) return;
    if (!customVariables.includes(clean)) {
      setCustomVariables((prev) => [...prev, clean]);
    }
    setNewVarName("");
  };

  const handleDelete = useCallback((variableToDelete: string) => {
    setCustomVariables((prev) => prev.filter((v) => v !== variableToDelete));
  }, []);

  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Biến động
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Click để chèn vào email, hoặc tự thêm các biến tùy chỉnh.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newVarName}
          onChange={(e) => setNewVarName(e.target.value)}
          placeholder="Tên biến mới..."
          className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-1.5 text-xs text-zinc-800 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:bg-zinc-950"
        />
        <button
          type="submit"
          className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-95"
        >
          Thêm
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {variablesList.map((variable) => (
          <span
            key={variable}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50/60 pl-3 pr-1.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200 dark:hover:border-zinc-700"
          >
            <button
              type="button"
              onClick={() => onInsert(variable)}
              className="font-medium hover:text-indigo-600 dark:hover:text-indigo-400"
              title="Click để chèn vào email"
            >
              {`{{${variable}}}`}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(variable)}
              className="flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-200 hover:text-rose-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
              title="Xóa biến này"
            >
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        {variablesList.length === 0 && (
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 italic">
            Chưa có biến nào. Hãy thêm biến mới ở trên.
          </span>
        )}
      </div>
    </aside>
  );
}
