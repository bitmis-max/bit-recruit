import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { findValidSender, loadClubSender, loadPendingRows, sendReminderMails, type ClubSender, type TaskInfo } from "../../../../lib/tasks/dispatch";
import { pickReminders } from "../../../../lib/tasks/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
// Ngân sách thời gian: dừng giữ chỗ người mới sau 50 giây (maxDuration = 60).
const BUDGET_MS = 50_000;

// So sánh băm SHA-256 (cùng độ dài) để timingSafeEqual không ném lỗi và không lộ độ dài secret.
function secretMatches(header: string | null, secret: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header ?? ""), digest(`Bearer ${secret}`));
}

export async function GET(request: Request) {
  const deadlineMs = Date.now() + BUDGET_MS;
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Máy chủ chưa cấu hình CRON_SECRET." }, { status: 503 });
  if (!secretMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Không được phép." }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Chưa cấu hình Supabase." }, { status: 503 });
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/+$/, "");

  // Truy vấn này luôn chạy (kể cả khi không có việc nào) để Supabase Free không bị tạm dừng vì ít hoạt động.
  const { data: clubs, error: clubsError } = await admin.from("clubs").select("id,name,mail_sender_user_id");
  if (clubsError) return NextResponse.json({ error: "Không tải được danh sách CLB." }, { status: 500 });

  const now = new Date();
  const result = { clubs: 0, sent: 0, failed: 0, skippedNoSender: 0, deferred: 0 };
  for (const club of clubs ?? []) {
    if (!(await findValidSender(admin, club.id, club.mail_sender_user_id))) {
      result.skippedNoSender += 1;
      continue;
    }
    result.clubs += 1;
    try {
      // Lọc thô theo cửa sổ thời gian; pickReminders lọc chính xác.
      const { data: tasks, error } = await admin.from("tasks").select("id,title,due_at")
        .eq("club_id", club.id).eq("status", "open")
        .gt("due_at", new Date(now.getTime() - 7 * DAY_MS).toISOString())
        .lte("due_at", new Date(now.getTime() + 2 * DAY_MS).toISOString());
      if (error) throw new Error("Không tải được danh sách việc.");
      const rows = await loadPendingRows(admin, (tasks ?? []) as TaskInfo[]);
      const { before, overdue } = pickReminders(rows, now);
      if (!before.length && !overdue.length) continue;
      const people = new Set([...before, ...overdue].map((row) => row.memberId)).size;
      let sender: ClubSender | null = null;
      try {
        sender = await loadClubSender(admin, club, club.mail_sender_user_id);
      } catch (error) {
        console.error(`[cron/task-reminders] Không chuẩn bị được Gmail người gửi (CLB ${club.id}): ${error instanceof Error ? error.message : ""}`);
      }
      if (!sender) {
        result.failed += people;
        continue;
      }
      const sentResult = await sendReminderMails(admin, { sender, clubName: club.name, baseUrl, deadlineMs }, before, overdue);
      result.sent += sentResult.sent;
      result.failed += sentResult.failed;
      result.deferred += sentResult.deferred;
    } catch (error) {
      console.error("[cron/task-reminders] Lỗi khi xử lý một CLB.", error instanceof Error ? error.message : "");
    }
  }
  return NextResponse.json({ ok: true, data: result });
}
