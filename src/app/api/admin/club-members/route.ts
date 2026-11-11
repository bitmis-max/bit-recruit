import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClubAdminContext } from "../../../../lib/admin/api";
import { EMAIL_PATTERN } from "../../../../lib/admin/accounts";
import { isClubPermission } from "../../../../lib/admin/permissions";
import { orderTeamIds, readTeamIds, teamsChanged, teamsErrorMessage } from "../../../../lib/admin/member-teams";

const roles = new Set(["owner", "admin", "member"]);
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const FACEBOOK_PATTERN = /^https:\/\/(www\.|m\.|web\.)?(facebook|fb)\.com\/.+/;
const MEMBER_COLUMNS = "id,club_id,team_id,user_id,full_name,student_code,class_name,role,is_active,created_at,email,phone,facebook_url,title,permissions,is_head";
const HEAD_ONLY_MESSAGE = "Chỉ Chủ nhiệm mới có thể đổi vai trò hoặc quyền của thành viên.";

// Mảng quyền hợp lệ (bỏ trùng, giữ thứ tự); null nếu không phải mảng con của các mã quyền.
function readPermissions(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(isClubPermission)) return null;
  return [...new Set<string>(value)];
}

const samePermissions = (a: string[], b: string[]) => a.length === b.length && a.every((code) => b.includes(code));

// Khóa, mở khóa, xóa, đổi ban của dòng owner/admin (hoặc của chính mình khi `includeSelf`) chỉ Chủ nhiệm làm được.
// Trả về Response lỗi 403 nếu bị chặn, ngược lại null.
function requireHeadForStaffRow(
  context: { isHead: boolean; user: { id: string } },
  row: { role: string; user_id: string | null },
  action: string,
  includeSelf = false,
) {
  if (context.isHead) return null;
  if (row.role === "owner" || row.role === "admin" || (includeSelf && row.user_id === context.user.id)) {
    return NextResponse.json({ error: `Chỉ Chủ nhiệm mới có thể ${action}.` }, { status: 403 });
  }
  return null;
}

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

const INVALID_TEAMS_MESSAGE = "Danh sách ban không hợp lệ.";
const TEAM_NOT_IN_CLUB_MESSAGE = "Ban phải thuộc CLB đang chọn.";

type TeamRow = { member_id: string; team_id: string; created_at: string | null };

// Gom các dòng club_member_teams theo thành viên, rồi sắp: ban chính đầu, còn lại theo created_at.
function teamIdsByMember(members: { id: string; team_id: string | null }[], rows: TeamRow[]) {
  const byMember = new Map<string, TeamRow[]>();
  for (const row of rows) byMember.set(row.member_id, [...(byMember.get(row.member_id) ?? []), row]);
  return new Map(members.map((member) => [member.id, orderTeamIds(member.team_id, byMember.get(member.id) ?? [])]));
}

async function loadTeamIds(admin: SupabaseClient, memberId: string, primary: string | null) {
  const { data, error } = await admin.from("club_member_teams").select("member_id,team_id,created_at").eq("member_id", memberId);
  if (error) return null;
  return orderTeamIds(primary, (data ?? []) as TeamRow[]);
}

// Mọi ban phải thuộc CLB đang chọn.
async function teamsBelongToClub(admin: SupabaseClient, clubId: string, teamIds: string[]) {
  if (!teamIds.length) return true;
  const { data, error } = await admin.from("teams").select("id").eq("club_id", clubId).in("id", teamIds);
  return !error && (data?.length ?? 0) === teamIds.length;
}

// Đọc lại thành viên sau khi ghi, kèm team_ids.
async function loadMember(admin: SupabaseClient, memberId: string, clubId: string) {
  const { data, error } = await admin.from("club_members").select(MEMBER_COLUMNS).eq("id", memberId).eq("club_id", clubId).single();
  if (error || !data) return null;
  const teamIds = await loadTeamIds(admin, memberId, data.team_id ?? null);
  return teamIds ? { ...data, team_ids: teamIds } : null;
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
  const members = memberResult.data ?? [];
  const teams = teamResult.data ?? [];
  let teamRows: TeamRow[] = [];
  if (teams.length) {
    // Phân trang: PostgREST trả tối đa 1000 dòng mỗi lần.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await context.admin.from("club_member_teams").select("member_id,team_id,created_at")
        .in("team_id", teams.map((team) => team.id)).order("member_id").order("team_id").range(from, from + 999);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      teamRows = teamRows.concat((data ?? []) as TeamRow[]);
      if ((data ?? []).length < 1000) break;
    }
  }
  const teamIds = teamIdsByMember(members, teamRows);
  return NextResponse.json({
    members: members.map((member) => ({ ...member, team_ids: teamIds.get(member.id) ?? [] })),
    teams,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clubId = text(body?.clubId);
  const context = await getClubAdminContext(clubId, { permission: "members" });
  if (context.error) return context.error;
  const fullName = text(body?.full_name);
  const role = text(body?.role) || "member";
  if (!fullName || !roles.has(role)) return NextResponse.json({ error: "Tên thành viên hoặc vai trò không hợp lệ." }, { status: 400 });
  let permissions: string[] = [];
  if (body?.permissions !== undefined) {
    const parsed = readPermissions(body.permissions);
    if (!parsed) return NextResponse.json({ error: "Danh sách quyền không hợp lệ." }, { status: 400 });
    permissions = parsed;
  }
  if (permissions.length && role !== "admin") {
    return NextResponse.json({ error: "Chỉ thành viên Ban chủ chốt mới có quyền chức năng." }, { status: 400 });
  }
  if ((role !== "member" || permissions.length) && !context.isHead) {
    return NextResponse.json({ error: HEAD_ONLY_MESSAGE }, { status: 403 });
  }
  const contact = readContactFields(body);
  if ("error" in contact) return NextResponse.json({ error: contact.error }, { status: 400 });
  const parsedTeamIds = readTeamIds(body);
  if (parsedTeamIds === null) return NextResponse.json({ error: INVALID_TEAMS_MESSAGE }, { status: 400 });
  const teamIds = parsedTeamIds ?? [];
  if (!(await teamsBelongToClub(context.admin, clubId, teamIds))) return NextResponse.json({ error: TEAM_NOT_IN_CLUB_MESSAGE }, { status: 400 });
  // team_id không ghi trực tiếp: set_member_teams đặt ban chính và tập ban cùng lúc.
  const { data, error } = await context.admin.from("club_members").insert({
    ...contact.fields,
    club_id: clubId,
    full_name: fullName,
    student_code: text(body?.student_code) || null,
    class_name: text(body?.class_name) || null,
    role,
    permissions,
    is_active: body?.is_active !== false,
  }).select(MEMBER_COLUMNS).single();
  if (error) return NextResponse.json({ error: dbError(error) }, { status: 400 });
  if (teamIds.length) {
    const { error: teamsError } = await context.admin.rpc("set_member_teams", { p_member_id: data.id, p_team_ids: teamIds });
    if (teamsError) {
      // Không để lại thành viên dở dang khi không gán được ban.
      await context.admin.from("club_members").delete().eq("id", data.id).eq("club_id", clubId);
      return NextResponse.json({ error: teamsErrorMessage(teamsError.message) }, { status: 400 });
    }
  }
  const member = await loadMember(context.admin, data.id, clubId);
  return NextResponse.json({ member: member ?? { ...data, team_id: teamIds[0] ?? null, team_ids: teamIds } }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clubId = text(body?.clubId);
  const context = await getClubAdminContext(clubId, { permission: "members" });
  if (context.error) return context.error;
  const memberId = text(body?.id);
  if (!memberId) return NextResponse.json({ error: "Thiếu thành viên cần cập nhật." }, { status: 400 });
  const { data: current, error: lookupError } = await context.admin.from("club_members").select("id,user_id,role,permissions,is_head,is_active,team_id")
    .eq("id", memberId).eq("club_id", clubId).maybeSingle();
  if (lookupError || !current) return NextResponse.json({ error: "Không tìm thấy thành viên trong CLB này." }, { status: 404 });
  if (body?.is_active !== undefined && Boolean(body.is_active) !== current.is_active) {
    const blocked = requireHeadForStaffRow(context, current, "khóa hoặc mở khóa thành viên Ban chủ nhiệm hoặc Ban chủ chốt");
    if (blocked) return blocked;
  }
  let nextTeamIds = readTeamIds(body);
  if (nextTeamIds === null) return NextResponse.json({ error: INVALID_TEAMS_MESSAGE }, { status: 400 });
  let teamsToWrite: string[] | null = null;
  if (nextTeamIds !== undefined) {
    const currentTeamIds = await loadTeamIds(context.admin, memberId, current.team_id ?? null);
    if (!currentTeamIds) return NextResponse.json({ error: "Không đọc được ban của thành viên." }, { status: 500 });
    // Đường cũ (chỉ team_id): đặt làm ban chính, giữ các ban còn lại.
    if (body?.team_ids === undefined) nextTeamIds = [nextTeamIds[0], ...currentTeamIds.filter((id) => id !== nextTeamIds![0])];
    if (teamsChanged(currentTeamIds, current.team_id ?? null, nextTeamIds)) {
      const blocked = requireHeadForStaffRow(context, current, "đổi ban của thành viên Ban chủ nhiệm, Ban chủ chốt hoặc của chính mình", true);
      if (blocked) return blocked;
      teamsToWrite = nextTeamIds;
    }
  }
  if (current.role === "owner" && context.role !== "owner") {
    return NextResponse.json({ error: "Chỉ Ban chủ nhiệm mới có thể thay đổi thành viên Ban chủ nhiệm." }, { status: 403 });
  }
  if (current.user_id === context.user.id) {
    if (body?.is_active === false) return NextResponse.json({ error: "Không thể tự khóa tài khoản đang quản trị." }, { status: 400 });
    if (body?.role !== undefined && text(body.role) !== current.role) {
      return NextResponse.json({ error: "Không thể tự thay đổi vai trò của tài khoản đang quản trị." }, { status: 400 });
    }
  }
  if (current.is_head) {
    if (body?.is_active === false) return NextResponse.json({ error: "Chủ nhiệm hiện tại không thể bị khóa. Hãy đổi Chủ nhiệm qua nhiệm kỳ trước." }, { status: 400 });
    if (body?.role !== undefined && text(body.role) !== current.role) {
      return NextResponse.json({ error: "Chủ nhiệm chỉ đổi vai trò qua nhiệm kỳ mới." }, { status: 400 });
    }
  }
  // Đổi vai trò hoặc quyền chức năng: chỉ Chủ nhiệm (is_head không ghi được qua API, chỉ đổi qua nhiệm kỳ).
  const currentPermissions: string[] = Array.isArray(current.permissions) ? current.permissions : [];
  const nextRole = body?.role !== undefined ? text(body.role) : current.role;
  if (body?.role !== undefined && !roles.has(nextRole)) return NextResponse.json({ error: "Vai trò không hợp lệ." }, { status: 400 });
  let nextPermissions: string[] | null = null;
  if (body?.permissions !== undefined) {
    nextPermissions = readPermissions(body.permissions);
    if (!nextPermissions) return NextResponse.json({ error: "Danh sách quyền không hợp lệ." }, { status: 400 });
    if (nextPermissions.length && nextRole !== "admin") {
      return NextResponse.json({ error: "Chỉ thành viên Ban chủ chốt mới có quyền chức năng." }, { status: 400 });
    }
  }
  const roleChanged = nextRole !== current.role;
  const permissionsChanged = nextPermissions !== null && !samePermissions(nextPermissions, currentPermissions);
  if ((roleChanged || permissionsChanged) && !context.isHead) {
    return NextResponse.json({ error: HEAD_ONLY_MESSAGE }, { status: 403 });
  }
  const update: Record<string, unknown> = {};
  if (roleChanged && nextRole !== "admin") update.permissions = [];
  else if (permissionsChanged) update.permissions = nextPermissions;
  if (body?.full_name !== undefined) update.full_name = text(body.full_name);
  if (body?.student_code !== undefined) update.student_code = text(body.student_code) || null;
  if (body?.class_name !== undefined) update.class_name = text(body.class_name) || null;
  if (teamsToWrite && !(await teamsBelongToClub(context.admin, clubId, teamsToWrite))) {
    return NextResponse.json({ error: TEAM_NOT_IN_CLUB_MESSAGE }, { status: 400 });
  }
  if (roleChanged) update.role = nextRole;
  const contact = readContactFields(body);
  if ("error" in contact) return NextResponse.json({ error: contact.error }, { status: 400 });
  Object.assign(update, contact.fields);
  if (body?.is_active !== undefined) update.is_active = Boolean(body.is_active);
  if (!Object.keys(update).length && nextTeamIds === undefined) {
    return NextResponse.json({ error: "Không có thông tin cần cập nhật." }, { status: 400 });
  }
  if (Object.keys(update).length) {
    const { error } = await context.admin.from("club_members").update(update).eq("id", memberId).eq("club_id", clubId);
    if (error) return NextResponse.json({ error: dbError(error) }, { status: 400 });
  }
  if (teamsToWrite) {
    const { error: teamsError } = await context.admin.rpc("set_member_teams", { p_member_id: memberId, p_team_ids: teamsToWrite });
    if (teamsError) return NextResponse.json({ error: teamsErrorMessage(teamsError.message) }, { status: 400 });
  }
  const member = await loadMember(context.admin, memberId, clubId);
  if (!member) return NextResponse.json({ error: "Đã lưu nhưng không đọc lại được thành viên." }, { status: 500 });
  return NextResponse.json({ member });
}

export async function DELETE(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId") ?? "";
  const memberId = request.nextUrl.searchParams.get("id") ?? "";
  const context = await getClubAdminContext(clubId, { permission: "members" });
  if (context.error) return context.error;
  const { data: member } = await context.admin.from("club_members").select("id,user_id,role,is_head")
    .eq("id", memberId).eq("club_id", clubId).maybeSingle();
  if (!member) return NextResponse.json({ error: "Không tìm thấy thành viên trong CLB này." }, { status: 404 });
  const blocked = requireHeadForStaffRow(context, member, "xóa thành viên Ban chủ nhiệm hoặc Ban chủ chốt");
  if (blocked) return blocked;
  if (member.is_head) return NextResponse.json({ error: "Không thể xóa Chủ nhiệm hiện tại. Hãy đổi Chủ nhiệm qua nhiệm kỳ trước." }, { status: 400 });
  if (member.user_id === context.user.id) return NextResponse.json({ error: "Không thể xóa thành viên đang dùng để quản trị CLB." }, { status: 400 });
  const { count: supportCount, error: supportError } = await context.admin.from("interview_session_members")
    .select("session_id", { count: "exact", head: true }).eq("member_id", memberId);
  if (supportError) return NextResponse.json({ error: supportError.message }, { status: 500 });
  if (supportCount) return NextResponse.json({ error: "Thành viên đã được gán hỗ trợ phỏng vấn. Hãy gỡ khỏi các ca hoặc tạm ngừng hoạt động để giữ lịch sử." }, { status: 409 });
  const { error } = await context.admin.from("club_members").delete().eq("id", memberId).eq("club_id", clubId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
