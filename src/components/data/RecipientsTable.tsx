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

const statusStyle = {
  sent: { label: "Đã gửi", tone: "text-emerald-700" },
  failed: { label: "Lỗi", tone: "text-rose-700" },
  pending: { label: "Chưa gửi", tone: "text-zinc-500" },
} as const;

/** Bảng người nhận: nằm trong Panel của bước 1, tự cuộn ngang/dọc trong khung riêng. */
export function RecipientsTable({ rows, selectedId, onSelect }: RecipientsTableProps) {
  const columns: ColumnDef<RecipientRow>[] = [
    {
      accessorKey: "__status",
      header: "Trạng thái",
      cell: ({ row }: CellContext<RecipientRow, unknown>) => {
        const { label, tone } = statusStyle[row.original.__status ?? "pending"];
        return <span className={`text-xs font-medium ${tone}`}>{label}</span>;
      },
    },
    ...Object.keys(rows[0] ?? {})
      .filter((key) => !key.startsWith("__"))
      .map((key) => ({
        accessorKey: key,
        header: key,
        cell: ({ row }: CellContext<RecipientRow, unknown>) => (
          <span title={row.original[key]} className="block max-w-full truncate text-sm text-zinc-700">
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
    <div className="max-h-[420px] min-w-0 overflow-auto border-t border-zinc-100">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-zinc-50 text-zinc-600">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="max-w-0 truncate px-4 py-2 font-semibold" title={String(header.column.columnDef.header ?? "")}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const isSelected = row.original.__id === selectedId;
            const select = () => onSelect(row.original.__id);
            return (
              <tr
                key={row.id}
                tabIndex={0}
                aria-current={isSelected ? "true" : undefined}
                onClick={select}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } }}
                className={`cursor-pointer border-t border-zinc-100 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 ${isSelected ? "bg-emerald-50" : ""}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="max-w-0 px-4 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
