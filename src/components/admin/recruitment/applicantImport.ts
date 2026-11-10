import * as XLSX from "xlsx";

export type ImportRow = Record<string, unknown>;
export type ImportData = { headers: string[]; rows: ImportRow[] };
/** Giá trị rỗng = bỏ qua cột; còn lại là một khóa trong `mappingOptions`. */
export type ColumnMapping = Record<string, string>;
export type ImportPayloadRow = {
  position: string;
  session: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  student_code: string | null;
  class_name: string | null;
  answers: Record<string, string>;
};
export type ImportPayload = { questions: string[]; rows: ImportPayloadRow[] };
export type ImportResult = { imported?: number; skipped_duplicates?: number };

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_QUESTIONS = 100;
const MAX_QUESTION_LENGTH = 500;
const MAX_NAME_LENGTH = 200;

export const mappingOptions = [
  { value: "full_name", label: "Họ tên" },
  { value: "class_name", label: "Lớp" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Điện thoại" },
  { value: "student_code", label: "Mã sinh viên" },
  { value: "position", label: "Vị trí tuyển" },
  { value: "session", label: "Ca phỏng vấn" },
  { value: "custom", label: "Câu hỏi riêng" },
];

const singleColumnFields = mappingOptions.filter((option) => option.value !== "custom");

function cleanCell(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/** Đọc sheet đầu tiên của file .xlsx/.xls/.csv. Dòng 1 là tiêu đề. */
export async function readApplicantFile(file: File): Promise<ImportData> {
  const isCsv = /\.csv$/i.test(file.name);
  // CSV đọc dưới dạng chuỗi để giữ đúng tiếng Việt UTF-8.
  const workbook = isCsv
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer());
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("File không có dữ liệu.");

  // Đọc dạng mảng, ô rỗng = "", raw:false để giữ mã sinh viên và số điện thoại có số 0 đầu.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false, raw: false });
  if (matrix.length < 2) throw new Error("File không có dữ liệu.");

  const columnCount = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  // Cột tiêu đề trống được đặt tên "Cột N"; tên trùng được đánh số.
  const seen = new Map<string, number>();
  const headers = Array.from({ length: columnCount }, (_, index) => {
    const base = String(matrix[0][index] ?? "").trim() || `Cột ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });

  const rows: ImportRow[] = matrix.slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  if (!rows.length) throw new Error("File không có dữ liệu.");
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`File có ${rows.length} dòng dữ liệu, vượt giới hạn ${MAX_IMPORT_ROWS} dòng mỗi lần import. Hãy tách thành nhiều file.`);
  return { headers, rows };
}

/** Dựng `p_questions` và `p_rows` cho RPC `import_applications`. Ném lỗi tiếng Việt nếu ghép cột chưa hợp lệ. */
export function buildImportPayload(data: ImportData, mapping: ColumnMapping): ImportPayload {
  const columnsOf = (field: string) => data.headers.filter((header) => mapping[header] === field);

  for (const option of singleColumnFields) {
    if (columnsOf(option.value).length > 1) throw new Error(`Chỉ được chọn một cột cho "${option.label}".`);
  }
  const positionColumn = columnsOf("position")[0];
  if (!positionColumn) throw new Error('Hãy ghép một cột với "Vị trí tuyển".');

  const questions = columnsOf("custom");
  if (questions.length > MAX_IMPORT_QUESTIONS) throw new Error(`Có ${questions.length} cột "Câu hỏi riêng", vượt giới hạn ${MAX_IMPORT_QUESTIONS}. Hãy bỏ bớt cột.`);
  const longQuestion = questions.find((question) => question.length > MAX_QUESTION_LENGTH);
  if (longQuestion) throw new Error(`Tiêu đề cột "${longQuestion.slice(0, 40)}…" dài quá ${MAX_QUESTION_LENGTH} ký tự.`);

  const sessionColumn = columnsOf("session")[0];
  const fieldValue = (row: ImportRow, field: string) => {
    const column = columnsOf(field)[0];
    return column ? cleanCell(row[column]) : null;
  };

  const rows = data.rows.map((row, index): ImportPayloadRow => {
    const position = cleanCell(row[positionColumn]);
    if (!position) throw new Error(`Dòng ${index + 1}: thiếu vị trí tuyển.`);
    const session = sessionColumn ? cleanCell(row[sessionColumn]) : null;
    if (position.length > MAX_NAME_LENGTH) throw new Error(`Dòng ${index + 1}: vị trí tuyển dài quá ${MAX_NAME_LENGTH} ký tự.`);
    if (session && session.length > MAX_NAME_LENGTH) throw new Error(`Dòng ${index + 1}: tên ca phỏng vấn dài quá ${MAX_NAME_LENGTH} ký tự.`);
    const answers: Record<string, string> = {};
    for (const question of questions) {
      const value = cleanCell(row[question]);
      if (value) answers[question] = value;
    }
    return {
      position, session,
      full_name: fieldValue(row, "full_name"), email: fieldValue(row, "email"), phone: fieldValue(row, "phone"),
      student_code: fieldValue(row, "student_code"), class_name: fieldValue(row, "class_name"),
      answers,
    };
  });
  return { questions, rows };
}

export function importResultMessage(result: ImportResult) {
  return `Đã import ${result.imported ?? 0}, bỏ qua ${result.skipped_duplicates ?? 0} đơn trùng.`;
}
