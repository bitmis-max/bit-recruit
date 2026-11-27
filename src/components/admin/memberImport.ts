import type { ColumnMapping, ImportData, ImportRow } from "./recruitment/applicantImport";

export type MemberPayloadRow = {
  full_name: string | null;
  student_code: string | null;
  class_name: string | null;
  email: string | null;
  phone: string | null;
  facebook_url: string | null;
  team: string | null;
  title: string | null;
};
export type MemberImportResult = { inserted?: number; updated?: number; unchanged?: number; staff_team_skipped?: number };

export const MAX_MEMBER_IMPORT_ROWS = 1000;

/** Mỗi thuộc tính chỉ ghép được một cột. Thứ tự này cũng là thứ tự cột ở bảng xem trước. */
export const memberMappingOptions: { value: keyof MemberPayloadRow; label: string; guess: RegExp }[] = [
  { value: "full_name", label: "Họ tên", guess: /^(ho va ten|ho ten|ten|ten thanh vien|full name|fullname|name)$/ },
  { value: "student_code", label: "Mã sinh viên", guess: /^(mssv|msv|ma sv|ma sinh vien|ma so sinh vien|student id|student code)$/ },
  { value: "class_name", label: "Lớp", guess: /^(lop|lop sinh hoat|class)$/ },
  { value: "email", label: "Email", guess: /(^| )(gmail|email|e mail|mail)( |$)/ },
  { value: "phone", label: "Điện thoại", guess: /(sdt|so dt|dien thoai|phone)/ },
  { value: "facebook_url", label: "Link Facebook", guess: /(facebook|(^| )fb( |$))/ },
  { value: "team", label: "Ban", guess: /^(ban|ban hoat dong|phong ban|team)$/ },
  { value: "title", label: "Chức danh", guess: /^(chuc vu|chuc danh|title)$/ },
];

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Đoán cách ghép theo tên cột. Mỗi thuộc tính chỉ nhận cột đầu tiên khớp; cột còn lại để "Bỏ qua". */
export function guessMemberMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = Object.fromEntries(headers.map((header) => [header, ""]));
  for (const option of memberMappingOptions) {
    const match = headers.find((header) => !mapping[header] && option.guess.test(normalizeHeader(header)));
    if (match) mapping[match] = option.value;
  }
  return mapping;
}

function cleanCell(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function mappingError(headers: string[], mapping: ColumnMapping) {
  for (const option of memberMappingOptions) {
    if (headers.filter((header) => mapping[header] === option.value).length > 1) return `Chỉ được chọn một cột cho "${option.label}".`;
  }
  if (!headers.some((header) => mapping[header] === "full_name")) return 'Hãy ghép một cột với "Họ tên".';
  return "";
}

/** Đã ghép cột nhưng chưa kiểm tra từng dòng; dùng cho bảng xem trước. */
export function mapMemberRows(data: ImportData, mapping: ColumnMapping): MemberPayloadRow[] {
  const column = (field: string) => data.headers.find((header) => mapping[header] === field);
  const value = (row: ImportRow, field: string) => { const header = column(field); return header ? cleanCell(row[header]) : null; };
  return data.rows.map((row) => ({
    full_name: value(row, "full_name"), student_code: value(row, "student_code"), class_name: value(row, "class_name"),
    email: value(row, "email"), phone: value(row, "phone"), facebook_url: value(row, "facebook_url"),
    team: value(row, "team"), title: value(row, "title"),
  }));
}

/** Dựng `p_rows` cho RPC `import_members`. Ném lỗi tiếng Việt nếu ghép cột hoặc dữ liệu chưa hợp lệ. */
export function buildMemberPayload(data: ImportData, mapping: ColumnMapping): MemberPayloadRow[] {
  const error = mappingError(data.headers, mapping);
  if (error) throw new Error(error);
  if (data.rows.length > MAX_MEMBER_IMPORT_ROWS) throw new Error(`File có ${data.rows.length} dòng dữ liệu, vượt giới hạn ${MAX_MEMBER_IMPORT_ROWS} dòng mỗi lần import. Hãy tách thành nhiều file.`);
  const rows = mapMemberRows(data, mapping);
  const missing = rows.findIndex((row) => !row.full_name);
  if (missing >= 0) throw new Error(`Dòng ${missing + 1}: thiếu họ tên.`);
  return rows;
}

export function memberImportMessage(result: MemberImportResult) {
  const text = `Đã thêm ${result.inserted ?? 0}, cập nhật ${result.updated ?? 0}, không đổi ${result.unchanged ?? 0}.`;
  const skipped = result.staff_team_skipped ?? 0;
  return skipped > 0 ? `${text} Bỏ qua ${skipped} người thuộc Ban chủ nhiệm/Ban chủ chốt (chỉ Chủ nhiệm cập nhật được).` : text;
}
