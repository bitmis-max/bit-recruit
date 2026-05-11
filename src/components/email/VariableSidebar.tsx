"use client";

type VariableSidebarProps = {
  variables: string[];
  onInsert: (variable: string) => void;
};

const defaultVariables = ["name", "email", "company", "phone", "code"];

export function VariableSidebar({ variables, onInsert }: VariableSidebarProps) {
  const merged = Array.from(
    new Set([...defaultVariables, ...variables].filter(Boolean))
  );

  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Biến động
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Click để chèn vào email
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {merged.map((variable) => (
          <button
            key={variable}
            type="button"
            onClick={() => onInsert(variable)}
            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {`{{${variable}}}`}
          </button>
        ))}
      </div>
    </aside>
  );
}
