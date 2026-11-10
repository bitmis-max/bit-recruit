import { NextRequest, NextResponse } from "next/server";
import { getClubAdminContext } from "../../../../lib/admin/api";
import { EMAIL_PATTERN } from "../../../../lib/admin/accounts";

const roles = new Set(["owner", "admin", "member"]);
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const FACEBOOK_PATTERN = /^https:\/\/(www\.|m\.|web\.)?(facebook|fb)\.com\/.+/;
const MEMBER_COLUMNS = "id,club_id,team_id,user_id,full_name,student_code,class_name,role,is_active,created_at,email,phone,facebook_url,title";

// Đọc email, phone, facebook_url, title từ body. Chỉ lấy trường có mặt; rỗng thì đặt null.
function readContactFields(body: Record<string, unknown> | null): { fields: Record<string, string | null> } | { error: string } {
  const fields: Record<string, string | null> = {};
  if (body?.email !== undefined) {
    const email = text(body.email).toLowerCase();
    if (email && !EMAIL_PATTERN.test(email)) return { error: "Email không hợp lệ." };
    fields.email = email || null;
  }
  if (body?.phone !== undefined) {
    const phone = text(body.phone);
    if (phone.length > 30) return { error: "Số điện thoại quá dài." };
    fields.phone = phone || null;
  }
  if (body?.facebook_url !== undefined) {
    const facebook = text(body.facebook_url);
    if (facebook && !FACEBOOK_PATTERN.test(facebook)) return { error: "Link Facebook không hợp lệ. Hãy dùng đường dẫn https://facebook.com/..." };
    fields.facebook_url = facebook || null;
  }
  if (body?.title !== undefined) {
    const title = text(body.title);
    if (title.length > 100) return { error: "Chức danh quá dài." };
    fields.title = title || null;
  }
  return { fields };
}

function dbError(error: { code?: string; message: string }) {
  if (error.code === "23505") return "Email hoặc mã sinh viên này đã có trong CLB.";
  return error.message;
}

export async function GET(request: NextRequest) {
  const context = await getClubAdminContext(request.nextUrl.searchParams.get("clubId") ?? "");
  if (context.error) return context.error;
  const clubId = request.nextUrl.searchParams.get("clubId")!;
  const [memberResult, teamResult] = await Promise.all([
    context.admin.from("club_members").select(MEMBER_COLUMNS).eq("club_id", clubId).order("full_name"),
    context.admin.from("teams").select("id,name").eq("club_id", clubId).order("name"),
  ]);
  if (memberResult.error || teamResult.error) return NextResponse.json({ error: memberResult.error?.message ?? teamResult.error?.message }, { status: 500 });
  return NextResponse.json({ members: memberResult.data ?? [], teams: teamResult.data ?? [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clubId = text(body?.clubId);
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  const fullName = text(body?.full_name);
  const role = text(body?.role) || "member";
  if (!fullName || !roles.has(role)) return NextResponse.json({ error: "Tên thành viên hoặc vai trò không hợp lệ." }, { status: 400 });
  if (role === "owner" && context.role !== "owner") {
    return NextResponse.json({ error: "Chỉ owner mới có thể thêm owner khác." }, { status: 403 });
  }
  if (role === "admin" && context.role !== "owner") {
    return NextResponse.json({ error: "Chỉ owner mới có thể thêm thành viên Ban chủ chốt." }, { status: 403 });
  }
  const contact = readContactFields(body);
  if ("error" in contact) return NextResponse.json({ error: contact.error }, { status: 400 });
  const teamId = text(body?.team_id) || null;
  if (teamId) {
    const { data: team } = await context.admin.from("teams").select("id").eq("id", teamId).eq("club_id", clubId).maybeSingle();
    if (!team) return NextResponse.json({ error: "Ban phải thuộc CLB đang chọn." }, { status: 400 });
  }
  const { data, error } = await context.admin.from("club_members").insert({
    ...contact.fields,
    club_id: clubId,
    team_id: teamId,
    full_name: fullName,
    student_code: text(body?.student_code) || null,
    class_name: text(body?.class_name) || null,
    role,
    is_active: body?.is_active !== false,
  }).select(MEMBER_COLUMNS).single();
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 400 });
  return NextResponse.json({ member: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clubId = text(body?.clubId);
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  const memberId = text(body?.id);
  if (!memberId) return NextResponse.json({ error: "Thiếu thành viên cần cập nhật." }, { status: 400 });
  const { data: current, error: lookupError } = await context.admin.from("club_members").select("id,user_id,role")
    .eq("id", memberId).eq("club_id", clubId).maybeSingle();
  if (lookupError || !current) return NextResponse.json({ error: "Không tìm thấy thành viên trong CLB này." }, { status: 404 });
  if (current.role === "owner" && context.role !== "owner") {
    return NextResponse.json({ error: "Chỉ owner mới có thể thay đổi thành viên owner." }, { status: 403 });
  }
  if (current.user_id === context.user.id) {
    if (body?.is_active === false) return NextResponse.json({ error: "Không thể tự khóa tài khoản đang quản trị." }, { status: 400 });
    if (body?.role !== undefined && text(body.role) !== current.role) {
      return NextResponse.json({ error: "Không thể tự thay đổi vai trò của tài khoản đang quản trị." }, { status: 400 });
    }
  }
  if (body?.role !== undefined && text(body.role) === "owner" && context.role !== "owner") {
    return NextResponse.json({ error: "Chỉ owner mới có thể cấp quyền owner." }, { status: 403 });
  }
  if (body?.role !== undefined && context.role !== "owner") {
    const nextRole = text(body.role);
    if (nextRole !== current.role && (nextRole === "admin" || current.role === "admin")) {
      return NextResponse.json({ error: "Chỉ owner mới có thể cấp hoặc thay đổi vai trò Ban chủ chốt." }, { status: 403 });
    }
  }
  const update: Record<string, unknown> = {};
  if (body?.full_name !== undefined) update.full_name = text(body.full_name);
  if (body?.student_code !== undefined) update.student_code = text(body.student_code) || null;
  if (body?.class_name !== undefined) update.class_name = text(body.class_name) || null;
  if (body?.team_id !== undefined) {
    const teamId = text(body.team_id) || null;
    if (teamId) {
      const { data: team } = await context.admin.from("teams").select("id").eq("id", teamId).eq("club_id", clubId).maybeSingle();
      if (!team) return NextResponse.json({ error: "Ban phải thuộc CLB đang chọn." }, { status: 400 });
    }
    update.team_id = teamId;
  }
  if (body?.role !== undefined) {
    const role = text(body.role);
    if (!roles.has(role)) return NextResponse.json({ error: "Vai trò không hợp lệ." }, { status: 400 });
    update.role = role;
  }
  const contact = readContactFields(body);
  if ("error" in contact) return NextResponse.json({ error: contact.error }, { status: 400 });
  Object.assign(update, contact.fields);
  if (body?.is_active !== undefined) update.is_active = Boolean(body.is_active);
  if (!Object.keys(update).length) return NextResponse.json({ error: "Không có thông tin cần cập nhật." }, { status: 400 });
  const { data, error } = await context.admin.from("club_members").update(update).eq("id", memberId).eq("club_id", clubId)
    .select(MEMBER_COLUMNS).single();
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 400 });
  return NextResponse.json({ member: data });
}

export async function DELETE(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId") ?? "";
  const memberId = request.nextUrl.searchParams.get("id") ?? "";
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  const { data: member } = await context.admin.from("club_members").select("id,user_id,role")
    .eq("id", memberId).eq("club_id", clubId).maybeSingle();
  if (!member) return NextResponse.json({ error: "Không tìm thấy thành viên trong CLB này." }, { status: 404 });
  if (member.role === "owner" && context.role !== "owner") {
    return NextResponse.json({ error: "Chỉ owner mới có thể xóa thành viên owner." }, { status: 403 });
  }
  if (member.user_id === context.user.id) return NextResponse.json({ error: "Không thể xóa thành viên đang dùng để quản trị CLB." }, { status: 400 });
  const { count: supportCount, error: supportError } = await context.admin.from("interview_session_members")
    .select("session_id", { count: "exact", head: true }).eq("member_id", memberId);
  if (supportError) return NextResponse.json({ error: supportError.message }, { status: 500 });
  if (supportCount) return NextResponse.json({ error: "Thành viên đã được gán hỗ trợ phỏng vấn. Hãy gỡ khỏi các ca hoặc tạm ngừng hoạt động để giữ lịch sử." }, { status: 409 });
  const { error } = await context.admin.from("club_members").delete().eq("id", memberId).eq("club_id", clubId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
