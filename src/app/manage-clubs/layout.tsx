import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminShell, type AdminClub } from "../../components/admin/AdminShell";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <main className="p-8">Thiếu cấu hình Supabase.</main>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/manage-clubs");

  const { data: memberships, error } = await supabase.from("club_members").select("club_id, full_name, role")
    .eq("user_id", user.id).eq("is_active", true);
  if (error) console.error("Could not load club memberships", error.message);
  const ids = [...new Set((memberships ?? []).map((row) => row.club_id))];
  const { data: clubs } = ids.length ? await supabase.from("clubs").select("id, name").in("id", ids) : { data: [] };
  const roles = new Map((memberships ?? []).map((row) => [row.club_id, row.role]));
  const adminClubs: AdminClub[] = (clubs ?? []).map((club) => ({ ...club, role: roles.get(club.id) ?? "organizer" }));
  const cookieStore = await cookies();
  const requested = cookieStore.get("admin_club")?.value;
  const selected = adminClubs.find((club) => club.id === requested) ?? adminClubs[0] ?? null;

  return <AdminShell key={selected?.id ?? "none"} clubs={adminClubs} selectedClubId={selected?.id ?? ""} email={user.email ?? ""}>{children}</AdminShell>;
}
