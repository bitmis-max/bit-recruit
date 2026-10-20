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
  teams: { id: string; name: string; description: string | null }[] | { id: string; name: string; description: string | null } | null;
};

export async function ClubRecruitmentPage({ clubId }: { clubId: string }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <main className="mx-auto max-w-5xl p-8">Chưa cấu hình kết nối Supabase. Vui lòng thử lại sau.</main>;
  }

  const { data: club, error: clubError } = await supabase.from("clubs")
    .select("id,name,description").eq("id", clubId).maybeSingle();
  if (clubError) {
    return <PageShell><div className="recruitment-content"><Alert>Không tải được CLB này. Hãy kiểm tra policy RLS cho phép đọc công khai các CLB.</Alert></div></PageShell>;
  }
  if (!club) notFound();

  const now = new Date().toISOString();
  const { data: campaigns, error: campaignError } = await supabase.from("recruitment_campaigns")
    .select("id")
    .eq("club_id", clubId)
    .eq("status", "open")
    .or(`start_date.is.null,start_date.lte.${now}`)
    .or(`end_date.is.null,end_date.gte.${now}`);

  let items: RecruitmentItem[] = [];
  let errorMessage: string | null = campaignError
    ? "Không tải được đợt tuyển. Hãy kiểm tra policy RLS cho campaign."
    : null;

  if (campaigns?.length) {
    const { data, error } = await supabase.from("recruitment_positions")
      .select("id,name,description,campaign_id,team_id,teams(id,name,description)")
      .in("campaign_id", campaigns.map((campaign) => campaign.id))
      .order("name");
    items = (data ?? []) as RecruitmentItem[];
    if (error) errorMessage = "Không tải được danh sách ban đang tuyển. Hãy kiểm tra policy RLS cho teams và recruitment_positions.";
  }

  const grouped = new Map<string, { teamName: string; teamDescription: string | null; openings: RecruitmentItem[] }>();
  for (const item of items) {
    const team = Array.isArray(item.teams) ? item.teams[0] ?? null : item.teams;
    const key = item.team_id ?? `opening:${item.id}`;
    const group = grouped.get(key) ?? {
      teamName: team?.name ?? item.name,
      teamDescription: team?.description ?? null,
      openings: [],
    };
    group.openings.push(item);
    grouped.set(key, group);
  }

  return (
    <PageShell>
      <RecruitmentHero title="Cơ hội tham gia BIT" subtitle="Tìm ban phù hợp và cùng chúng mình tạo nên những trải nghiệm đáng nhớ." />
      <div className="recruitment-content">
        <Link href="/clubs" className="recruitment-back-link">← Giới thiệu CLB BIT</Link>

      {errorMessage ? (
        <Alert>{errorMessage}</Alert>
      ) : grouped.size === 0 ? (
        <div className="recruitment-empty">CLB hiện chưa có ban nào mở tuyển.</div>
      ) : (
        <ul className="recruitment-team-list">
          {[...grouped.entries()].map(([key, team]) => (
            <li key={key} className="recruitment-team-card">
              <div className="recruitment-team-heading">
                <span className="recruitment-team-mark" aria-hidden="true">
                  <Image src="/logo.png" alt="" width={48} height={48} className="recruitment-team-logo" unoptimized />
                </span>
                <div>
                  <p className="recruitment-eyebrow">BAN ĐANG TUYỂN</p>
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
                    <Link href={`/positions/${opening.id}/apply`} className="recruitment-apply-link">
                      Ứng tuyển <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="recruitment-page">{children}</main>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return <div role="alert" className="recruitment-alert">{children}</div>;
}
