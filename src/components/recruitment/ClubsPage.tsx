import Image from "next/image";
import { Suspense } from "react";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { FlipClockCountdown } from "../home/FlipClockCountdown";
import { pickOpenCampaign, type OpenCampaignState } from "../home/openCampaign";
import { ClubTeamCards, type ClubTeam } from "./ClubTeamCards";

async function ClubsLoadedSections() {
  const supabase = await createSupabaseServerClient();
  let teams: ClubTeam[] = [];
  let loadError = false;
  let campaign: OpenCampaignState = { open: false, deadline: null };

  if (supabase) {
    const { data: club, error: clubError } = await supabase.from("clubs")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (clubError) {
      loadError = true;
    } else if (club) {
      const now = new Date().toISOString();
      const [teamResult, campaignResult] = await Promise.all([
        supabase.from("teams").select("id,name,description,image_url,duties,fit_for").eq("club_id", club.id).order("name"),
        supabase.from("recruitment_campaigns").select("end_date").eq("club_id", club.id).eq("status", "open")
          .or(`start_date.is.null,start_date.lte.${now}`)
          .order("start_date", { ascending: false, nullsFirst: false }).limit(20),
      ]);
      teams = (teamResult.data ?? []) as ClubTeam[];
      loadError = Boolean(teamResult.error);
      campaign = pickOpenCampaign(campaignResult.data, new Date(now));
    } else {
      loadError = true;
    }
  } else {
    loadError = true;
  }

  return (
    <>
      <section id="cac-ban" className="clubs-structure-section" aria-labelledby="clubs-teams-title">
        <div className="clubs-structure-inner">
          <h2 id="clubs-teams-title">Các ban trong CLB</h2>
          <ClubTeamCards teams={teams} loadError={loadError} />
        </div>
      </section>

      <section className="about-cta">
        <div className="about-cta-heading"><h2><span className="about-cta-lead">Bạn đã sẵn sàng?</span> Hẹn gặp bạn tại BIT.</h2></div>
        <FlipClockCountdown campaign={campaign} />
      </section>
    </>
  );
}

export function ClubsPage() {
  return (
    <main className="clubs-page">
      <section className="clubs-hero" aria-labelledby="clubs-title">
        <div className="clubs-hero-copy">
          <h1 id="clubs-title">Nhiều ban, một bản giao hưởng</h1>
          <p>Được thành lập vào năm 2010, trải qua hơn 15 năm hoạt động và phát triển, BIT được vận hành bởi các ban thành viên cùng phối hợp trong học tập, tổ chức hoạt động và phát triển cộng đồng.</p>
        </div>
        <div className="clubs-hero-media">
          <Image src="/hero/1.jpg" alt="Các thành viên CLB Tin học Ngân hàng BIT" fill priority sizes="(max-width: 860px) 100vw, 55vw" />
        </div>
      </section>
      <Suspense fallback={null}><ClubsLoadedSections /></Suspense>
    </main>
  );
}
