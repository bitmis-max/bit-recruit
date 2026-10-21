"use client";

import { createContext, useContext } from "react";

export type AdminClub = { id: string; name: string; role: string };

const CurrentAdminClub = createContext<{ id: string; role: string } | null>(null);

export function useCurrentAdminClub() {
  const value = useContext(CurrentAdminClub);
  if (!value) throw new Error("Admin club context is unavailable");
  return value;
}

export const AdminClubProvider = CurrentAdminClub.Provider;
