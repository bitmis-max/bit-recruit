"use client";

import Link from "next/link";
import { createContext, useContext, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabase/client";

export type AdminClub = { id: string; name: string; role: string };
const CurrentAdminClub = createContext<{ id: string; role: string } | null>(null);

export function useCurrentAdminClub() {
  const value = useContext(CurrentAdminClub);
  if (!value) throw new Error("Admin club context is unavailable");
  return value;
}

export function AdminShell({ clubs, selectedClubId, email, children }: { clubs: AdminClub[]; selectedClubId: string; email: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = clubs.find((club) => club.id === selectedClubId) ?? null;
  const canWrite = current?.role === "owner" || current?.role === "admin";
  useEffect(() => {
    if (selectedClubId) document.cookie = `admin_club=${encodeURIComponent(selectedClubId)}; Path=/admin; SameSite=Lax; Max-Age=2592000`;
  }, [selectedClubId]);
  async function selectClub(id: string) {
    document.cookie = `admin_club=${encodeURIComponent(id)}; Path=/admin; SameSite=Lax; Max-Age=2592000`;
    router.refresh();
  }
  async function signOut() {
    await getSupabaseClient()?.auth.signOut();
    router.replace("/login");
  }
  if (!clubs.length) return <main className="mx-auto max-w-xl p-10"><h1 className="text-xl font-bold">Chưa có CLB được gán</h1><p className="mt-2 text-sm text-zinc-600">Tài khoản cần có thành viên đang hoạt động trong bảng club_members.</p><button onClick={signOut} className="mt-5 rounded-lg border px-4 py-2">Đăng xuất</button></main>;
  const links = [{ href: "/admin", label: "Tổng quan", allowed: true }, { href: "/admin/recruitment", label: "Quản lý tuyển gen", allowed: true }, { href: "/admin/mail", label: "Gửi mail", allowed: canWrite }];
  return <CurrentAdminClub.Provider value={{ id: selectedClubId, role: current?.role ?? "organizer" }}><div className="min-h-screen bg-zinc-50 text-zinc-900 md:flex">
    <aside className="flex w-full flex-col border-r bg-white md:min-h-screen md:w-64">
      <div className="border-b p-5"><Link href="/" className="text-xs font-bold uppercase tracking-widest text-emerald-700">BIT · Quản trị</Link><label className="mt-5 block text-xs font-semibold text-zinc-500">CLB hiện tại</label>
        <select aria-label="Chọn CLB" value={selectedClubId} onChange={(e) => void selectClub(e.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm">{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select>
        <p className="mt-2 text-xs text-zinc-500">Vai trò: {current?.role ?? "organizer"}</p>
      </div>
      <nav aria-label="Điều hướng quản trị" className="flex gap-1 p-3 md:flex-col">{links.filter((link) => link.allowed).map((link) => <Link key={link.href} href={link.href} className={`rounded-lg px-3 py-2 text-sm font-medium ${pathname === link.href ? "bg-emerald-50 text-emerald-800" : "text-zinc-600 hover:bg-zinc-100"}`}>{link.label}</Link>)}</nav>
      <div className="mt-auto border-t p-4"><p className="truncate text-xs text-zinc-500">{email}</p><button onClick={signOut} className="mt-2 text-sm font-medium text-zinc-700 hover:text-rose-700">Đăng xuất</button></div>
    </aside>
    <main className="min-w-0 flex-1">{children}</main>
  </div></CurrentAdminClub.Provider>;
}
