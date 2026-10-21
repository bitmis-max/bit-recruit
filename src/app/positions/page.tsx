import { Suspense } from "react";
import { ClubRecruitmentPage } from "../../components/recruitment/ClubRecruitmentPage";
import { RecruitmentHero } from "../../components/recruitment/RecruitmentHero";
import { createSupabaseServerClient } from "../../lib/supabase/server";

async function PositionsContent() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className="mx-auto max-w-5xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Chưa cấu hình kết nối Supabase. Hãy kiểm tra tệp <code>.env.local</code>.</div>;
  }

  const { data: club, error } = await supabase.from("clubs")
    .select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) {
    return <div role="alert" className="mx-auto max-w-5xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">Không tải được CLB BIT để hiển thị đợt tuyển.</div>;
  }
  if (!club) {
    return <div className="mx-auto max-w-5xl rounded-2xl border border-zinc-200 bg-white p-6">Chưa có dữ liệu CLB. Hãy thêm CLB BIT trước khi mở đợt tuyển.</div>;
  }
  return <ClubRecruitmentPage clubId={club.id} showHero={false} />;
}

export default function PositionsRoute() {
  return (
    <>
      <RecruitmentHero title="Cơ hội tham gia BIT" subtitle="Tìm ban phù hợp và cùng chúng mình tạo nên những trải nghiệm đáng nhớ." />
      <Suspense fallback={null}><PositionsContent /></Suspense>
    </>
  );
}
