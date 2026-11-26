// Chỉ dùng phía server (service-role). Thu hồi token Gmail đã lưu của một tài khoản.
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Xóa `google_mail_tokens` của `userId` khi tài khoản không còn là owner/admin đang hoạt động ở CLB nào.
 * Gọi SAU khi đã cập nhật dòng thành viên. Lỗi chỉ ghi log (không có token/email), không ném ra.
 */
export async function revokeMailTokenIfNoStaffRole(admin: SupabaseClient, userId: string | null): Promise<void> {
  if (!userId) return;
  try {
    const { data, error } = await admin.from("club_members").select("id")
      .eq("user_id", userId).eq("is_active", true).in("role", ["owner", "admin"]).limit(1);
    if (error) throw error;
    if (data?.length) return;
    const { error: deleteError } = await admin.from("google_mail_tokens").delete().eq("user_id", userId);
    if (deleteError) throw deleteError;
  } catch (error) {
    console.error(`[admin/mail-token] Không xóa được token Gmail (user ${userId}): ${error instanceof Error ? error.message : (error as { message?: string })?.message ?? ""}`);
  }
}
