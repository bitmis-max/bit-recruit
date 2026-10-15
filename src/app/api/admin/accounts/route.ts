import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getClubAdminContext } from "../../../../lib/admin/api";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

async function findUserByEmail(admin: SupabaseClient, email: string) {
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const match = data.users.find((user: { email?: string }) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId") ?? "";
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  const { data: members, error } = await context.admin.from("club_members")
    .select("id,full_name,user_id,role,is_active").eq("club_id", clubId).order("full_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = await Promise.all((members ?? []).map(async (member) => {
    if (!member.user_id) return { memberId: member.id, memberName: member.full_name, role: member.role, account: null };
    const { data } = await context.admin.auth.admin.getUserById(member.user_id);
    return {
      memberId: member.id,
      memberName: member.full_name,
      role: member.role,
      account: data.user ? { id: data.user.id, email: data.user.email ?? "", fullName: data.user.user_metadata?.full_name ?? member.full_name } : null,
    };
  }));
  return NextResponse.json({ accounts: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clubId = text(body?.clubId);
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  const memberId = text(body?.memberId);
  const email = text(body?.email).toLowerCase();
  if (!memberId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Chọn thành viên và nhập email hợp lệ." }, { status: 400 });
  const { data: member, error: memberError } = await context.admin.from("club_members").select("id,full_name,user_id")
    .eq("id", memberId).eq("club_id", clubId).maybeSingle();
  if (memberError || !member) return NextResponse.json({ error: "Thành viên không thuộc CLB này." }, { status: 404 });
  if (member.user_id) return NextResponse.json({ error: "Thành viên này đã được gán tài khoản." }, { status: 409 });

  let account: User | null = null;
  try {
    if (body?.mode === "invite") {
      const requestOrigin = new URL(request.url).origin;
      const redirectTo = new URL("/auth/callback?next=%2Fadmin", requestOrigin).toString();
      const { data, error } = await context.admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: member.full_name },
        redirectTo,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      account = data.user;
    } else if (body?.mode === "link") {
      account = await findUserByEmail(context.admin, email);
      if (!account) return NextResponse.json({ error: "Không tìm thấy tài khoản có email này." }, { status: 404 });
    } else {
      return NextResponse.json({ error: "Thao tác tài khoản không hợp lệ." }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không tìm được tài khoản." }, { status: 500 });
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
    return NextResponse.json({ error: linkError.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, invited: body?.mode === "invite" }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clubId = text(body?.clubId);
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  const accountId = text(body?.accountId);
  const email = text(body?.email).toLowerCase();
  const fullName = text(body?.fullName);
  const { data: assignment } = await context.admin.from("club_members").select("id")
    .eq("club_id", clubId).eq("user_id", accountId).maybeSingle();
  if (!assignment) return NextResponse.json({ error: "Tài khoản không được gán trong CLB này." }, { status: 404 });
  if (!accountId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName) return NextResponse.json({ error: "Tên hoặc email không hợp lệ." }, { status: 400 });
  const { error } = await context.admin.auth.admin.updateUserById(accountId, { email, user_metadata: { full_name: fullName } });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId") ?? "";
  const accountId = request.nextUrl.searchParams.get("accountId") ?? "";
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  if (accountId === context.user.id) return NextResponse.json({ error: "Không thể tự gỡ tài khoản đang quản trị CLB." }, { status: 400 });
  const { data: assignment } = await context.admin.from("club_members").select("id,user_id")
    .eq("club_id", clubId).eq("user_id", accountId).maybeSingle();
  if (!assignment) return NextResponse.json({ error: "Tài khoản không được gán trong CLB này." }, { status: 404 });
  const { error } = await context.admin.from("club_members").update({ user_id: null }).eq("id", assignment.id).eq("club_id", clubId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
