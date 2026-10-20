"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const socialLinks = [
  { name: "Facebook", url: "https://www.facebook.com/BIT.BAV", icon: "f", className: "bg-[#1877f2]" },
  { name: "Instagram", url: "https://www.instagram.com/bit.bav.official", icon: "◎", className: "bg-[#e1306c]" },
  { name: "TikTok", url: "https://www.tiktok.com/@humansofbitbav", icon: "♪", className: "bg-[#111827]" },
];

function ContactIcon({ type }: { type: "email" | "location" | "phone" }) {
  const paths = {
    email: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m3 6 9 7 9-7" /></>,
    location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.8 2.1Z" />,
  };

  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[17px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

export function PublicFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/manage-clubs")) return null;

  return (
    <footer className="mt-auto w-full bg-[#0c304d] text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8 sm:py-6">
        <Link href="/" className="mx-auto flex max-w-3xl items-center justify-center gap-4 sm:gap-6">
          <Image src="/logo.png" alt="Logo CLB Tin học Ngân hàng BIT" width={64} height={64} className="size-14 shrink-0 object-contain sm:size-16" />
          <span className="border-l border-white/40 pl-4 text-[17px] font-bold uppercase leading-snug tracking-wide text-white sm:pl-6 sm:text-xl">
            CLB Tin học Ngân hàng BIT - BAV<br />Học viện Ngân hàng
          </span>
        </Link>

        <div className="mt-7 grid gap-7 sm:grid-cols-2 sm:gap-10">
          <section aria-labelledby="footer-contact-title">
            <h2 id="footer-contact-title" className="mb-2 text-base font-medium text-white">Contact:</h2>
            <ul className="space-y-2.5 text-[13px] leading-6 text-slate-100">
              <li className="flex items-start gap-3"><ContactIcon type="email" /><a className="hover:underline" href="mailto:bit.mis@bav.edu.vn">Gmail: bit.mis@bav.edu.vn</a></li>
              <li className="flex items-start gap-3"><ContactIcon type="location" /><span>Địa chỉ: Số 12 Phố Chùa Bộc, Quang Trung, Đống Đa, Hà Nội</span></li>
              <li className="flex items-start gap-3"><ContactIcon type="phone" /><a className="hover:underline" href="tel:0325302188">Hotline: 0325302188 (Miss.Nhu)</a></li>
            </ul>
          </section>

          <section aria-labelledby="footer-social-title">
            <h2 id="footer-social-title" className="mb-2 text-base font-medium text-white">Follow us:</h2>
            <ul className="space-y-2.5 text-[13px] leading-6 text-slate-100">
              {socialLinks.map((social) => (
                <li key={social.name} className="flex items-start gap-3">
                  <span className={`grid size-5 shrink-0 place-items-center rounded-sm ${social.className} text-sm font-bold leading-none text-white`} aria-hidden="true">{social.icon}</span>
                  <a href={social.url} target="_blank" rel="noreferrer" className="break-all hover:underline">{social.name}: {social.url}</a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </footer>
  );
}
