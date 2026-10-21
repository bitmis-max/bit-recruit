import Image from "next/image";
import { Suspense } from "react";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { FlipClockCountdown } from "../home/FlipClockCountdown";
import { ClubStructureTabs } from "./ClubStructureTabs";

type Team = { id: string; name: string; description: string | null; image_url: string | null };

async function ClubsLoadedSections() {
  const supabase = await createSupabaseServerClient();
  let teams: Team[] = [];
  let loadError = false;
  let deadline: string | null = null;

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
        supabase.from("teams").select("id,name,description,image_url").eq("club_id", club.id).order("name"),
        supabase.from("recruitment_campaigns").select("end_date").eq("club_id", club.id).eq("status", "open")
          .or(`start_date.is.null,start_date.lte.${now}`).gte("end_date", now).not("end_date", "is", null)
          .order("start_date", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
      ]);
      teams = (teamResult.data ?? []) as Team[];
      loadError = Boolean(teamResult.error);
      deadline = campaignResult.data?.end_date ?? null;
    } else {
      loadError = true;
    }
  } else {
    loadError = true;
  }

  return (
    <>
      <section id="cac-ban" className="clubs-structure-section" aria-label="Các ban trong CLB BIT">
        <ClubStructureTabs teams={teams} loadError={loadError} />
      </section>

      <section className="about-cta">
        <div className="about-cta-heading"><p className="about-eyebrow">Bạn đã sẵn sàng?</p><h2>Hẹn gặp bạn tại BIT.</h2></div>
        <FlipClockCountdown deadline={deadline} />
      </section>
    </>
  );
}

export function ClubsPage() {
  return (
    <main className="clubs-page">
      <section className="clubs-hero" aria-labelledby="clubs-title">
        <Image src="/hero/1.jpg" alt="Các thành viên CLB Tin học Ngân hàng BIT" fill priority sizes="100vw" className="clubs-hero-image" />
        <div className="clubs-hero-overlay" />
        <h1 id="clubs-title">ABOUT BIT&apos;S STRUCTURE</h1>
      </section>
      <div className="clubs-intro-wrap">
        <section className="clubs-intro" aria-label="Giới thiệu cơ cấu CLB BIT">
          <p>Được thành lập vào năm 2010, trải qua hơn 15 năm hoạt động và phát triển, BIT được vận hành bởi các ban thành viên cùng phối hợp trong học tập, tổ chức hoạt động và phát triển cộng đồng.</p>
          <a href="#cac-ban" className="clubs-learn-more">Tìm hiểu thêm <span aria-hidden="true">↓</span></a>
        </section>
      </div>
      <Suspense fallback={null}><ClubsLoadedSections /></Suspense>
    </main>
  );
}
