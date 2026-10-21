import Image from "next/image";
import { Suspense } from "react";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { FlipClockCountdown } from "../../components/home/FlipClockCountdown";

type ClubEvent = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
};

const eventIntro = "Mặc dù là một CLB học thuật, song những sự kiện bổ ích và thú vị là một món ăn tinh thần không thể thiếu đối với đời sống học tập và giải trí của các thành viên BIT nói chung và các bạn sinh viên Khoa Công nghệ thông tin và Kinh tế số nói riêng. Với sứ mệnh tạo ra một môi trường sáng tạo và phát triển cho các tín đồ công nghệ, BIT tự hào giới thiệu mảng sự kiện đa dạng và phong phú, phục vụ cho sở thích và nhu cầu của cộng đồng sinh viên.";

async function EventsLoadedSections() {
  const supabase = await createSupabaseServerClient();
  let events: ClubEvent[] = [];
  let loadError = !supabase;
  let deadline: string | null = null;

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
          .or(`start_date.is.null,start_date.lte.${now}`).gte("end_date", now).not("end_date", "is", null)
          .order("start_date", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
      ]);
      events = (eventResult.data ?? []) as ClubEvent[];
      loadError = Boolean(eventResult.error);
      deadline = campaignResult.data?.end_date ?? null;
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
        <div className="about-cta-heading"><p className="about-eyebrow">Bạn đã sẵn sàng?</p><h2>Hẹn gặp bạn tại BIT.</h2></div>
        <FlipClockCountdown deadline={deadline} />
      </section>
    </>
  );
}

export default function EventsPage() {
  return (
    <main className="events-page">
      <section className="events-hero" aria-labelledby="events-heading">
        <Image src="/hero/4.png" alt="Các thành viên BIT trong một sự kiện của câu lạc bộ" fill priority sizes="100vw" className="events-hero-image" />
        <div className="events-hero-shade" />
        <h1 id="events-heading">BIT&apos;S EVENTS</h1>
      </section>
      <div className="events-intro-wrap">
        <section className="events-intro" aria-label="Giới thiệu sự kiện BIT">
          <p>{eventIntro}</p>
        </section>
      </div>
      <Suspense fallback={null}><EventsLoadedSections /></Suspense>
    </main>
  );
}
