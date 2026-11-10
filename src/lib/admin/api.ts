import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../supabase/server";

export async function getClubAdminContext(clubId: string, allowClubStaffRead = false) {
  if (!clubId) return { error: Response.json({ error: "Thiếu CLB." }, { status: 400 }) } as const;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: Response.json({ error: "Chưa cấu hình Supabase." }, { status: 503 }) } as const;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "Bạn cần đăng nhập." }, { status: 401 }) } as const;
  const { data: membership } = await supabase.from("club_members").select("role")
    .eq("club_id", clubId).eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (!membership || (!allowClubStaffRead && !["owner", "admin"].includes(membership.role))) {
    return { error: Response.json({ error: "Bạn không có quyền quản lý CLB này." }, { status: 403 }) } as const;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { error: Response.json({ error: "Thiếu SUPABASE_SERVICE_ROLE_KEY để quản lý tài khoản và thành viên." }, { status: 503 }) } as const;
  }
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return { supabase, admin, user, role: membership.role, error: null } as const;
}
