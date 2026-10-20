"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/manage-clubs/recruitment", label: "Quản lý đợt tuyển" },
  { href: "/manage-clubs/recruitment/applications", label: "Quản lý đơn ứng tuyển" },
  { href: "/manage-clubs/recruitment/interviews", label: "Quản lý phỏng vấn" },
];

export function RecruitmentTabs() {
  const pathname = usePathname();
  return <nav aria-label="Các mục tuyển gen" className="flex gap-2 overflow-x-auto border-b border-zinc-200 px-5 sm:px-8">
    {tabs.map((tab) => {
      const active = pathname === tab.href;
      return <Link key={tab.href} href={tab.href} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold ${active ? "border-emerald-700 text-emerald-800" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}>{tab.label}</Link>;
    })}
  </nav>;
}
