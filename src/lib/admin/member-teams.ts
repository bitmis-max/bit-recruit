// Logic thuần cho "một thành viên thuộc nhiều ban". Không import gì để `node --test` chạy trực tiếp.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Có dấu tiếng Việt thì coi là thông báo lỗi do DB viết cho người dùng.
const VIETNAMESE_PATTERN = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/** Mảng UUID hợp lệ (viết thường, bỏ trùng, giữ thứ tự); null nếu không phải mảng chuỗi UUID. */
export function normalizeTeamIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !UUID_PATTERN.test(item.trim())) return null;
    ids.push(item.trim().toLowerCase());
  }
  return [...new Set(ids)];
}

/**
 * Đọc tập ban từ body: `team_ids` thắng `team_id`; chỉ có `team_id` (đường cũ) thì [team_id]; rỗng/null = undefined.
 * undefined = body không nhắc tới ban; null = dữ liệu không hợp lệ.
 */
export function readTeamIds(body: { team_ids?: unknown; team_id?: unknown } | null | undefined): string[] | null | undefined {
  if (body?.team_ids !== undefined) return normalizeTeamIds(body.team_ids);
  if (body?.team_id === undefined) return undefined;
  // Đường cũ chỉ đặt ban chính (route giữ các ban còn lại); rỗng/null thì bỏ qua thay vì xóa sạch ban.
  if (body.team_id === null || body.team_id === "") return undefined;
  if (typeof body.team_id !== "string") return null;
  return normalizeTeamIds([body.team_id]);
}

export const sameTeamSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

/** "Đổi ban" = tập mới khác tập hiện tại (không tính thứ tự) hoặc ban chính khác. */
export function teamsChanged(currentIds: string[], currentPrimary: string | null, nextIds: string[]) {
  return !sameTeamSet(currentIds, nextIds) || (nextIds[0] ?? null) !== currentPrimary;
}

/** Ban chính đứng đầu, rồi các ban còn lại theo created_at tăng dần (đồng thời thì giữ thứ tự gốc). */
export function orderTeamIds(primary: string | null, rows: { team_id: string; created_at?: string | null }[]): string[] {
  const time = (row: { created_at?: string | null }) => (row.created_at ? Date.parse(row.created_at) : 0) || 0;
  const rest = rows.filter((row) => row.team_id !== primary).sort((a, b) => time(a) - time(b)).map((row) => row.team_id);
  return primary ? [primary, ...new Set(rest)] : [...new Set(rest)];
}

/** Message của DB nếu là tiếng Việt, ngược lại câu mặc định. */
export function teamsErrorMessage(message: string | undefined, fallback = "Không lưu được ban của thành viên.") {
  return message && VIETNAMESE_PATTERN.test(message) ? message : fallback;
}
