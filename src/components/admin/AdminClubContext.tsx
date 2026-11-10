"use client";

import { createContext, useContext } from "react";
import { hasPermission, type ClubPermission } from "../../lib/admin/permissions";

// Thông tin của chính người đang đăng nhập trong CLB (đọc từ club_members).
export type AdminClub = { id: string; name: string; role: string; permissions: string[]; isHead: boolean; teamId: string | null; title: string | null };
export type CurrentAdminClubValue = Omit<AdminClub, "name">;

const CurrentAdminClub = createContext<CurrentAdminClubValue | null>(null);

export function useCurrentAdminClub() {
  const value = useContext(CurrentAdminClub);
  if (!value) throw new Error("Admin club context is unavailable");
  return { ...value, can: (permission: ClubPermission) => hasPermission(value.role, value.permissions, permission) };
}

export const AdminClubProvider = CurrentAdminClub.Provider;
