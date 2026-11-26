// Thuần TS, không import gì để `node --test` chạy được không cần build.

export type ReminderRow = {
  taskId: string;
  memberId: string;
  title: string;
  dueAt: string;
  email: string | null;
  fullName: string;
  remindedBeforeAt: string | null;
  remindedOverdueAt: string | null;
};

const HOUR_MS = 60 * 60 * 1000;
const BEFORE_WINDOW_MS = 36 * HOUR_MS;
const OVERDUE_WINDOW_MS = 7 * 24 * HOUR_MS;

export function pickReminders(rows: ReminderRow[], now: Date): { before: ReminderRow[]; overdue: ReminderRow[] } {
  const nowMs = now.getTime();
  const before: ReminderRow[] = [];
  const overdue: ReminderRow[] = [];
  for (const row of rows) {
    if (!row.email?.trim()) continue;
    const due = new Date(row.dueAt).getTime();
    if (Number.isNaN(due)) continue;
    if (due > nowMs && due <= nowMs + BEFORE_WINDOW_MS) {
      if (row.remindedBeforeAt == null) before.push(row);
    } else if (due <= nowMs && due > nowMs - OVERDUE_WINDOW_MS) {
      if (row.remindedOverdueAt == null) overdue.push(row);
    }
  }
  return { before, overdue };
}

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Header thư không được chứa xuống dòng.
function singleLine(value: string): string {
  return String(value).replace(/\s+/g, " ").trim();
}

function formatDue(iso: string): string {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function listHtml(rows: ReminderRow[]): string {
  const items = rows
    .map((row) => `<li><strong>${escapeHtml(row.title)}</strong> &mdash; hạn ${escapeHtml(formatDue(row.dueAt))}</li>`)
    .join("");
  return `<ul>${items}</ul>`;
}

export function buildReminderEmail(
  fullName: string,
  clubName: string,
  before: ReminderRow[],
  overdue: ReminderRow[],
  baseUrl: string,
): { subject: string; html: string } {
  const parts: string[] = [];
  if (before.length) parts.push(`${before.length} việc sắp đến hạn`);
  if (overdue.length) parts.push(`${overdue.length} việc quá hạn`);
  const subject = singleLine(`[${clubName}] Nhắc việc: ${parts.join(", ") || "việc cần làm"}`);

  const base = String(baseUrl).trim().replace(/\/+$/, "");
  const link = /^https?:\/\//i.test(base) ? `${base}/me` : "";

  const sections: string[] = [`<p>Chào ${escapeHtml(fullName)},</p>`];
  if (before.length) sections.push(`<p>Các việc sắp đến hạn:</p>${listHtml(before)}`);
  if (overdue.length) sections.push(`<p>Các việc đã quá hạn mà bạn chưa đánh dấu hoàn thành:</p>${listHtml(overdue)}`);
  if (link) {
    sections.push(`<p>Xem và đánh dấu hoàn thành tại <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>.</p>`);
  }
  sections.push(`<p>Trân trọng,<br>${escapeHtml(clubName)}</p>`);
  return { subject, html: sections.join("\n") };
}

/** Đã quá ngân sách thời gian chưa? `deadlineMs` undefined = không giới hạn. */
export function isPastDeadline(deadlineMs: number | undefined, nowMs: number = Date.now()): boolean {
  return deadlineMs !== undefined && nowMs > deadlineMs;
}
