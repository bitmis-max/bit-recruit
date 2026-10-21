import { Suspense } from "react";
import { ClubRecruitmentPage } from "../../../components/recruitment/ClubRecruitmentPage";
import { RecruitmentHero } from "../../../components/recruitment/RecruitmentHero";

async function ClubContent({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  return <ClubRecruitmentPage clubId={clubId} showHero={false} />;
}

export default function ClubPage({ params }: { params: Promise<{ clubId: string }> }) {
  return (
    <>
      <RecruitmentHero title="Cơ hội tham gia BIT" subtitle="Tìm ban phù hợp và cùng chúng mình tạo nên những trải nghiệm đáng nhớ." />
      <Suspense fallback={null}><ClubContent params={params} /></Suspense>
    </>
  );
}
