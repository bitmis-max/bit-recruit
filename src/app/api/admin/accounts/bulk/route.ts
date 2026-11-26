import { NextRequest, NextResponse } from "next/server";
import { getClubAdminContext } from "../../../../../lib/admin/api";
import { friendlyError } from "../../../../../lib/ui/friendly-error";
import { createOrLinkMemberAccount, EMAIL_PATTERN, loadUserIndex } from "../../../../../lib/admin/accounts";

// Hobby/Free: tối đa 60 giây mỗi lần gọi.
export const maxDuration = 60;

const MAX_MEMBERS = 200;
// Còn ít hơn ngần này thì dừng, trả kết quả dở để người dùng bấm lại.
const MIN_REMAINING_MS = 8_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Result = { memberId: string; status: "created" | "linked" | "skipped" | "error"; message?: string };

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => null);
  const clubId = typeof body?.clubId === "string" ? body.clubId.trim() : "";
  const context = await getClubAdminContext(clubId, { permission: "members" });
  if (context.error) return context.error;
  const memberIds: string[] = Array.isArray(body?.memberIds)
    ? [...new Set<string>((body.memberIds as unknown[]).filter((id): id is string => typeof id === "string" && id.trim() !== "").map((id) => id.trim()))]
    : [];
  if (!memberIds.length) return NextResponse.json({ error: "Chọn ít nhất một thành viên." }, { status: 400 });
  if (memberIds.length > MAX_MEMBERS) return NextResponse.json({ error: `Mỗi lần chỉ xử lý tối đa ${MAX_MEMBERS} thành viên.` }, { status: 400 });

  const { data: members, error } = await context.admin.from("club_members")
    .select("id,full_name,user_id,role,email,is_active").eq("club_id", clubId).in("id", memberIds.filter((id) => UUID_PATTERN.test(id)));
  if (error) {
    console.error(`[api/admin/accounts/bulk] members: ${error.code ?? ""} ${error.message}`);
    return NextResponse.json({ error: friendlyError(error, "Không tải được danh sách thành viên.") }, { status: 500 });
  }
  const byId = new Map((members ?? []).map((member) => [member.id as string, member]));

  let index;
  try {
    index = await loadUserIndex(context.admin);
  } catch (indexError) {
    console.error(`[api/admin/accounts/bulk] loadUserIndex: ${indexError instanceof Error ? indexError.message : ""}`);
    return NextResponse.json({ error: friendlyError(indexError, "Không tải được danh sách tài khoản.") }, { status: 500 });
  }

  const results: Result[] = [];
  for (const memberId of memberIds) {
    if (maxDuration * 1000 - (Date.now() - startedAt) < MIN_REMAINING_MS) {
      results.push({ memberId, status: "skipped", message: "Hết thời gian, hãy bấm lại để làm tiếp." });
      continue;
    }
    if (!UUID_PATTERN.test(memberId)) { results.push({ memberId, status: "error", message: "Mã thành viên không hợp lệ." }); continue; }
    const member = byId.get(memberId);
    if (!member) { results.push({ memberId, status: "error", message: "Thành viên không thuộc CLB này." }); continue; }
    if (!member.is_active) { results.push({ memberId, status: "skipped", message: "Thành viên đã ngừng hoạt động." }); continue; }
    if (member.user_id) { results.push({ memberId, status: "skipped", message: "Thành viên đã có tài khoản." }); continue; }
    if ((member.role === "owner" || member.role === "admin") && !context.isHead) {
      results.push({ memberId, status: "skipped", message: "Chỉ Chủ nhiệm mới có thể gán tài khoản cho thành viên Ban chủ nhiệm hoặc Ban chủ chốt." });
      continue;
    }
    const email = typeof member.email === "string" ? member.email.trim().toLowerCase() : "";
    if (!email) { results.push({ memberId, status: "skipped", message: "Thành viên chưa có email." }); continue; }
    if (!EMAIL_PATTERN.test(email)) { results.push({ memberId, status: "skipped", message: "Email của thành viên không hợp lệ." }); continue; }
    try {
      const result = await createOrLinkMemberAccount(context.admin, { clubId, memberId, fullName: member.full_name, email, index });
      results.push(result.ok ? { memberId, status: result.status } : { memberId, status: "error", message: result.message });
    } catch (accountError) {
      console.error(`[api/admin/accounts/bulk] member ${memberId}: ${accountError instanceof Error ? accountError.message : ""}`);
      results.push({ memberId, status: "error", message: friendlyError(accountError, "Không tạo được tài khoản.") });
    }
  }
  return NextResponse.json({ ok: true, data: { results } });
}
