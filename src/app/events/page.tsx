import Image from "next/image";
import { Suspense } from "react";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { FlipClockCountdown } from "../../components/home/FlipClockCountdown";
import { pickOpenCampaign, type OpenCampaignState } from "../../components/home/openCampaign";
import { EventsHeroSlider } from "../../components/events/EventsHeroSlider";

type ClubEvent = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
};

const heroPhotos = [
  { src: "/hero/4.png", alt: "Thành viên BIT tại giải đấu esports" },
  { src: "/hero/2.png", alt: "Thành viên BIT Gen 16" },
  { src: "/hero/5.jpg", alt: "Buổi trao đổi và làm việc của các thành viên BIT" },
];

async function EventsLoadedSections() {
  const supabase = await createSupabaseServerClient();
  let events: ClubEvent[] = [];
  let loadError = !supabase;
  let campaign: OpenCampaignState = { open: false, deadline: null };

  if (supabase) {
    const { data: club, error: clubError } = await supabase.from("clubs")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (clubError || !club) {
      loadError = true;
    } else {
      const now = new Date().toISOString();
      const [eventResult, campaignResult] = await Promise.all([
        supabase.from("events")
          .select("id,title,description,image_url,sort_order")
          .eq("club_id", club.id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
        supabase.from("recruitment_campaigns").select("end_date").eq("club_id", club.id).eq("status", "open")
          .or(`start_date.is.null,start_date.lte.${now}`)
          .order("start_date", { ascending: false, nullsFirst: false }).limit(20),
      ]);
      events = (eventResult.data ?? []) as ClubEvent[];
      loadError = Boolean(eventResult.error);
      campaign = pickOpenCampaign(campaignResult.data, new Date(now));
    }
  }

  return (
    <>
      <section className="events-list" aria-label="Danh sách sự kiện">
        {events.length ? events.map((event) => (
          <article className="event-card" key={event.id}>
            <h2 className="event-title">{event.title}</h2>
            <div className="event-card-body">
              <div className="event-copy">
                <p>{event.description || "Thông tin về sự kiện sẽ được cập nhật."}</p>
              </div>
              {event.image_url ? (
                <figure className="event-image-wrap">
                  <img src={event.image_url} alt={event.title} loading="lazy" />
                </figure>
              ) : (
                <figure className="event-image-wrap">
                  <Image src="/hero/4.png" alt={event.title} fill sizes="(max-width: 760px) 100vw, 45vw" className="event-local-image" />
                </figure>
              )}
            </div>
          </article>
        )) : (
          <p className="events-empty" role={loadError ? "alert" : undefined}>
            {loadError ? "Chưa tải được sự kiện." : "Chưa có sự kiện nào được đăng."}
          </p>
        )}
      </section>

      <section className="about-cta events-cta">
        <div className="about-cta-heading"><h2><span className="about-cta-lead">Bạn đã sẵn sàng?</span> Hẹn gặp bạn tại BIT.</h2></div>
        <FlipClockCountdown campaign={campaign} />
      </section>
    </>
  );
}

export default function EventsPage() {
  return (
    <main className="events-page">
      <section className="events-hero" aria-labelledby="events-heading">
        <EventsHeroSlider photos={heroPhotos} />
        <div className="events-hero-shade" />
        <h1 id="events-heading">BIT&apos;S EVENTS</h1>
      </section>
      <Suspense fallback={null}><EventsLoadedSections /></Suspense>
    </main>
  );
}
