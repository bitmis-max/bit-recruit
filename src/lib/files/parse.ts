import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ParsedData = {
  columns: string[];
  rows: Record<string, string>[];
};

function normalizeRecord(record: Record<string, unknown>) {
  const normalized: Record<string, string> = {};
  Object.entries(record).forEach(([key, value]) => {
    const cleanKey = key?.trim();
    if (!cleanKey) {
      return;
    }
    normalized[cleanKey] = value === null || value === undefined ? "" : String(value);
  });
  return normalized;
}

export async function parseFile(file: File): Promise<ParsedData> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv") {
    const text = await file.text();
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (result.errors.length > 0) {
      throw new Error(result.errors[0]?.message ?? "CSV parse error");
    }

    const rows = (result.data ?? []).map((row: Record<string, string>) =>
      normalizeRecord(row)
    );
    const columns = rows.length ? Object.keys(rows[0]) : [];

    return { columns, rows };
  }

  if (ext === "xlsx" || ext === "xls") {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { columns: [], rows: [] };
    }
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: "",
    });
    const rows = json.map((row: Record<string, unknown>) =>
      normalizeRecord(row)
    );
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows };
  }

  throw new Error("Unsupported file type. Please upload CSV or XLSX.");
}
