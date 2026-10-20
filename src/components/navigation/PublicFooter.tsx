"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/clubs", label: "Danh sách CLB" },
  { href: "/positions", label: "Đợt tuyển thành viên" },
  { href: "/guide", label: "Tra cứu và hướng dẫn" },
];

const socialLinks = [
  { name: "Facebook", icon: "f" },
  { name: "Instagram", icon: "◎" },
  { name: "YouTube", icon: "▶" },
  { name: "TikTok", icon: "♪" },
];

export function PublicFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/manage-clubs")) return null;

  return (
    <footer className="mt-auto w-full bg-[#0c304d] text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-9">
        <div className="grid gap-8 pb-6 md:grid-cols-2">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight text-white">
              <span className="grid size-9 place-items-center rounded-md bg-white text-[#0c304d]" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19M15 14h1a4 4 0 0 1 4 4v1" /></svg>
              </span>
              BIT
            </Link>
            <p className="mt-2 text-sm leading-6 text-slate-200">Khám phá. Kết nối đam mê. Phát triển bản thân.</p>
          </div>

          <div className="md:justify-self-end">
            <h2 className="font-semibold text-white">Theo dõi chúng tôi</h2>
            <p className="mt-2 max-w-md text-sm leading-5 text-slate-200">Cập nhật thông tin tuyển thành viên và hoạt động cộng đồng.</p>
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Các kênh mạng xã hội">
              {socialLinks.map((social) => (
                <div key={social.name} className="flex min-w-[68px] flex-col items-center justify-center gap-1 rounded-md border border-slate-500/70 px-2 py-2 text-xs text-white">
                  <span className="h-4 text-base font-semibold leading-4" aria-hidden="true">{social.icon}</span>
                  {social.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-7 border-t border-slate-500/50 py-6 sm:grid-cols-2">
          <nav aria-label="Khám phá">
            <h2 className="font-semibold text-white">Khám phá</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-200">
              {links.map((link) => <li key={link.href}><Link href={link.href} className="transition hover:text-white">{link.label}</Link></li>)}
            </ul>
          </nav>
          <nav aria-label="Hỗ trợ">
            <h2 className="font-semibold text-white">Hỗ trợ</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-200">
              <li><Link href="/guide" className="transition hover:text-white">Câu hỏi thường gặp</Link></li>
              <li><Link href="/guide" className="transition hover:text-white">Liên hệ và hỗ trợ</Link></li>
              <li><Link href="/guide" className="transition hover:text-white">Chính sách bảo mật</Link></li>
            </ul>
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-500/50 pt-5 text-xs text-slate-200 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} BIT. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
