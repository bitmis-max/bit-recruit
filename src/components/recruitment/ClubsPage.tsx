import Link from "next/link";
import { createSupabaseServerClient } from "../../lib/supabase/server";

type Club = { id: string; name: string; description: string | null };
type Campaign = { id: string; club_id: string };
type Opening = { campaign_id: string; team_id: string | null; teams: { name: string } | null };

export async function ClubsPage() {
  const supabase = await createSupabaseServerClient();
  let clubs: Club[] = [];
  let recruitingCounts = new Map<string, number>();
  let errorMessage: string | null = null;

  if (supabase) {
    const now = new Date().toISOString();
    const [clubResult, campaignResult] = await Promise.all([
      supabase.from("clubs").select("id,name,description").order("name"),
      supabase.from("recruitment_campaigns").select("id,club_id")
        .eq("status", "open")
        .or(`start_date.is.null,start_date.lte.${now}`)
        .or(`end_date.is.null,end_date.gte.${now}`),
    ]);
    clubs = (clubResult.data ?? []) as Club[];

    if (clubResult.error) {
      errorMessage = "Không tải được danh sách CLB. Hãy kiểm tra policy RLS cho phép đọc công khai các CLB.";
    } else if (campaignResult.error) {
      errorMessage = "Không tải được các đợt tuyển đang mở. Hãy kiểm tra policy RLS công khai cho campaign.";
    } else if (campaignResult.data?.length) {
      const campaigns = campaignResult.data as Campaign[];
      const { data: openings, error } = await supabase.from("recruitment_positions")
        .select("campaign_id,team_id,teams(name)")
        .in("campaign_id", campaigns.map((campaign) => campaign.id));

      if (error) {
        errorMessage = "Không tải được các ban đang tuyển. Hãy kiểm tra policy RLS cho teams và recruitment_positions.";
      } else {
        const campaignToClub = new Map(campaigns.map((campaign) => [campaign.id, campaign.club_id]));
        const teamsByClub = new Map<string, Set<string>>();
        for (const opening of (openings ?? []) as Opening[]) {
          const clubId = campaignToClub.get(opening.campaign_id);
          if (!clubId) continue;
          const teamKey = opening.team_id ?? `opening:${opening.campaign_id}`;
          const teamSet = teamsByClub.get(clubId) ?? new Set<string>();
          teamSet.add(teamKey);
          teamsByClub.set(clubId, teamSet);
        }
        recruitingCounts = new Map([...teamsByClub].map(([clubId, teams]) => [clubId, teams.size]));
      }
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8f6] px-5 py-12 text-zinc-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-12 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight">BIT · Tuyển thành viên</Link>
          <Link href="/admin/mail" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">Quản trị CLB</Link>
        </header>
        <section className="mb-10 max-w-2xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Cùng tạo nên điều mới</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Khám phá các CLB</h1>
          <p className="mt-4 text-lg leading-8 text-zinc-600">Chọn một câu lạc bộ để xem các ban đang mở đơn tuyển thành viên.</p>
        </section>
        {!supabase ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Chưa cấu hình Supabase. Hãy tạo tệp <code>.env.local</code> theo hướng dẫn.</div>
        ) : errorMessage ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">{errorMessage}</div>
        ) : clubs.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-zinc-600">
            Chưa có CLB nào được hiển thị. Nếu bảng <code>clubs</code> đã có dữ liệu, hãy kiểm tra policy RLS có cho phép vai trò <code>anon</code> đọc bảng này không.
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {clubs.map((club) => {
              const count = recruitingCounts.get(club.id) ?? 0;
              return (
                <li key={club.id}>
                  <Link href={`/clubs/${club.id}`} className="group flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
                    <span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-emerald-50 text-xl font-bold text-emerald-800" aria-hidden="true">{club.name.slice(0, 1)}</span>
                    <h2 className="text-xl font-semibold group-hover:text-emerald-800">{club.name}</h2>
                    {club.description && <p className="mt-3 flex-1 whitespace-pre-wrap leading-7 text-zinc-600">{club.description}</p>}
                    <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4 text-sm">
                      <span className={count ? "font-medium text-emerald-800" : "text-zinc-500"}>{count ? `${count} ban đang tuyển` : "Chưa mở tuyển"}</span>
                      <span className="font-semibold text-zinc-400 transition group-hover:translate-x-1 group-hover:text-emerald-700" aria-hidden="true">→</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
