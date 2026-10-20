import Link from "next/link";
import { PhotoCarousel } from "../components/home/PhotoCarousel";
import { FlipClockCountdown } from "../components/home/FlipClockCountdown";
import { createSupabaseServerClient } from "../lib/supabase/server";

const heroPhotos = [
  { src: "/hero/1.jpg", alt: "Thành viên CLB BIT trong buổi gặp mặt" },
  { src: "/hero/2.png", alt: "Thành viên BIT Gen 16" },
  { src: "/hero/3.jpg", alt: "Hoạt động nghiên cứu khoa học của BIT" },
  { src: "/hero/4.png", alt: "Thành viên BIT tại giải đấu esports" },
  { src: "/hero/5.jpg", alt: "Buổi trao đổi và làm việc của các thành viên BIT" },
];

const aboutPhotos = [
  { src: "/hero/1.jpg", alt: "Các thế hệ thành viên CLB BIT" },
  { src: "/hero/3.jpg", alt: "Thành viên BIT tại lễ tổng kết hoạt động khoa học" },
];

const recruitmentPhotos = [
  { src: "/hero/2.png", alt: "Thành viên Gen 16 trong buổi gặp mặt đầu tiên" },
  { src: "/hero/5.jpg", alt: "Thành viên BIT cùng trao đổi trong buổi tuyển thành viên" },
  { src: "/hero/4.png", alt: "Đội tuyển BIT tại giải esports" },
];

async function getRecruitmentDeadline(now: Date) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data: club } = await supabase.from("clubs")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!club) return null;

  const nowIso = now.toISOString();
  const { data: campaign } = await supabase.from("recruitment_campaigns")
    .select("end_date")
    .eq("club_id", club.id)
    .eq("status", "open")
    .or(`start_date.is.null,start_date.lte.${nowIso}`)
    .gte("end_date", nowIso)
    .not("end_date", "is", null)
    .order("start_date", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return campaign?.end_date ?? null;
}

export default async function HomePage() {
  const now = new Date();
  const deadline = await getRecruitmentDeadline(now);

  return (
    <main className="about-page">
      <section className="about-hero" aria-label="Hình ảnh CLB BIT">
        <PhotoCarousel photos={heroPhotos} className="hero-carousel" label="Ảnh hoạt động của CLB" />
        <div className="about-hero-shade" />
        <div className="about-hero-copy">
          <p className="about-eyebrow">Banking Information Technology</p>
          <h1>CLB Tin học Ngân hàng BIT - BAV</h1>
          <p>Cùng học hỏi, sáng tạo và trưởng thành qua công nghệ.</p>
          <div className="about-hero-actions">
            <Link href="/clubs" className="about-button about-button-primary">Giới thiệu <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </section>

      <section id="gioi-thieu" className="about-section about-introduction">
        <div className="section-heading">
          <p className="about-eyebrow">Chúng mình là ai?</p>
          <h2>Một cộng đồng công nghệ luôn chuyển động</h2>
        </div>
        <div className="about-story-grid">
          <div className="about-story-copy">
            <p>
              Trực thuộc <strong>Hội Sinh viên Học viện Ngân hàng</strong>, hoạt động dưới sự bảo trợ chuyên môn của <strong>Khoa Công nghệ thông tin và Kinh tế số</strong>, CLB Tin học Ngân hàng BIT là nơi sinh viên cùng khám phá và ứng dụng công nghệ vào thực tế.
            </p>
            <p>
              Với sứ mệnh kết nối những bạn trẻ yêu công nghệ, BIT tạo nên một môi trường để mỗi thành viên học hỏi, thử sức với ý tưởng mới và phát triển năng lực của mình qua từng dự án, hoạt động và sự kiện.
            </p>
            <div className="about-facts">
              <div><strong>2010</strong><span>Năm thành lập</span></div>
              <div><strong>Học tập</strong><span>Chia sẻ kiến thức</span></div>
              <div><strong>Sáng tạo</strong><span>Cùng làm điều mới</span></div>
            </div>
          </div>
          <PhotoCarousel photos={aboutPhotos} className="about-carousel" label="Ảnh giới thiệu CLB" />
        </div>
        <div className="about-values">
          <span>Học hỏi không ngừng</span><span aria-hidden="true">✳</span>
          <span>Kết nối chân thành</span><span aria-hidden="true">✳</span>
          <span>Phát triển cùng nhau</span>
        </div>
      </section>

      <section className="about-section recruitment-section">
        <div className="section-heading section-heading-centered">
          <p className="about-eyebrow">Hành trình thành viên</p>
          <h2>Sự kiện tuyển CTV Gen 16</h2>
          <p>Mỗi mùa tuyển thành viên là khởi đầu cho những tình bạn, ý tưởng và trải nghiệm mới tại BIT.</p>
        </div>
        <div className="recruitment-feature">
          <div className="recruitment-copy">
            <span className="recruitment-index">01 / GẶP GỠ</span>
            <h3>Bắt đầu từ một cuộc gặp</h3>
            <p>Sự kiện tuyển cộng tác viên là dịp để các bạn sinh viên làm quen với BIT, gặp gỡ những người bạn cùng sở thích và tìm hiểu cách CLB học tập, làm việc.</p>
            <p>Từ vòng đơn đến những buổi sinh hoạt đầu tiên, mỗi bước đều mở ra cơ hội để bạn thử sức, đóng góp và phát triển cùng cộng đồng.</p>
            <Link href="/positions" className="about-text-link">Tìm hiểu cơ hội tham gia <span aria-hidden="true">→</span></Link>
          </div>
          <div className="recruitment-gallery">
            <PhotoCarousel photos={recruitmentPhotos} className="recruitment-carousel" label="Ảnh sự kiện tuyển cộng tác viên Gen 16" captions={["Ngày hội tuyển thành viên", "Cùng nhau học hỏi", "Hoạt động và kết nối"]} />
            <p className="gallery-caption">Những khoảnh khắc trên hành trình trở thành một phần của BIT</p>
          </div>
        </div>
        <div className="recruitment-bottom">
          <div><span className="recruitment-index">02 / ĐỒNG HÀNH</span><h3>Thanh xuân được tạo nên từ những điều cùng làm.</h3></div>
          <p>Được thành lập ngày 28 - 04 - 2010, BIT đã trở thành một phần trong thanh xuân của nhiều thế hệ sinh viên Khoa Công nghệ thông tin và Kinh tế số. Cùng nhau, chúng mình học công nghệ, tổ chức hoạt động và lưu lại những kỷ niệm đáng nhớ.</p>
        </div>
      </section>

      <section className="about-cta">
        <div className="about-cta-heading"><p className="about-eyebrow">Bạn đã sẵn sàng?</p><h2>Hẹn gặp bạn tại BIT.</h2></div>
        <FlipClockCountdown deadline={deadline} />
      </section>
    </main>
  );
}
