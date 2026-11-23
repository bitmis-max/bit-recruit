"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../lib/supabase/client";

type Membership = { role: string; club_id: string };
type ClubOption = { id: string; name: string };

// Các trang có ảnh hero tối ở đầu trang: thanh điều hướng trong suốt đè lên ảnh.
const OVERLAY_PATHS = ["/clubs", "/events", "/positions"];

const NAV_LINKS = [
  { href: "/", label: "Trang chủ", isActive: (path: string) => path === "/" },
  { href: "/clubs", label: "Giới thiệu", isActive: (path: string) => path.startsWith("/clubs") },
  { href: "/events", label: "Sự kiện", isActive: (path: string) => path.startsWith("/events") },
];

export function PublicNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [managedClubs, setManagedClubs] = useState<ClubOption[]>([]);
  const [hasMembership, setHasMembership] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const syncUser = async (nextUser: User | null) => {
      if (!active) return;
      setUser(nextUser);
      if (!nextUser) {
        setManagedClubs([]);
        setHasMembership(false);
        return;
      }
      const { data } = await supabase.from("club_members").select("role,club_id")
        .eq("user_id", nextUser.id).eq("is_active", true);
      const memberships = (data ?? []) as Membership[];
      if (active) setHasMembership(memberships.length > 0);
      const clubs = memberships.filter(({ role }) => ["owner", "admin"].includes(role));
      if (!active || !clubs.length) { if (active) setManagedClubs([]); return; }
      const { data: clubRows } = await supabase.from("clubs").select("id,name").in("id", clubs.map(({ club_id }) => club_id));
      if (active) setManagedClubs((clubRows ?? []) as ClubOption[]);
    };
    supabase.auth.getUser().then(({ data }) => syncUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncUser(session?.user ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const headerRef = useRef<HTMLElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const update = () => { header.dataset.scrolled = window.scrollY > 8 ? "true" : "false"; };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [pathname]);

  useEffect(() => {
    const container = linksRef.current;
    const bar = indicatorRef.current;
    if (!container || !bar) return;
    const place = (animate: boolean) => {
      const current = container.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!current) { bar.style.opacity = "0"; return; }
      if (!animate) bar.style.transition = "none";
      bar.style.width = `${current.offsetWidth}px`;
      bar.style.transform = `translateX(${current.offsetLeft}px)`;
      bar.style.opacity = "1";
      if (!animate) { void bar.offsetWidth; bar.style.transition = ""; }
    };
    place(bar.style.opacity === "1");
    let firstCall = true;
    const observer = new ResizeObserver(() => {
      if (firstCall) { firstCall = false; return; }
      place(false);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [pathname]);
  if (pathname.startsWith("/manage-clubs") || pathname === "/login") return null;

  const isOverlay = pathname === "/" || OVERLAY_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
  const name = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Tài khoản";
  const avatar = user?.user_metadata?.avatar_url as string | undefined;

  async function signOut() {
    await supabase?.auth.signOut();
    setUser(null);
    setMenuOpen(false);
    router.refresh();
  }

  function visitClub(clubId: string) {
    document.cookie = `admin_club=${encodeURIComponent(clubId)}; Path=/manage-clubs; SameSite=Lax; Max-Age=2592000`;
    setMenuOpen(false);
    router.push("/manage-clubs");
  }

  return (
    <header className="site-nav" ref={headerRef} data-overlay={isOverlay ? "true" : undefined}>
      <nav className="site-nav-inner" aria-label="Điều hướng chính">
        <Link href="/" className="site-brand" aria-label="BIT — Trang chủ">
          <Image src="/logo.png" alt="Logo BIT" width={40} height={40} className="site-brand-logo" priority unoptimized />
          <span>BIT<span className="site-brand-dot">.</span></span>
        </Link>
        <div className="site-nav-links" ref={linksRef}>
          {NAV_LINKS.map(({ href, label, isActive }) => {
            const active = isActive(pathname);
            return <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>{label}</Link>;
          })}
          <span className="site-nav-indicator" ref={indicatorRef} aria-hidden="true" />
        </div>
        <div className="site-nav-account">
          {user ? (
            <div className="account-wrap">
              <button className="account-trigger" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
                {avatar ? <img src={avatar} alt="" className="account-avatar" /> : <span className="account-avatar account-avatar-fallback">{name.slice(0, 1).toUpperCase()}</span>}
                <span className="account-name">{name}</span><span className="account-chevron" aria-hidden="true">⌄</span>
              </button>
              {menuOpen && <div className="account-menu">
                {managedClubs.length > 0 && <div className="account-menu-section"><span className="account-menu-label">Quản trị</span>{managedClubs.map((club) => <button key={club.id} onClick={() => visitClub(club.id)}>{club.name}<span aria-hidden="true">↗</span></button>)}</div>}
                {hasMembership && <button onClick={() => { setMenuOpen(false); router.push("/me"); }}>Trang thành viên</button>}
                <button onClick={() => void signOut()}>Đăng xuất</button>
              </div>}
            </div>
          ) : null}
        </div>
        <button className="mobile-menu-button" aria-label="Mở menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
        {menuOpen && <div className="mobile-nav-menu">
          {NAV_LINKS.map(({ href, label }) => <Link key={href} href={href}>{label}</Link>)}
          {user ? <>{managedClubs.map((club) => <button key={club.id} onClick={() => visitClub(club.id)}>Quản trị {club.name}</button>)}{hasMembership && <Link href="/me">Trang thành viên</Link>}<button onClick={() => void signOut()}>Đăng xuất</button></> : null}
        </div>}
      </nav>
    </header>
  );
}