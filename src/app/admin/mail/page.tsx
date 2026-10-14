import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MailMergeApp } from "../../../components/MailMergeApp";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export default async function ClubMailAdminPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const clubId = (await cookies()).get("admin_club")?.value;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !clubId) redirect("/admin");
  const { data: member } = await supabase.from("club_members").select("role").eq("user_id", user.id).eq("club_id", clubId).eq("is_active", true).limit(1).maybeSingle();
  if (member?.role !== "owner" && member?.role !== "admin") redirect("/admin");
  return <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8"><MailMergeApp /></main>;
}
