import type { SupabaseClient, User } from "@supabase/supabase-js";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UserIndex = Map<string, User>;

// Tải một lần toàn bộ tài khoản để tra theo email (dùng cho thao tác hàng loạt).
export async function loadUserIndex(admin: SupabaseClient): Promise<UserIndex> {
  const index: UserIndex = new Map();
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const user of data.users) if (user.email) index.set(user.email.toLowerCase(), user);
    if (data.users.length < 1000) break;
  }
  return index;
}

export async function findUserByEmail(admin: SupabaseClient, email: string, index?: UserIndex) {
  const key = email.toLowerCase();
  if (index) return index.get(key) ?? null;
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const match = data.users.find((user: { email?: string }) => user.email?.toLowerCase() === key);
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

export const UNVERIFIED_ACCOUNT_MESSAGE = "Tài khoản có email này chưa xác thực, không thể gắn tự động.";

// Chỉ gắn tài khoản có sẵn khi email đã xác thực hoặc đăng nhập bằng Google, tránh chiếm quyền bằng tài khoản đăng ký trước.
export function isLinkableUser(user: User): boolean {
  if (user.email_confirmed_at) return true;
  return (user.identities ?? []).some((identity) => identity.provider === "google");
}

export type ProvisionResult =
  | { ok: true; status: "created" | "linked"; userId: string }
  | { ok: false; httpStatus: number; message: string };

// Tạo tài khoản (đã xác nhận email, không gửi mail) hoặc gắn tài khoản có sẵn cùng email vào thành viên.
// Thành viên đăng nhập bằng Google cùng email.
export async function createOrLinkMemberAccount(
  admin: SupabaseClient,
  params: { clubId: string; memberId: string; fullName: string; email: string; index?: UserIndex },
): Promise<ProvisionResult> {
  const { clubId, memberId, fullName, email, index } = params;
  let account = await findUserByEmail(admin, email, index);
  let created = false;
  if (!account) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      // Có thể tài khoản vừa được tạo ở nơi khác: thử tra lại một lần.
      account = await findUserByEmail(admin, email);
      if (!account) return { ok: false, httpStatus: 400, message: "Không tạo được tài khoản cho email này." };
    } else {
      account = data.user;
      created = true;
    }
    index?.set(email.toLowerCase(), account);
  }
  if (!created && !isLinkableUser(account)) return { ok: false, httpStatus: 409, message: UNVERIFIED_ACCOUNT_MESSAGE };

  const rollback = async () => {
    if (created) {
      await admin.auth.admin.deleteUser(account!.id);
      index?.delete(email.toLowerCase());
    }
  };
  const { data: duplicate } = await admin.from("club_members").select("id")
    .eq("club_id", clubId).eq("user_id", account.id).maybeSingle();
  if (duplicate) {
    await rollback();
    return { ok: false, httpStatus: 409, message: "Tài khoản này đã được gán cho thành viên khác trong CLB." };
  }
  const { error: linkError } = await admin.from("club_members").update({ user_id: account.id })
    .eq("id", memberId).eq("club_id", clubId);
  if (linkError) {
    await rollback();
    return { ok: false, httpStatus: 400, message: "Không gán được tài khoản cho thành viên." };
  }
  return { ok: true, status: created ? "created" : "linked", userId: account.id };
}
