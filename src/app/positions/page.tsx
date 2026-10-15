import { ClubRecruitmentPage } from "../../components/recruitment/ClubRecruitmentPage";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export default async function PositionsRoute() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <main className="min-h-screen bg-[#f7f8f6] px-5 py-12 text-zinc-800 sm:px-8"><div className="mx-auto max-w-5xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Chưa cấu hình kết nối Supabase. Hãy kiểm tra tệp <code>.env.local</code>.</div></main>;
  }

  const { data: club, error } = await supabase.from("clubs").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) {
    return <main className="min-h-screen bg-[#f7f8f6] px-5 py-12 text-zinc-800 sm:px-8"><div role="alert" className="mx-auto max-w-5xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">Không tải được CLB BIT để hiển thị đợt tuyển.</div></main>;
  }
  if (!club) {
    return <main className="min-h-screen bg-[#f7f8f6] px-5 py-12 text-zinc-800 sm:px-8"><div className="mx-auto max-w-5xl rounded-2xl border border-zinc-200 bg-white p-6">Chưa có dữ liệu CLB. Hãy thêm CLB BIT trước khi mở đợt tuyển.</div></main>;
  }
  return <ClubRecruitmentPage clubId={club.id} />;
}
