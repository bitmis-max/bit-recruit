import { NextRequest, NextResponse } from "next/server";
import { getClubAdminContext } from "../../../../lib/admin/api";
import { findValidSender } from "../../../../lib/tasks/dispatch";

export async function GET(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId") ?? "";
  const context = await getClubAdminContext(clubId, { permission: "mail" });
  if (context.error) return context.error;
  const { data: club, error } = await context.admin.from("clubs").select("mail_sender_user_id").eq("id", clubId).maybeSingle();
  if (error || !club) return NextResponse.json({ error: "Không tải được thông tin CLB." }, { status: 500 });
  const senderId: string | null = club.mail_sender_user_id;
  // Người gửi không còn là owner/admin đang hoạt động thì coi như chưa cấu hình.
  const sender = await findValidSender(context.admin, clubId, senderId);
  return NextResponse.json({ ok: true, data: { configured: Boolean(sender), isMe: Boolean(sender) && senderId === context.user.id, senderName: sender?.fullName ?? null } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clubId = typeof body?.clubId === "string" ? body.clubId.trim() : "";
  const context = await getClubAdminContext(clubId, { permission: "mail" });
  if (context.error) return context.error;
  const { data: token, error: tokenError } = await context.admin.from("google_mail_tokens")
    .select("user_id").eq("user_id", context.user.id).maybeSingle();
  if (tokenError) return NextResponse.json({ error: "Không kiểm tra được kết nối Gmail." }, { status: 500 });
  if (!token) return NextResponse.json({ error: "Bạn chưa kết nối Gmail. Vào mục Gửi mail để kết nối trước." }, { status: 400 });
  const { error } = await context.admin.from("clubs").update({ mail_sender_user_id: context.user.id }).eq("id", clubId);
  if (error) return NextResponse.json({ error: "Không lưu được người gửi nhắc việc." }, { status: 500 });
  return NextResponse.json({ ok: true, data: { configured: true, isMe: true } });
}
