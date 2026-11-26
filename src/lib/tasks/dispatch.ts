// Chỉ dùng phía server (service-role): nạp người nhận nhắc việc và gửi mail gộp qua Gmail của người gửi.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGmailAccessToken, GmailError, sendGmail } from "../email/gmail";
import { hasPermission } from "../admin/permissions";
import { quoteDisplayName } from "../email/validators";
import { buildReminderEmail, isPastDeadline, type ReminderRow } from "./reminders";

export type TaskInfo = { id: string; title: string; due_at: string };

type Member = { full_name: string; email: string | null; is_active: boolean };
type AssigneeRow = {
  task_id: string;
  member_id: string;
  reminded_before_at: string | null;
  reminded_overdue_at: string | null;
  club_members: Member | Member[] | null;
};

const TASK_BATCH = 100;
const PAGE_SIZE = 1000;

/** Các dòng `pending` của thành viên đang hoạt động thuộc những task đã cho (chia lô task, phân trang kết quả). */
export async function loadPendingRows(admin: SupabaseClient, tasks: TaskInfo[]): Promise<ReminderRow[]> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ids = [...byId.keys()];
  const rows: ReminderRow[] = [];
  for (let i = 0; i < ids.length; i += TASK_BATCH) {
    const batch = ids.slice(i, i + TASK_BATCH);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin.from("task_assignees")
        .select("task_id,member_id,reminded_before_at,reminded_overdue_at,club_members!inner(full_name,email,is_active)")
        .eq("status", "pending")
        .in("task_id", batch)
        .order("task_id").order("member_id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error("Không tải được danh sách người nhận việc.");
      const page = (data ?? []) as unknown as AssigneeRow[];
      for (const row of page) {
        const member = Array.isArray(row.club_members) ? row.club_members[0] : row.club_members;
        const task = byId.get(row.task_id);
        if (!member?.is_active || !task) continue;
        rows.push({
          taskId: row.task_id,
          memberId: row.member_id,
          title: task.title,
          dueAt: task.due_at,
          email: member.email?.trim() || null,
          fullName: member.full_name,
          remindedBeforeAt: row.reminded_before_at,
          remindedOverdueAt: row.reminded_overdue_at,
        });
      }
      if (page.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

/** Người gửi hợp lệ = thành viên đang hoạt động của CLB là owner, hoặc admin có quyền `mail`. Trả về null nếu không hợp lệ. */
export async function findValidSender(
  admin: SupabaseClient,
  clubId: string,
  senderUserId: string | null,
): Promise<{ fullName: string } | null> {
  if (!senderUserId) return null;
  const { data } = await admin.from("club_members").select("full_name,role,permissions")
    .eq("club_id", clubId).eq("user_id", senderUserId).eq("is_active", true)
    .in("role", ["owner", "admin"]).limit(1).maybeSingle();
  return data && hasPermission(data.role, data.permissions, "mail") ? { fullName: data.full_name } : null;
}

export type ClubSender = { accessToken: string; from: string };

/**
 * Lấy access token và địa chỉ From (`"Tên CLB" <email>`) của người gửi.
 * Trả về null nếu người gửi không hợp lệ (xem findValidSender); ném Error tiếng Việt khi lỗi token/email.
 */
export async function loadClubSender(
  admin: SupabaseClient,
  club: { id: string; name: string },
  senderUserId: string,
): Promise<ClubSender | null> {
  if (!(await findValidSender(admin, club.id, senderUserId))) return null;
  const { data, error } = await admin.auth.admin.getUserById(senderUserId);
  const email = data?.user?.email;
  if (error || !email) throw new GmailError("Không tìm thấy email của tài khoản gửi nhắc việc.", 502);
  const accessToken = await getGmailAccessToken(admin, senderUserId);
  return { accessToken, from: `${quoteDisplayName(club.name)} <${email}>` };
}

type Column = "reminded_before_at" | "reminded_overdue_at";
const originalMark = (row: ReminderRow, column: Column) =>
  column === "reminded_before_at" ? row.remindedBeforeAt : row.remindedOverdueAt;

// Không ghi token hay email người nhận vào log.
function safeMessage(error: unknown): string {
  if (error instanceof GmailError) return error.message;
  return error instanceof Error ? error.name : "lỗi không rõ";
}

/**
 * "Giữ chỗ" các dòng bằng update có điều kiện (mốc đang null) để hai lượt chạy song song không gửi trùng.
 * force = true (nhắc ngay): bỏ điều kiện null và ghi đè mốc.
 * Trả về các dòng giữ được; nếu lỗi DB thì ném, `claimed` vẫn chứa các dòng đã giữ để hoàn lại.
 */
async function claimRows(
  admin: SupabaseClient,
  rows: ReminderRow[],
  column: Column,
  stamp: string,
  force: boolean,
  claimed: ReminderRow[],
): Promise<void> {
  for (const row of rows) {
    let query = admin.from("task_assignees").update({ [column]: stamp })
      .eq("task_id", row.taskId).eq("member_id", row.memberId);
    if (!force) query = query.is(column, null);
    const { data, error } = await query.select("task_id");
    if (error) throw new Error("Không giữ được mốc nhắc việc.");
    if (data?.length) claimed.push(row);
  }
}

/** Trả mốc của các dòng đã giữ về giá trị ban đầu (null với lượt tự động). */
async function releaseRows(admin: SupabaseClient, rows: ReminderRow[], column: Column, stamp: string) {
  for (const row of rows) {
    const { error } = await admin.from("task_assignees").update({ [column]: originalMark(row, column) })
      .eq("task_id", row.taskId).eq("member_id", row.memberId).eq(column, stamp);
    if (error) console.error(`[tasks/dispatch] Không hoàn lại được mốc ${column} (task ${row.taskId}, member ${row.memberId}).`);
  }
}

/**
 * Với mỗi người: giữ chỗ các dòng, gửi một mail gộp các dòng giữ được, gửi lỗi thì hoàn lại mốc.
 * Một người lỗi không làm hỏng cả lượt; lỗi giữ chỗ hay gửi đều tính vào `failed`.
 * `deadlineMs` (epoch ms): quá hạn thì dừng TRƯỚC khi giữ chỗ người kế tiếp; số người còn lại tính vào `deferred` (lượt sau làm tiếp).
 * shortcut: gửi tuần tự, đủ cho CLB cỡ vài chục người; nâng cấp bằng gửi song song có giới hạn nếu timeout.
 */
export async function sendReminderMails(
  admin: SupabaseClient,
  ctx: { sender: ClubSender; clubName: string; baseUrl: string; force?: boolean; deadlineMs?: number },
  before: ReminderRow[],
  overdue: ReminderRow[],
): Promise<{ sent: number; failed: number; deferred: number }> {
  const people = new Map<string, { email: string; fullName: string; before: ReminderRow[]; overdue: ReminderRow[] }>();
  const slot = (row: ReminderRow) => {
    let entry = people.get(row.memberId);
    if (!entry) {
      entry = { email: row.email ?? "", fullName: row.fullName, before: [], overdue: [] };
      people.set(row.memberId, entry);
    }
    return entry;
  };
  for (const row of before) slot(row).before.push(row);
  for (const row of overdue) slot(row).overdue.push(row);

  const force = ctx.force === true;
  let sent = 0;
  let failed = 0;
  let deferred = 0;
  for (const [memberId, person] of people) {
    if (isPastDeadline(ctx.deadlineMs)) { deferred += 1; continue; }
    const stamp = new Date().toISOString();
    const claimedBefore: ReminderRow[] = [];
    const claimedOverdue: ReminderRow[] = [];
    const release = async () => {
      await releaseRows(admin, claimedBefore, "reminded_before_at", stamp);
      await releaseRows(admin, claimedOverdue, "reminded_overdue_at", stamp);
    };
    try {
      await claimRows(admin, person.before, "reminded_before_at", stamp, force, claimedBefore);
      await claimRows(admin, person.overdue, "reminded_overdue_at", stamp, force, claimedOverdue);
    } catch (error) {
      failed += 1;
      console.error(`[tasks/dispatch] Lỗi giữ mốc nhắc việc (member ${memberId}): ${safeMessage(error)}`);
      await release();
      continue;
    }
    // Không giữ được dòng nào: lượt khác đã nhắc rồi, bỏ qua.
    if (!claimedBefore.length && !claimedOverdue.length) continue;
    try {
      const mail = buildReminderEmail(person.fullName, ctx.clubName, claimedBefore, claimedOverdue, ctx.baseUrl);
      await sendGmail(ctx.sender.accessToken, { from: ctx.sender.from, to: person.email, ...mail });
      sent += 1;
    } catch (error) {
      failed += 1;
      const taskIds = [...claimedBefore, ...claimedOverdue].map((row) => row.taskId).join(",");
      console.error(`[tasks/dispatch] Gửi nhắc việc lỗi (member ${memberId}, task ${taskIds}): ${safeMessage(error)}`);
      await release();
    }
  }
  return { sent, failed, deferred };
}
