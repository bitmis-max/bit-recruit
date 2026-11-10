import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../supabase/server";
import { hasPermission, permissionLabel, type ClubPermission } from "./permissions";

type ContextOptions = {
  /** Quyền chức năng bắt buộc (owner luôn có; admin phải được cấp). */
  permission?: ClubPermission;
  /** Chỉ Chủ nhiệm (owner có cờ is_head). */
  head?: true;
};

export async function getClubAdminContext(clubId: string, options: ContextOptions = {}) {
  if (!clubId) return { error: Response.json({ error: "Thiếu CLB." }, { status: 400 }) } as const;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: Response.json({ error: "Chưa cấu hình Supabase." }, { status: 503 }) } as const;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "Bạn cần đăng nhập." }, { status: 401 }) } as const;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { error: Response.json({ error: "Thiếu SUPABASE_SERVICE_ROLE_KEY để quản lý tài khoản và thành viên." }, { status: 503 }) } as const;
  }
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Đọc dòng thành viên của chính người dùng (đã xác thực) bằng service-role, không phụ thuộc cột nào được grant cho authenticated.
  const { data: membership, error: membershipError } = await admin.from("club_members")
    .select("role,permissions,is_head,team_id")
    .eq("club_id", clubId).eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (membershipError) return { error: Response.json({ error: "Không kiểm tra được quyền của bạn. Vui lòng thử lại." }, { status: 500 }) } as const;
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: Response.json({ error: "Bạn không có quyền quản lý CLB này." }, { status: 403 }) } as const;
  }

  const permissions: string[] = Array.isArray(membership.permissions) ? membership.permissions : [];
  const isHead = membership.role === "owner" && membership.is_head === true;
  if (options.head && !isHead) {
    return { error: Response.json({ error: "Chỉ Chủ nhiệm mới có thể thực hiện thao tác này." }, { status: 403 }) } as const;
  }
  if (options.permission && !hasPermission(membership.role, permissions, options.permission)) {
    return { error: Response.json({ error: `Bạn không có quyền ${permissionLabel(options.permission)} trong CLB này.` }, { status: 403 }) } as const;
  }
  return {
    supabase, admin, user, role: membership.role as string, permissions, isHead,
    teamId: (membership.team_id ?? null) as string | null, error: null,
  } as const;
}
