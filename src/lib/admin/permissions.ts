// Quyền chức năng của Ban chủ chốt (admin). Thuần TS, không import: dùng được cả ở server lẫn client.
export const CLUB_PERMISSIONS = [
  { code: "events", label: "Quản lý sự kiện" },
  { code: "recruitment", label: "Tuyển thành viên" },
  { code: "members", label: "Quản lý thành viên" },
  { code: "mail", label: "Gửi mail" },
  { code: "facebook", label: "Đối chiếu Facebook & khung avatar" },
] as const;

export type ClubPermission = (typeof CLUB_PERMISSIONS)[number]["code"];

export function isClubPermission(value: unknown): value is ClubPermission {
  return CLUB_PERMISSIONS.some((permission) => permission.code === value);
}

export function permissionLabel(code: ClubPermission): string {
  return CLUB_PERMISSIONS.find((permission) => permission.code === code)!.label;
}

// owner có mọi quyền; admin chỉ có quyền được tick; còn lại không có quyền nào.
export function hasPermission(role: string | null | undefined, permissions: readonly string[] | null | undefined, code: ClubPermission): boolean {
  if (role === "owner") return true;
  return role === "admin" && Boolean(permissions?.includes(code));
}
