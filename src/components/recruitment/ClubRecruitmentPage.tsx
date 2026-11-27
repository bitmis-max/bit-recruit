import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { RecruitmentHero } from "./RecruitmentHero";

type RecruitmentItem = {
  id: string;
  name: string;
  description: string | null;
  campaign_id: string;
  team_id: string | null;
  application_forms?: { id: string }[] | { id: string } | null;
  teams: { id: string; name: string; description: string | null }[] | { id: string; name: string; description: string | null } | null;
};
type RecruitmentCampaign = { id: string; name: string; description: string | null };

export async function ClubRecruitmentPage({ clubId, showHero = true }: { clubId: string; showHero?: boolean }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <main className="mx-auto max-w-5xl p-8">Chưa cấu hình kết nối Supabase. Vui lòng thử lại sau.</main>;
  }

  const { data: club, error: clubError } = await supabase.from("clubs")
    .select("id,name,description").eq("id", clubId).maybeSingle();
  if (clubError) {
    return <PageShell><div className="recruitment-content"><Alert>Không tải được thông tin CLB này. Bạn thử tải lại trang sau ít phút nhé.</Alert></div></PageShell>;
  }
  if (!club) notFound();

  const now = new Date().toISOString();
  const { data: campaigns, error: campaignError } = await supabase.from("recruitment_campaigns")
    .select("id,name,description")
    .eq("club_id", clubId)
    .eq("status", "open")
    .or(`start_date.is.null,start_date.lte.${now}`)
    .or(`end_date.is.null,end_date.gte.${now}`);

  let items: RecruitmentItem[] = [];
  let errorMessage: string | null = campaignError
    ? "Không tải được đợt tuyển. Bạn thử tải lại trang sau ít phút nhé."
    : null;

  if (campaigns?.length) {
    const { data, error } = await supabase.from("recruitment_positions")
      .select("id,name,description,campaign_id,team_id,application_forms(id),teams(id,name,description)")
      .in("campaign_id", campaigns.map((campaign) => campaign.id))
      .order("name");
    items = (data ?? []) as RecruitmentItem[];
    if (error) errorMessage = "Không tải được danh sách ban đang tuyển. Bạn thử tải lại trang sau ít phút nhé.";
  }

  const grouped = new Map<string, { campaign: RecruitmentCampaign; teams: Map<string, { teamName: string; teamDescription: string | null; openings: RecruitmentItem[] }> }>();
  for (const item of items) {
    const team = Array.isArray(item.teams) ? item.teams[0] ?? null : item.teams;
    const campaign = (campaigns as RecruitmentCampaign[]).find((row) => row.id === item.campaign_id)!;
    const campaignGroup = grouped.get(item.campaign_id) ?? { campaign, teams: new Map() };
    const key = item.team_id ?? `opening:${item.id}`;
    const group = campaignGroup.teams.get(key) ?? {
      teamName: team?.name ?? item.name,
      teamDescription: team?.description ?? null,
      openings: [],
    };
    group.openings.push(item);
    campaignGroup.teams.set(key, group);
    grouped.set(item.campaign_id, campaignGroup);
  }

  return (
    <PageShell>
      {showHero && <RecruitmentHero title="Cơ hội tham gia BIT" subtitle="Tìm ban phù hợp và cùng chúng mình tạo nên những trải nghiệm đáng nhớ." />}
      <div className="recruitment-content">
        <Link href="/clubs" className="recruitment-back-link">← Giới thiệu CLB BIT</Link>

      {errorMessage ? (
        <Alert>{errorMessage}</Alert>
      ) : grouped.size === 0 ? (
        <div className="recruitment-empty">CLB hiện chưa có ban nào mở tuyển.</div>
      ) : (
        <div className="recruitment-campaign-list">
          {[...grouped.values()].map(({ campaign, teams }) => (
            <section key={campaign.id} className="recruitment-campaign-card">
              <header className="recruitment-campaign-heading">
                <h2>{campaign.name}</h2>
                {campaign.description && <p>{campaign.description}</p>}
              </header>
              <ul className="recruitment-team-list">
                {[...teams.entries()].map(([key, team]) => (
                  <li key={key} className="recruitment-team-card">
              <div className="recruitment-team-heading">
                <span className="recruitment-team-mark" aria-hidden="true">
                  <Image src="/logo.png" alt="" width={48} height={48} className="recruitment-team-logo" unoptimized />
                </span>
                <div>
                  <h2>{team.teamName}</h2>
                </div>
              </div>
              <ul className="recruitment-opening-list">
                {team.openings.map((opening) => (
                  <li key={opening.id} className="recruitment-opening">
                    <div>
                      <h3>{opening.name}</h3>
                      {opening.description && <p>{opening.description}</p>}
                    </div>
                    {hasForm(opening) ? (
                      <Link href={`/positions/${opening.id}/apply`} className="recruitment-apply-link">
                        Ứng tuyển <span aria-hidden="true">→</span>
                      </Link>
                    ) : (
                      <span className="text-sm text-zinc-500">Chưa nhận đơn</span>
                    )}
                  </li>
                ))}
              </ul>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      </div>
    </PageShell>
  );
}

// Chưa có biểu mẫu thì ẩn nút Ứng tuyển. Thiếu dữ liệu embed (undefined) thì vẫn cho bấm.
function hasForm(item: RecruitmentItem) {
  if (item.application_forms === undefined) return true;
  return Array.isArray(item.application_forms) ? item.application_forms.length > 0 : item.application_forms !== null;
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="recruitment-page">{children}</main>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return <div role="alert" className="recruitment-alert">{children}</div>;
}
