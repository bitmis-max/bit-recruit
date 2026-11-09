"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabase/client";
import { facebookUrlPattern, roleLabel } from "../admin/roles";

type Membership = { id: string; club_id: string; team_id: string | null; full_name: string; role: string; title: string | null; phone: string | null; facebook_url: string | null; email: string | null };
type Profile = Membership & { clubName: string; teamName: string | null };
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm";

function ProfileCard({ profile, onSaved }: { profile: Profile; onSaved: (clubId: string, phone: string | null, facebookUrl: string | null) => void }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [facebook, setFacebook] = useState(profile.facebook_url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canManage = profile.role === "owner" || profile.role === "admin";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice("");
    const facebookUrl = facebook.trim();
    if (facebookUrl && !facebookUrlPattern.test(facebookUrl)) { setError("Link Facebook phải bắt đầu bằng https://facebook.com/ hoặc https://fb.com/."); return; }
    if (!supabase) { setError("Hệ thống chưa được cấu hình Supabase."); return; }
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("update_my_member_profile", { p_club_id: profile.club_id, p_phone: phone.trim(), p_facebook_url: facebookUrl });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    onSaved(profile.club_id, phone.trim() || null, facebookUrl || null);
    setNotice("Đã lưu hồ sơ của bạn.");
  }

  const info = [
    { label: "Câu lạc bộ", value: profile.clubName },
    { label: "Ban", value: profile.teamName ?? "Chưa gán ban" },
    { label: "Chức danh", value: profile.title || "Chưa có chức danh" },
    { label: "Vai trò", value: roleLabel(profile.role) },
  ];

  return <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
    <header>
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">{profile.clubName}</p>
      <h2 className="mt-2 break-words text-2xl font-bold text-zinc-900">{profile.full_name}</h2>
      {profile.email && <p className="mt-1 break-all text-sm text-zinc-500">{profile.email}</p>}
    </header>
    <dl className="mt-6 grid gap-4 sm:grid-cols-2">{info.map((item) => <div key={item.label} className="rounded-xl bg-[#f7f8f6] px-4 py-3"><dt className="text-xs font-medium text-zinc-500">{item.label}</dt><dd className="mt-1 break-words text-sm font-semibold text-zinc-900">{item.value}</dd></div>)}</dl>
    {canManage && <p className="mt-4 text-sm"><Link href="/manage-clubs" className="font-semibold text-emerald-800 hover:underline">Vào trang quản trị CLB →</Link></p>}
    <form onSubmit={save} className="mt-8 space-y-4 border-t border-zinc-100 pt-6">
      <div><h3 className="font-semibold text-zinc-900">Thông tin liên hệ</h3><p className="mt-1 text-xs text-zinc-500">Bạn chỉ sửa được số điện thoại và link Facebook. Thông tin khác do Ban chủ chốt quản lý.</p></div>
      <label className="block text-sm font-medium text-zinc-800">Số điện thoại<input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} /></label>
      <label className="block text-sm font-medium text-zinc-800">Link Facebook<input type="url" autoComplete="off" value={facebook} onChange={(event) => setFacebook(event.target.value)} placeholder="https://facebook.com/ten-cua-ban" className={inputClass} /></label>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <button disabled={busy} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Đang lưu…" : "Lưu hồ sơ"}</button>
    </form>
  </article>;
}

export function MemberProfile() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { router.replace("/login"); return; }
      const { data, error: memberError } = await supabase.from("club_members")
        .select("id,club_id,team_id,full_name,role,title,phone,facebook_url,email").eq("user_id", user.id).eq("is_active", true);
      if (!active) return;
      if (memberError) { setError("Không tải được hồ sơ thành viên. Vui lòng thử lại."); setLoading(false); return; }
      const rows = (data ?? []) as Membership[];
      const clubIds = [...new Set(rows.map((row) => row.club_id))];
      const teamIds = [...new Set(rows.map((row) => row.team_id).filter((id): id is string => !!id))];
      const [clubResult, teamResult] = await Promise.all([
        clubIds.length ? supabase.from("clubs").select("id,name").in("id", clubIds) : { data: [] },
        teamIds.length ? supabase.from("teams").select("id,name").in("id", teamIds) : { data: [] },
      ]);
      if (!active) return;
      const clubNames = new Map((clubResult.data ?? []).map((club) => [club.id as string, club.name as string]));
      const teamNames = new Map((teamResult.data ?? []).map((team) => [team.id as string, team.name as string]));
      setProfiles(rows.map((row) => ({ ...row, clubName: clubNames.get(row.club_id) ?? "Câu lạc bộ", teamName: row.team_id ? teamNames.get(row.team_id) ?? null : null })));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [supabase, router]);

  function applySaved(clubId: string, phone: string | null, facebookUrl: string | null) {
    setProfiles((current) => current.map((profile) => profile.club_id === clubId ? { ...profile, phone, facebook_url: facebookUrl } : profile));
  }

  return <main className="min-h-[calc(100vh-72px)] bg-[#f7f8f6] px-4 py-10 sm:py-14">
    <div className="mx-auto max-w-2xl space-y-6">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">BIT · Trang thành viên</p><h1 className="mt-2 text-3xl font-bold text-zinc-900">Hồ sơ của bạn</h1></div>
      {!supabase ? <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Hệ thống chưa được cấu hình Supabase.</p>
        : loading ? <p role="status" className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">Đang tải hồ sơ…</p>
        : error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{error}</p>
        : profiles.length ? profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} onSaved={applySaved} />)
        : <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"><h2 className="text-lg font-bold text-zinc-900">Tài khoản chưa gắn với thành viên nào</h2><p className="mt-2 text-sm text-zinc-600">Tài khoản của bạn đã đăng nhập nhưng chưa có hồ sơ thành viên đang hoạt động trong CLB. Vui lòng liên hệ Ban chủ chốt của CLB để được thêm vào danh sách thành viên.</p><Link href="/" className="mt-5 inline-block text-sm font-semibold text-emerald-800 hover:underline">← Về trang chủ</Link></div>}
    </div>
  </main>;
}
