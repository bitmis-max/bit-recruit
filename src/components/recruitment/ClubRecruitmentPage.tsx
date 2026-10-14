import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";

type RecruitmentItem = {
  id: string;
  name: string;
  description: string | null;
  campaign_id: string;
  team_id: string | null;
  teams: { id: string; name: string; description: string | null } | null;
};

export async function ClubRecruitmentPage({ clubId }: { clubId: string }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <main className="mx-auto max-w-5xl p-8">Chưa cấu hình kết nối Supabase. Vui lòng thử lại sau.</main>;
  }

  const { data: club, error: clubError } = await supabase.from("clubs")
    .select("id,name,description").eq("id", clubId).maybeSingle();
  if (clubError) {
    return <PageShell><Alert>Không tải được CLB này. Hãy kiểm tra policy RLS cho phép đọc công khai các CLB.</Alert></PageShell>;
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
    const key = item.team_id ?? `opening:${item.id}`;
    const group = grouped.get(key) ?? {
      teamName: item.teams?.name ?? item.name,
      teamDescription: item.teams?.description ?? null,
      openings: [],
    };
    group.openings.push(item);
    grouped.set(key, group);
  }

  return (
    <PageShell>
      <Link href="/" className="text-sm font-medium text-emerald-800 hover:underline">← Danh sách CLB</Link>
      <section className="mb-10 mt-8 max-w-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Cơ hội tham gia</p>
        <h1 className="text-4xl font-semibold tracking-tight">{club.name}</h1>
        {club.description && <p className="mt-4 whitespace-pre-wrap text-lg leading-8 text-zinc-600">{club.description}</p>}
        <p className="mt-4 text-zinc-600">Các ban đang tuyển thành viên trong CLB.</p>
      </section>
      {errorMessage ? (
        <Alert>{errorMessage}</Alert>
      ) : grouped.size === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-zinc-600">CLB hiện chưa có ban nào mở tuyển.</div>
      ) : (
        <ul className="space-y-5">
          {[...grouped.entries()].map(([key, team]) => (
            <li key={key} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-7">
              <h2 className="text-2xl font-semibold">{team.teamName}</h2>
              {team.teamDescription && <p className="mt-2 leading-7 text-zinc-600">{team.teamDescription}</p>}
              <ul className="mt-5 divide-y divide-zinc-100">
                {team.openings.map((opening) => (
                  <li key={opening.id} className="flex flex-col justify-between gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                    <div>
                      <h3 className="font-semibold">{opening.name}</h3>
                      {opening.description && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{opening.description}</p>}
                    </div>
                    <Link href={`/positions/${opening.id}/apply`} className="inline-flex w-fit shrink-0 items-center rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800">
                      Ứng tuyển <span aria-hidden="true" className="ml-2">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f7f8f6] px-5 py-12 text-zinc-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-12 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight">BIT · Tuyển thành viên</Link>
          <Link href="/admin/mail" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">Quản trị CLB</Link>
        </header>
        {children}
      </div>
    </main>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">{children}</div>;
}
