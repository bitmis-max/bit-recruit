"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../lib/supabase/client";

type Membership = { role: string; club_id: string };
type ClubOption = { id: string; name: string };

export function PublicNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [managedClubs, setManagedClubs] = useState<ClubOption[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const syncUser = async (nextUser: User | null) => {
      if (!active) return;
      setUser(nextUser);
      if (!nextUser) {
        setManagedClubs([]);
        return;
      }
      const { data } = await supabase.from("club_members").select("role,club_id")
        .eq("user_id", nextUser.id).eq("is_active", true);
      const clubs = ((data ?? []) as Membership[]).filter(({ role }) => ["owner", "organizer", "admin"].includes(role));
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
  if (pathname.startsWith("/manage-clubs") || pathname === "/login") return null;

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
    <header className="site-nav">
      <nav className="site-nav-inner" aria-label="Điều hướng chính">
        <Link href="/" className="site-brand" aria-label="BIT — Trang chủ">
          <span className="site-brand-mark">B</span><span>BIT<span className="site-brand-dot">.</span></span>
        </Link>
        <div className="site-nav-links">
          <Link href="/" className={pathname === "/" ? "active" : ""}>Trang chủ</Link>
          <Link href="/clubs" className={pathname === "/clubs" ? "active" : ""}>Khám phá CLB</Link>
          <Link href="/positions" className={pathname === "/positions" ? "active" : ""}>Đợt tuyển gen</Link>
          <Link href="/guide" className={pathname === "/guide" ? "active" : ""}>Hướng dẫn</Link>
        </div>
        <div className="site-nav-account">
          {user ? (
            <div className="account-wrap">
              <button className="account-trigger" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
                {avatar ? <img src={avatar} alt="" className="account-avatar" /> : <span className="account-avatar account-avatar-fallback">{name.slice(0, 1).toUpperCase()}</span>}
                <span className="account-name">{name}</span><span className="account-chevron" aria-hidden="true">⌄</span>
              </button>
              {menuOpen && <div className="account-menu">
                {managedClubs.length > 0 && <div className="account-menu-section"><span className="account-menu-label">Đi tới CLB</span>{managedClubs.map((club) => <button key={club.id} onClick={() => visitClub(club.id)}>{club.name}<span aria-hidden="true">↗</span></button>)}</div>}
                <button onClick={() => void signOut()}>Đăng xuất</button>
              </div>}
            </div>
          ) : <><Link href="/login" className="login-link">Đăng nhập</Link><Link href="/register" className="register-link">Đăng kí</Link></>}
        </div>
        <button className="mobile-menu-button" aria-label="Mở menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
        {menuOpen && <div className="mobile-nav-menu">
          <Link href="/">Trang chủ</Link><Link href="/clubs">Khám phá CLB</Link><Link href="/positions">Đợt tuyển gen</Link><Link href="/guide">Hướng dẫn</Link>
          {user ? <>{managedClubs.map((club) => <button key={club.id} onClick={() => visitClub(club.id)}>Đi tới {club.name}</button>)}<button onClick={() => void signOut()}>Đăng xuất</button></> : <><Link href="/login">Đăng nhập</Link><Link href="/register">Đăng kí</Link></>}
        </div>}
      </nav>
    </header>
  );
}
