"use client";

import {
  flexRender,
  getCoreRowModel,
  type CellContext,
  type ColumnDef,
  useReactTable,
} from "@tanstack/react-table";

export type RecipientRow = Record<string, string> & {
  __id: string;
  __status?: "pending" | "sent" | "failed";
};

export type RecipientsTableProps = {
  rows: RecipientRow[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
};

export function RecipientsTable({ rows, selectedId, onSelect }: RecipientsTableProps) {
  const columns: ColumnDef<RecipientRow>[] = [
    {
      accessorKey: "__status",
      header: "Status",
      cell: ({ row }: CellContext<RecipientRow, unknown>) => {
        const status = row.original.__status ?? "pending";
        const tone =
          status === "sent"
            ? "text-emerald-600"
            : status === "failed"
              ? "text-rose-600"
              : "text-zinc-500";
        return <span className={`text-xs font-medium ${tone}`}>{status}</span>;
      },
    },
    ...Object.keys(rows[0] ?? {})
      .filter((key) => !key.startsWith("__"))
      .map((key) => ({
        accessorKey: key,
        header: key,
        cell: ({ row }: CellContext<RecipientRow, unknown>) => (
          <span className="text-sm text-zinc-700 dark:text-zinc-200">
            {row.original[key]}
          </span>
        ),
      })),
  ];

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="max-h-[420px] overflow-auto">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2 font-semibold">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const isSelected = row.original.__id === selectedId;
              return (
                <tr
                  key={row.id}
                  onClick={() => onSelect(row.original.__id)}
                  className={`cursor-pointer border-t border-zinc-100 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/60 ${
                    isSelected ? "bg-indigo-50 dark:bg-indigo-500/10" : ""
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="px-4 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Chưa có dữ liệu. Hãy import file để xem bảng.
        </div>
      )}
    </div>
  );
}
