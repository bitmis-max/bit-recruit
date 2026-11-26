import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ParsedData = {
  columns: string[];
  rows: Record<string, string>[];
  /** Cảnh báo không chặn việc nạp dữ liệu (vd. dòng lệch cột). */
  warnings?: string[];
};

function normalizeRecord(record: Record<string, unknown>) {
  const normalized: Record<string, string> = {};
  Object.entries(record).forEach(([key, value]) => {
    const cleanKey = key?.trim();
    if (!cleanKey) {
      return;
    }
    normalized[cleanKey] = value === null || value === undefined ? "" : String(value).trim();
  });
  return normalized;
}

function toParsed(records: Record<string, unknown>[], warnings: string[] = []): ParsedData {
  const rows = records.map(normalizeRecord);
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return warnings.length ? { columns, rows, warnings } : { columns, rows };
}

// Papa báo các mã này cho CSV hợp lệ: một cột (không dò được dấu phân cách) hoặc dòng lệch cột.
const NON_FATAL_CODES = new Set(["UndetectableDelimiter", "TooFewFields", "TooManyFields"]);

const FATAL_MESSAGES: Record<string, string> = {
  MissingQuotes: "thiếu dấu ngoặc kép đóng",
  InvalidQuotes: "dấu ngoặc kép không hợp lệ",
};

/** Đọc nội dung CSV (một cột vẫn hợp lệ). Chỉ ném lỗi khi file hỏng thật; dòng lệch cột chỉ cảnh báo. */
export function parseCsvText(text: string): ParsedData {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
  });

  const fatal = result.errors.find((error) => !NON_FATAL_CODES.has(error.code ?? ""));
  if (fatal) {
    const line = typeof fatal.row === "number" ? ` (khoảng dòng ${fatal.row + 2})` : "";
    throw new Error(`File CSV bị lỗi định dạng${line}: ${FATAL_MESSAGES[fatal.code ?? ""] ?? "không đọc được nội dung"}.`);
  }

  const warnings: string[] = [];
  const mismatched = result.errors
    .filter((error) => error.code === "TooFewFields" || error.code === "TooManyFields")
    .map((error) => (error.row ?? 0) + 2);
  if (mismatched.length) {
    const shown = mismatched.slice(0, 5).join(", ");
    warnings.push(`Có ${mismatched.length} dòng có số cột không khớp với dòng tiêu đề (dòng ${shown}${mismatched.length > 5 ? "…" : ""}). Hãy kiểm tra lại các dòng này.`);
  }
  return toParsed(result.data ?? [], warnings);
}

/** Đọc sheet đầu của file Excel. `raw: false` giữ nguyên chữ hiển thị (số 0 đầu, ngày dạng chữ). */
export function parseWorkbook(data: ArrayBuffer): ParsedData {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: "array" });
  } catch {
    throw new Error("Không đọc được file Excel. File có thể bị hỏng hoặc có mật khẩu.");
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { columns: [], rows: [] };
  }
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  });
  return toParsed(json);
}

export async function parseFile(file: File): Promise<ParsedData> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv") {
    return parseCsvText(await file.text());
  }

  if (ext === "xlsx" || ext === "xls") {
    return parseWorkbook(await file.arrayBuffer());
  }

  throw new Error("Chỉ hỗ trợ file CSV hoặc Excel (.xlsx, .xls).");
}
