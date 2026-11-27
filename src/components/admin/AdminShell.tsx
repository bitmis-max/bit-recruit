"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabase/client";
import { AdminClubProvider, type AdminClub } from "./AdminClubContext";
import { setAdminClubCookie } from "./adminClient";
import { EventsManager } from "./EventsManager";
import { ClubAccountsManager } from "./ClubAccountsManager";
import { ClubMembersManager } from "./ClubMembersManager";
import { FormTemplatesManager } from "./FormTemplatesManager";
import { TermsManager } from "./TermsManager";
import { TasksManager } from "./tasks/TasksManager";
import { ContributionBoard } from "./tasks/ContributionBoard";
import { ScanImport } from "./scan/ScanImport";
import { FramesManager } from "./frames/FramesManager";
import { roleLabel } from "./roles";
import { hasPermission, permissionLabel, type ClubPermission } from "../../lib/admin/permissions";
import { TeamsManager } from "./recruitment/TeamsManager";
import { RecruitmentManager } from "./recruitment/RecruitmentManager";
import { ApplicationsManager } from "./recruitment/ApplicationsManager";
import { InterviewsManager } from "./recruitment/InterviewsManager";
import { MailMergeApp } from "../MailMergeApp";
import { AdminOverview } from "./AdminOverview";
import { Button, ButtonLink } from "./ui/Button";
import { Icon, type IconName } from "./ui/Icon";
import { Notice } from "./ui/Notice";
import { PageHeader } from "./ui/PageHeader";

export type { AdminClub } from "./AdminClubContext";

function NoPermission({ permission }: { permission: ClubPermission }) {
  return <section className="mx-auto max-w-6xl p-5 sm:p-8"><PageHeader title={`Bạn chưa được cấp quyền “${permissionLabel(permission)}”`} /><Notice tone="warning" action={<ButtonLink href="/manage-clubs" variant="secondary" size="sm">Về trang Tổng quan</ButtonLink>}>Tài khoản của bạn chưa có quyền dùng mục này trong CLB hiện tại. Hãy nhờ Chủ nhiệm cấp quyền ở mục Thành viên.</Notice></section>;
}

export function AdminShell({ clubs, selectedClubId, email, children }: { clubs: AdminClub[]; selectedClubId: string; email: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [visitedTabs, setVisitedTabs] = useState<string[]>([pathname]);
  useEffect(() => {
    setVisitedTabs((visited) => visited.includes(pathname) ? visited : [...visited, pathname]);
  }, [pathname]);
  const current = clubs.find((club) => club.id === selectedClubId) ?? null;
  const isStaff = current?.role === "owner" || current?.role === "admin";
  const can = (permission?: ClubPermission) => !permission || hasPermission(current?.role, current?.permissions, permission);
  useEffect(() => {
    if (selectedClubId) setAdminClubCookie(selectedClubId);
  }, [selectedClubId]);
  async function selectClub(id: string) {
    setAdminClubCookie(id);
    router.refresh();
  }
  async function signOut() {
    await getSupabaseClient()?.auth.signOut();
    router.replace("/login");
  }
  if (!clubs.length) return <main className="mx-auto max-w-xl p-10"><h1 className="text-xl font-bold">Chưa có CLB được gán</h1><p className="mt-2 text-sm text-zinc-600">Tài khoản cần có thành viên đang hoạt động trong bảng club_members.</p><Button variant="secondary" onClick={signOut} className="mt-5">Đăng xuất</Button></main>;
  const navGroups: { title?: string; links: { href: string; label: string; icon: IconName; allowed: boolean }[] }[] = [
    { links: [{ href: "/manage-clubs", label: "Tổng quan", icon: "home", allowed: true }] },
    { title: "CLB", links: [
      { href: "/manage-clubs/members", label: "Thành viên", icon: "users", allowed: can("members") },
      { href: "/manage-clubs/accounts", label: "Tài khoản", icon: "key", allowed: can("members") },
      { href: "/manage-clubs/teams", label: "Ban", icon: "layers", allowed: can("members") },
      { href: "/manage-clubs/terms", label: "Nhiệm kỳ", icon: "history", allowed: isStaff },
    ] },
    { title: "Tuyển thành viên", links: [
      { href: "/manage-clubs/recruitment", label: "Đợt tuyển", icon: "flag", allowed: can("recruitment") },
      { href: "/manage-clubs/recruitment/applications", label: "Đơn ứng tuyển", icon: "file", allowed: can("recruitment") },
      { href: "/manage-clubs/recruitment/interviews", label: "Phỏng vấn", icon: "chat", allowed: can("recruitment") },
      { href: "/manage-clubs/form-templates", label: "Biểu mẫu", icon: "clipboard", allowed: can("recruitment") },
    ] },
    { title: "Hoạt động", links: [
      { href: "/manage-clubs/tasks", label: "Giao việc", icon: "check-square", allowed: isStaff },
      { href: "/manage-clubs/contribution", label: "Đóng góp", icon: "chart", allowed: isStaff },
      { href: "/manage-clubs/events", label: "Sự kiện", icon: "calendar", allowed: can("events") },
    ] },
    { title: "Truyền thông", links: [
      { href: "/manage-clubs/mail", label: "Gửi mail", icon: "mail", allowed: can("mail") },
      { href: "/manage-clubs/scan", label: "Đối chiếu Facebook", icon: "link", allowed: can("facebook") },
      { href: "/manage-clubs/frames", label: "Khung avatar", icon: "image", allowed: can("facebook") },
    ] },
  ];
  const groups = navGroups.map((group) => ({ ...group, links: group.links.filter((link) => link.allowed) })).filter((group) => group.links.length);
  const currentLabel = groups.flatMap((group) => group.links).find((link) => link.href === pathname)?.label ?? "Tổng quan";
  // `permission`: quyền chức năng cần có; thiếu thì hiện thông báo thay vì nội dung (kể cả khi vào thẳng URL).
  const tabViews: { href: string; permission?: ClubPermission; content: React.ReactNode }[] = [
    { href: "/manage-clubs", content: <AdminOverview /> },
    { href: "/manage-clubs/accounts", permission: "members", content: <ClubAccountsManager /> },
    { href: "/manage-clubs/members", permission: "members", content: <ClubMembersManager /> },
    { href: "/manage-clubs/teams", permission: "members", content: <TeamsManager /> },
    { href: "/manage-clubs/terms", content: <TermsManager /> },
    { href: "/manage-clubs/tasks", content: <TasksManager /> },
    { href: "/manage-clubs/contribution", content: <ContributionBoard /> },
    { href: "/manage-clubs/scan", permission: "facebook", content: <ScanImport /> },
    { href: "/manage-clubs/frames", permission: "facebook", content: <FramesManager /> },
    { href: "/manage-clubs/events", permission: "events", content: <EventsManager /> },
    { href: "/manage-clubs/recruitment", permission: "recruitment", content: <RecruitmentManager /> },
    { href: "/manage-clubs/recruitment/applications", permission: "recruitment", content: <ApplicationsManager /> },
    { href: "/manage-clubs/recruitment/interviews", permission: "recruitment", content: <InterviewsManager /> },
    { href: "/manage-clubs/form-templates", permission: "recruitment", content: <FormTemplatesManager /> },
    { href: "/manage-clubs/mail", permission: "mail", content: <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8"><MailMergeApp /></div> },
  ];
  const activeTab = tabViews.find((tab) => tab.href === pathname);
  // Keep visited tab trees mounted so their loaded data and form state survive navigation.
  const visibleTabs = tabViews.filter((tab) => visitedTabs.includes(tab.href) || tab.href === activeTab?.href);
  return <AdminClubProvider value={{ id: selectedClubId, role: current?.role ?? "member", permissions: current?.permissions ?? [], isHead: current?.isHead ?? false, teamId: current?.teamId ?? null, title: current?.title ?? null }}><div className="min-h-screen bg-zinc-50 text-zinc-900 md:flex">
    {/* Desktop: thanh bên đứng yên bằng chiều cao màn hình, tự cuộn nếu dài; nút Đăng xuất luôn ở đáy màn hình. */}
    <aside className="flex w-full flex-col border-r bg-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto">
      <div className="border-b p-5"><Link href="/" className="text-xs font-bold uppercase tracking-widest text-emerald-700">BIT · Quản trị</Link><label className="mt-5 block text-xs font-semibold text-zinc-500">CLB hiện tại</label>
        <select aria-label="Chọn CLB" value={selectedClubId} onChange={(e) => void selectClub(e.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm">{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select>
        {current && <div className="mt-2 text-xs text-zinc-500"><p>Vai trò: <span className="font-semibold text-emerald-800">{roleLabel(current.role)}</span>{current.isHead && <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-emerald-700 px-2 py-0.5 font-semibold text-white">Chủ nhiệm</span>}</p>{current.title && <p className="mt-1 break-words">Chức danh: <span className="font-medium text-zinc-700">{current.title}</span></p>}</div>}
      </div>
      <button type="button" aria-expanded={menuOpen} aria-controls="admin-nav" onClick={() => setMenuOpen((open) => !open)} className="flex items-center justify-between border-b px-5 py-3 text-sm font-semibold text-zinc-700 md:hidden"><span className="inline-flex items-center gap-2"><Icon name="menu" /><span>Menu · <span className="text-emerald-800">{currentLabel}</span></span></span><Icon name="chevron-down" className={menuOpen ? "rotate-180" : ""} /></button>
      <nav id="admin-nav" aria-label="Điều hướng quản trị" className={`${menuOpen ? "block" : "hidden"} p-3 md:block`}>{groups.map((group, index) => <div key={group.title ?? index} className={group.title ? "mt-6" : ""}>
        {/* Tiêu đề nhóm: chữ thường (chữ hoa tiếng Việt có dấu bị chật); cách nhóm trên rộng hơn khoảng cách giữa các mục. */}
        {group.title && <p className="px-3 pb-2 text-xs font-medium text-zinc-500">{group.title}</p>}
        <ul className="space-y-0.5">{group.links.map((link) => {
          const active = pathname === link.href;
          return <li key={link.href}><Link href={link.href} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)} className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600 ${active ? "bg-emerald-50 font-semibold text-emerald-800" : "font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"}`}><Icon name={link.icon} className={active ? "text-emerald-700" : "text-zinc-400"} />{link.label}</Link></li>;
        })}</ul>
      </div>)}</nav>
      <div className={`${menuOpen ? "block" : "hidden"} mt-auto border-t p-4 md:block`}><p className="truncate text-xs text-zinc-500">{email}</p><Button variant="ghost" size="sm" onClick={signOut} className="mt-2 -ml-3 hover:text-rose-700">Đăng xuất</Button></div>
    </aside>
    <main className="min-w-0 flex-1">{visibleTabs.map((tab) => <div key={tab.href} hidden={tab.href !== activeTab?.href}>{can(tab.permission) ? tab.content : <NoPermission permission={tab.permission!} />}</div>)}{!activeTab && children}</main>
  </div></AdminClubProvider>;
}
