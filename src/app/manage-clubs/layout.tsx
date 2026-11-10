import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminShell, type AdminClub } from "../../components/admin/AdminShell";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <main className="p-8">Thiếu cấu hình Supabase.</main>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/manage-clubs");

  const { data: allMemberships, error } = await supabase.from("club_members").select("club_id, full_name, role, permissions, is_head, team_id, title")
    .eq("user_id", user.id).eq("is_active", true);
  if (error) console.error("Could not load club memberships", error.message);
  // Chỉ owner/admin được vào khu quản trị; thành viên thường về trang cá nhân.
  const memberships = (allMemberships ?? []).filter((row) => row.role === "owner" || row.role === "admin");
  if (!memberships.length && (allMemberships ?? []).length) redirect("/me");
  const ids = [...new Set(memberships.map((row) => row.club_id))];
  const { data: clubs } = ids.length ? await supabase.from("clubs").select("id, name").in("id", ids) : { data: [] };
  const mine = new Map(memberships.map((row) => [row.club_id, row]));
  const adminClubs: AdminClub[] = (clubs ?? []).map((club) => {
    const row = mine.get(club.id);
    return {
      ...club, role: row?.role ?? "member", permissions: (row?.permissions as string[] | null) ?? [],
      isHead: row?.is_head === true, teamId: (row?.team_id as string | null) ?? null, title: (row?.title as string | null) ?? null,
    };
  });
  const cookieStore = await cookies();
  const requested = cookieStore.get("admin_club")?.value;
  const selected = adminClubs.find((club) => club.id === requested) ?? adminClubs[0] ?? null;

  return <AdminShell key={selected?.id ?? "none"} clubs={adminClubs} selectedClubId={selected?.id ?? ""} email={user.email ?? ""}>{children}</AdminShell>;
}
