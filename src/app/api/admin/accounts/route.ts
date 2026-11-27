import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getClubAdminContext } from "../../../../lib/admin/api";
import { createOrLinkMemberAccount, EMAIL_PATTERN, findUserByEmail, isLinkableUser, loadUserIndex, UNVERIFIED_ACCOUNT_MESSAGE } from "../../../../lib/admin/accounts";
import { revokeMailTokenIfNoStaffRole } from "../../../../lib/admin/mail-token";
import { friendlyError } from "../../../../lib/ui/friendly-error";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

// Ghi log phía server (không ghi email/secret) rồi trả câu tiếng Việt cho client.
function fail(scope: string, error: unknown, fallback: string, status: number) {
  const detail = error && typeof error === "object" ? error as { code?: string; message?: string } : {};
  console.error(`[api/admin/accounts] ${scope}: ${detail.code ?? ""} ${detail.message ?? ""}`);
  return NextResponse.json({ error: friendlyError(error, fallback) }, { status });
}

export async function GET(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId") ?? "";
  const context = await getClubAdminContext(clubId, { permission: "members" });
  if (context.error) return context.error;
  const { data: members, error } = await context.admin.from("club_members")
    .select("id,full_name,user_id,role,is_active").eq("club_id", clubId).order("full_name");
  if (error) return fail("GET", error, "Không tải được danh sách tài khoản.", 500);
  // Tải danh sách tài khoản một lần (theo trang 1000) thay vì gọi getUserById cho từng người.
  const usersById = new Map<string, User>();
  try {
    for (const user of (await loadUserIndex(context.admin)).values()) usersById.set(user.id, user);
  } catch (indexError) {
    return fail("GET users", indexError, "Không tải được danh sách tài khoản.", 500);
  }
  const rows = (members ?? []).map((member) => {
    const user = member.user_id ? usersById.get(member.user_id) : undefined;
    return {
      memberId: member.id,
      memberName: member.full_name,
      role: member.role,
      account: user ? { id: user.id, email: user.email ?? "", fullName: user.user_metadata?.full_name ?? member.full_name } : null,
    };
  });
  return NextResponse.json({ accounts: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clubId = text(body?.clubId);
  const context = await getClubAdminContext(clubId, { permission: "members" });
  if (context.error) return context.error;
  const memberId = text(body?.memberId);
  const email = text(body?.email).toLowerCase();
  if (!memberId || !EMAIL_PATTERN.test(email)) return NextResponse.json({ error: "Chọn thành viên và nhập email hợp lệ." }, { status: 400 });
  const { data: member, error: memberError } = await context.admin.from("club_members").select("id,full_name,user_id,role,is_active")
    .eq("id", memberId).eq("club_id", clubId).maybeSingle();
  if (memberError || !member) return NextResponse.json({ error: "Thành viên không thuộc CLB này." }, { status: 404 });
  if ((member.role === "owner" || member.role === "admin") && !context.isHead) {
    return NextResponse.json({ error: "Chỉ Chủ nhiệm mới có thể gán tài khoản cho thành viên Ban chủ nhiệm hoặc Ban chủ chốt." }, { status: 403 });
  }
  if (!member.is_active) return NextResponse.json({ error: "Thành viên đã ngừng hoạt động. Hãy mở khóa trước khi gán tài khoản." }, { status: 409 });
  if (member.user_id) return NextResponse.json({ error: "Thành viên này đã được gán tài khoản." }, { status: 409 });

  if (body?.mode === "create") {
    // Không gửi mail: thành viên đăng nhập bằng Google cùng email. Email đã có tài khoản thì gắn như mode link.
    try {
      const result = await createOrLinkMemberAccount(context.admin, { clubId, memberId, fullName: member.full_name, email });
      if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.httpStatus });
      return NextResponse.json({ ok: true, invited: false, data: { status: result.status } }, { status: 201 });
    } catch (error) {
      return fail("POST create", error, "Không tạo được tài khoản.", 500);
    }
  }

  let account: User | null = null;
  try {
    if (body?.mode === "invite") {
      const requestOrigin = new URL(request.url).origin;
      const redirectTo = new URL("/auth/callback?next=%2Fmanage-clubs", requestOrigin).toString();
      const { data, error } = await context.admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: member.full_name },
        redirectTo,
      });
      if (error) return fail("POST invite", error, "Không gửi được lời mời. Vui lòng thử lại.", 400);
      account = data.user;
    } else if (body?.mode === "link") {
      account = await findUserByEmail(context.admin, email);
      if (!account) return NextResponse.json({ error: "Không tìm thấy tài khoản có email này." }, { status: 404 });
      if (!isLinkableUser(account)) return NextResponse.json({ error: UNVERIFIED_ACCOUNT_MESSAGE }, { status: 409 });
    } else {
      return NextResponse.json({ error: "Thao tác tài khoản không hợp lệ." }, { status: 400 });
    }
  } catch (error) {
    return fail("POST find", error, "Không tìm được tài khoản.", 500);
  }
  if (!account) return NextResponse.json({ error: "Không thể tạo hoặc tìm tài khoản." }, { status: 500 });

  const { data: duplicate } = await context.admin.from("club_members").select("id")
    .eq("club_id", clubId).eq("user_id", account.id).maybeSingle();
  if (duplicate) {
    if (body?.mode === "invite") await context.admin.auth.admin.deleteUser(account.id);
    return NextResponse.json({ error: "Tài khoản này đã được gán cho thành viên khác trong CLB." }, { status: 409 });
  }
  const { error: linkError } = await context.admin.from("club_members").update({ user_id: account.id })
    .eq("id", memberId).eq("club_id", clubId);
  if (linkError) {
    if (body?.mode === "invite") await context.admin.auth.admin.deleteUser(account.id);
    return fail("POST link", linkError, "Không gán được tài khoản cho thành viên.", 400);
  }
  return NextResponse.json({ ok: true, invited: body?.mode === "invite" }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clubId = text(body?.clubId);
  const context = await getClubAdminContext(clubId, { permission: "members" });
  if (context.error) return context.error;
  const accountId = text(body?.accountId);
  const email = text(body?.email).toLowerCase();
  const fullName = text(body?.fullName);
  const { data: assignment } = await context.admin.from("club_members").select("id,role")
    .eq("club_id", clubId).eq("user_id", accountId).maybeSingle();
  if (!assignment) return NextResponse.json({ error: "Tài khoản không được gán trong CLB này." }, { status: 404 });
  if ((assignment.role === "owner" || assignment.role === "admin") && !context.isHead) {
    return NextResponse.json({ error: "Chỉ Chủ nhiệm mới có thể sửa tài khoản của thành viên Ban chủ nhiệm hoặc Ban chủ chốt." }, { status: 403 });
  }
  // Email và tên là của tài khoản dùng chung, nên không cho sửa nếu tài khoản còn thuộc CLB khác.
  const { data: otherMembership, error: otherError } = await context.admin.from("club_members").select("id")
    .eq("user_id", accountId).neq("club_id", clubId).limit(1).maybeSingle();
  if (otherError) return NextResponse.json({ error: "Không kiểm tra được tài khoản. Vui lòng thử lại." }, { status: 500 });
  if (otherMembership) {
    return NextResponse.json({ error: "Tài khoản này còn thuộc CLB khác nên không thể đổi email hoặc tên tại đây." }, { status: 403 });
  }
  if (!accountId || !EMAIL_PATTERN.test(email) || !fullName) return NextResponse.json({ error: "Tên hoặc email không hợp lệ." }, { status: 400 });
  // Đổi email đăng nhập = đổi người sở hữu tài khoản, nên chỉ Chủ nhiệm được làm.
  if (!context.isHead) {
    const { data: existing, error: lookupError } = await context.admin.auth.admin.getUserById(accountId);
    if (lookupError || !existing.user) return NextResponse.json({ error: "Không tìm thấy tài khoản." }, { status: 404 });
    if ((existing.user.email ?? "").toLowerCase() !== email) {
      return NextResponse.json({ error: "Chỉ Chủ nhiệm mới có thể đổi email đăng nhập của tài khoản." }, { status: 403 });
    }
  }
  const { error } = await context.admin.auth.admin.updateUserById(accountId, { email, user_metadata: { full_name: fullName } });
  if (error) return fail("PATCH", error, "Không cập nhật được tài khoản. Vui lòng thử lại.", 400);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId") ?? "";
  const accountId = request.nextUrl.searchParams.get("accountId") ?? "";
  const context = await getClubAdminContext(clubId, { permission: "members" });
  if (context.error) return context.error;
  if (accountId === context.user.id) return NextResponse.json({ error: "Không thể tự gỡ tài khoản đang quản trị CLB." }, { status: 400 });
  const { data: assignment } = await context.admin.from("club_members").select("id,user_id,role")
    .eq("club_id", clubId).eq("user_id", accountId).maybeSingle();
  if (!assignment) return NextResponse.json({ error: "Tài khoản không được gán trong CLB này." }, { status: 404 });
  if ((assignment.role === "owner" || assignment.role === "admin") && !context.isHead) {
    return NextResponse.json({ error: "Chỉ Chủ nhiệm mới có thể gỡ tài khoản của thành viên Ban chủ nhiệm hoặc Ban chủ chốt." }, { status: 403 });
  }
  const { error } = await context.admin.from("club_members").update({ user_id: null }).eq("id", assignment.id).eq("club_id", clubId);
  if (error) return fail("DELETE", error, "Không gỡ được tài khoản. Vui lòng thử lại.", 400);
  // Tài khoản không còn là BCN/BCC đang hoạt động ở CLB nào thì thu hồi quyền gửi Gmail đã lưu.
  await revokeMailTokenIfNoStaffRole(context.admin, accountId);
  return NextResponse.json({ ok: true });
}
