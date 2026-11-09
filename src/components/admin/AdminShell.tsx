"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabase/client";
import { AdminClubProvider, type AdminClub } from "./AdminClubContext";
import { EventsManager } from "./EventsManager";
import { ClubAccountsManager } from "./ClubAccountsManager";
import { ClubMembersManager } from "./ClubMembersManager";
import { FormTemplatesManager } from "./FormTemplatesManager";
import { TermsManager } from "./TermsManager";
import { TasksManager } from "./tasks/TasksManager";
import { ContributionBoard } from "./tasks/ContributionBoard";
import { roleLabel } from "./roles";
import { TeamsManager } from "./recruitment/TeamsManager";
import { RecruitmentManager } from "./recruitment/RecruitmentManager";
import { ApplicationsManager } from "./recruitment/ApplicationsManager";
import { InterviewsManager } from "./recruitment/InterviewsManager";
import { RecruitmentTabs } from "./recruitment/RecruitmentTabs";
import { MailMergeApp } from "../MailMergeApp";

export type { AdminClub } from "./AdminClubContext";

export function AdminShell({ clubs, selectedClubId, email, children }: { clubs: AdminClub[]; selectedClubId: string; email: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [visitedTabs, setVisitedTabs] = useState<string[]>([pathname]);
  useEffect(() => {
    setVisitedTabs((visited) => visited.includes(pathname) ? visited : [...visited, pathname]);
  }, [pathname]);
  const current = clubs.find((club) => club.id === selectedClubId) ?? null;
  const canWrite = current?.role === "owner" || current?.role === "admin";
  useEffect(() => {
    if (selectedClubId) document.cookie = `admin_club=${encodeURIComponent(selectedClubId)}; Path=/manage-clubs; SameSite=Lax; Max-Age=2592000`;
  }, [selectedClubId]);
  async function selectClub(id: string) {
    document.cookie = `admin_club=${encodeURIComponent(id)}; Path=/manage-clubs; SameSite=Lax; Max-Age=2592000`;
    router.refresh();
  }
  async function signOut() {
    await getSupabaseClient()?.auth.signOut();
    router.replace("/login");
  }
  if (!clubs.length) return <main className="mx-auto max-w-xl p-10"><h1 className="text-xl font-bold">Chưa có CLB được gán</h1><p className="mt-2 text-sm text-zinc-600">Tài khoản cần có thành viên đang hoạt động trong bảng club_members.</p><button onClick={signOut} className="mt-5 rounded-lg border px-4 py-2">Đăng xuất</button></main>;
  const links = [
    { href: "/manage-clubs", label: "Tổng quan", allowed: true },
    { href: "/manage-clubs/accounts", label: "Quản lý tài khoản", allowed: canWrite },
    { href: "/manage-clubs/members", label: "Quản lý thành viên", allowed: canWrite },
    { href: "/manage-clubs/teams", label: "Quản lí ban", allowed: canWrite },
    { href: "/manage-clubs/terms", label: "Nhiệm kỳ", allowed: canWrite },
    { href: "/manage-clubs/tasks", label: "Giao việc", allowed: canWrite },
    { href: "/manage-clubs/contribution", label: "Đóng góp", allowed: canWrite },
    { href: "/manage-clubs/events", label: "Quản lý sự kiện", allowed: canWrite },
    { href: "/manage-clubs/recruitment", label: "Quản lý tuyển gen", allowed: true },
    { href: "/manage-clubs/form-templates", label: "Quản lý biểu mẫu", allowed: canWrite },
    { href: "/manage-clubs/mail", label: "Gửi mail", allowed: canWrite },
  ];
  const tabViews = [
    { href: "/manage-clubs", content: <section className="mx-auto max-w-5xl p-6 sm:p-10"><p className="text-sm font-semibold text-emerald-700">Quản trị CLB</p><h1 className="mt-2 text-3xl font-bold">Tổng quan</h1><p className="mt-3 text-zinc-600">Chọn CLB ở thanh bên để làm việc trong đúng không gian.</p></section> },
    { href: "/manage-clubs/accounts", content: <ClubAccountsManager /> },
    { href: "/manage-clubs/members", content: <ClubMembersManager /> },
    { href: "/manage-clubs/teams", content: <TeamsManager /> },
    { href: "/manage-clubs/terms", content: <TermsManager /> },
    { href: "/manage-clubs/tasks", content: <TasksManager /> },
    { href: "/manage-clubs/contribution", content: <ContributionBoard /> },
    { href: "/manage-clubs/events", content: <EventsManager /> },
    { href: "/manage-clubs/recruitment", content: <><RecruitmentTabs /><RecruitmentManager /></> },
    { href: "/manage-clubs/recruitment/applications", content: <><RecruitmentTabs /><ApplicationsManager /></> },
    { href: "/manage-clubs/recruitment/interviews", content: <><RecruitmentTabs /><InterviewsManager /></> },
    { href: "/manage-clubs/form-templates", content: <FormTemplatesManager /> },
    { href: "/manage-clubs/mail", content: <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8"><MailMergeApp /></main> },
  ];
  const activeTab = tabViews.find((tab) => tab.href === pathname);
  // Keep visited tab trees mounted so their loaded data and form state survive navigation.
  const visibleTabs = tabViews.filter((tab) => visitedTabs.includes(tab.href) || tab.href === activeTab?.href);
  return <AdminClubProvider value={{ id: selectedClubId, role: current?.role ?? "member" }}><div className="min-h-screen bg-zinc-50 text-zinc-900 md:flex">
    <aside className="flex w-full flex-col border-r bg-white md:min-h-screen md:w-64">
      <div className="border-b p-5"><Link href="/" className="text-xs font-bold uppercase tracking-widest text-emerald-700">BIT · Quản trị</Link><label className="mt-5 block text-xs font-semibold text-zinc-500">CLB hiện tại</label>
        <select aria-label="Chọn CLB" value={selectedClubId} onChange={(e) => void selectClub(e.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm">{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select>
        {current && <p className="mt-2 text-xs text-zinc-500">Vai trò: <span className="font-semibold text-emerald-800">{roleLabel(current.role)}</span></p>}
      </div>
      <nav aria-label="Điều hướng quản trị" className="flex flex-wrap gap-1 p-3 md:flex-col">{links.filter((link) => link.allowed).map((link) => {
        const active = link.href === "/manage-clubs" ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return <Link key={link.href} href={link.href} className={`rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-emerald-50 text-emerald-800" : "text-zinc-600 hover:bg-zinc-100"}`}>{link.label}</Link>;
      })}</nav>
      <div className="mt-auto border-t p-4"><p className="truncate text-xs text-zinc-500">{email}</p><button onClick={signOut} className="mt-2 text-sm font-medium text-zinc-700 hover:text-rose-700">Đăng xuất</button></div>
    </aside>
    <main className="min-w-0 flex-1">{visibleTabs.map((tab) => <div key={tab.href} hidden={tab.href !== activeTab?.href}>{tab.content}</div>)}{!activeTab && children}</main>
  </div></AdminClubProvider>;
}
