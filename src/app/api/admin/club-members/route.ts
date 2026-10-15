import { NextRequest, NextResponse } from "next/server";
import { getClubAdminContext } from "../../../../lib/admin/api";

const roles = new Set(["owner", "admin", "organizer"]);
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function GET(request: NextRequest) {
  const context = await getClubAdminContext(request.nextUrl.searchParams.get("clubId") ?? "", true);
  if (context.error) return context.error;
  const clubId = request.nextUrl.searchParams.get("clubId")!;
  const [memberResult, teamResult] = await Promise.all([
    context.admin.from("club_members").select("id,club_id,team_id,user_id,full_name,student_code,class_name,role,is_active,created_at").eq("club_id", clubId).order("full_name"),
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
  const role = text(body?.role || "organizer");
  if (!fullName || !roles.has(role)) return NextResponse.json({ error: "Tên thành viên hoặc vai trò không hợp lệ." }, { status: 400 });
  const teamId = text(body?.team_id) || null;
  if (teamId) {
    const { data: team } = await context.admin.from("teams").select("id").eq("id", teamId).eq("club_id", clubId).maybeSingle();
    if (!team) return NextResponse.json({ error: "Ban phải thuộc CLB đang chọn." }, { status: 400 });
  }
  const { data, error } = await context.admin.from("club_members").insert({
    club_id: clubId,
    team_id: teamId,
    full_name: fullName,
    student_code: text(body?.student_code) || null,
    class_name: text(body?.class_name) || null,
    role,
    is_active: body?.is_active !== false,
  }).select("id,club_id,team_id,user_id,full_name,student_code,class_name,role,is_active,created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ member: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clubId = text(body?.clubId);
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  const memberId = text(body?.id);
  if (!memberId) return NextResponse.json({ error: "Thiếu thành viên cần cập nhật." }, { status: 400 });
  const { data: current, error: lookupError } = await context.admin.from("club_members").select("id,user_id")
    .eq("id", memberId).eq("club_id", clubId).maybeSingle();
  if (lookupError || !current) return NextResponse.json({ error: "Không tìm thấy thành viên trong CLB này." }, { status: 404 });
  if (current.user_id === context.user.id && (body?.is_active === false || (body?.role && body.role !== "owner" && body.role !== "admin"))) {
    return NextResponse.json({ error: "Không thể tự khóa hoặc hạ quyền tài khoản đang quản trị." }, { status: 400 });
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
  if (body?.is_active !== undefined) update.is_active = Boolean(body.is_active);
  if (!Object.keys(update).length) return NextResponse.json({ error: "Không có thông tin cần cập nhật." }, { status: 400 });
  const { data, error } = await context.admin.from("club_members").update(update).eq("id", memberId).eq("club_id", clubId)
    .select("id,club_id,team_id,user_id,full_name,student_code,class_name,role,is_active,created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ member: data });
}

export async function DELETE(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId") ?? "";
  const memberId = request.nextUrl.searchParams.get("id") ?? "";
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  const { data: member } = await context.admin.from("club_members").select("id,user_id")
    .eq("id", memberId).eq("club_id", clubId).maybeSingle();
  if (!member) return NextResponse.json({ error: "Không tìm thấy thành viên trong CLB này." }, { status: 404 });
  if (member.user_id === context.user.id) return NextResponse.json({ error: "Không thể xóa thành viên đang dùng để quản trị CLB." }, { status: 400 });
  const { count: supportCount, error: supportError } = await context.admin.from("interview_session_members")
    .select("session_id", { count: "exact", head: true }).eq("member_id", memberId);
  if (supportError) return NextResponse.json({ error: supportError.message }, { status: 500 });
  if (supportCount) return NextResponse.json({ error: "Thành viên đã được gán hỗ trợ phỏng vấn. Hãy gỡ khỏi các ca hoặc tạm ngừng hoạt động để giữ lịch sử." }, { status: 409 });
  const { error } = await context.admin.from("club_members").delete().eq("id", memberId).eq("club_id", clubId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
