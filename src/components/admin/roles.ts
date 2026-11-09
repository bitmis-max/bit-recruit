export const roleLabels: Record<string, string> = { owner: "Ban chủ nhiệm", admin: "Ban chủ chốt", member: "Thành viên" };

export function roleLabel(role: string) {
  return roleLabels[role] ?? role;
}

export const facebookUrlPattern = /^https:\/\/(www\.|m\.|web\.)?(facebook|fb)\.com\/.+/;
