import { ClubRecruitmentPage } from "../../../components/recruitment/ClubRecruitmentPage";

export default async function ClubPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  return <ClubRecruitmentPage clubId={clubId} />;
}
