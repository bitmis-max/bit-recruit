import { NextRequest, NextResponse } from "next/server";
import { getClubAdminContext } from "../../../../../lib/admin/api";
import { findValidSender, loadClubSender, loadPendingRows, sendReminderMails } from "../../../../../lib/tasks/dispatch";

const RECENT_REMINDER_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clubId = typeof body?.clubId === "string" ? body.clubId.trim() : "";
  const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : "";
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  if (!taskId) return NextResponse.json({ error: "Thiếu việc cần nhắc." }, { status: 400 });

  const { data: task } = await context.admin.from("tasks").select("id,title,due_at,status")
    .eq("id", taskId).eq("club_id", clubId).maybeSingle();
  if (!task) return NextResponse.json({ error: "Không tìm thấy việc trong CLB này." }, { status: 404 });
  if (task.status !== "open") return NextResponse.json({ error: "Việc này đã đóng, không cần nhắc." }, { status: 400 });

  const { data: club } = await context.admin.from("clubs").select("name,mail_sender_user_id").eq("id", clubId).maybeSingle();
  if (!club) return NextResponse.json({ error: "Không tìm thấy CLB." }, { status: 404 });
  if (!(await findValidSender(context.admin, clubId, club.mail_sender_user_id))) {
    return NextResponse.json({ error: "CLB chưa chọn Gmail để gửi nhắc việc. Hãy bấm \"Dùng Gmail của tôi để gửi nhắc\" trước." }, { status: 400 });
  }

  try {
    const rows = await loadPendingRows(context.admin, [task]);
    const withEmail = rows.filter((row) => row.email);
    const noEmail = rows.length - withEmail.length;
    // Chống bấm liên tục: bỏ qua người vừa được nhắc trong 10 phút gần nhất.
    const recentMs = Date.now() - RECENT_REMINDER_MS;
    const wasRecent = (iso: string | null) => iso != null && new Date(iso).getTime() > recentMs;
    const candidates = withEmail.filter((row) => !wasRecent(row.remindedBeforeAt) && !wasRecent(row.remindedOverdueAt));
    if (!candidates.length) return NextResponse.json({ ok: true, data: { sent: 0, failed: 0, noEmail } });
    // Bỏ qua mốc reminded_*: việc chưa tới hạn tính là "nhắc trước hạn", còn lại là "quá hạn".
    const nowMs = Date.now();
    const before = candidates.filter((row) => new Date(row.dueAt).getTime() > nowMs);
    const overdue = candidates.filter((row) => new Date(row.dueAt).getTime() <= nowMs);
    const sender = await loadClubSender(context.admin, { id: clubId, name: club.name }, club.mail_sender_user_id);
    if (!sender) return NextResponse.json({ error: "Người gửi nhắc việc không còn hợp lệ. Hãy chọn lại Gmail gửi nhắc." }, { status: 400 });
    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/+$/, "");
    const result = await sendReminderMails(context.admin, { sender, clubName: club.name, baseUrl, force: true }, before, overdue);
    return NextResponse.json({ ok: true, data: { ...result, noEmail } });
  } catch (error) {
    // Lỗi từ loadPendingRows / loadClubSender / getGmailAccessToken đều là thông báo tiếng Việt, không chứa secret.
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không gửi được nhắc việc." }, { status: 502 });
  }
}
