import { RecruitmentTabs } from "../../../components/admin/recruitment/RecruitmentTabs";

export default function RecruitmentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <><RecruitmentTabs />{children}</>;
}
