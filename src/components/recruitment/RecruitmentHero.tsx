import Image from "next/image";

export function RecruitmentHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="recruitment-hero" aria-label={title}>
      <Image src="/hero/1.jpg" alt="Thành viên BIT cùng tham gia các hoạt động của câu lạc bộ" fill priority sizes="100vw" className="recruitment-hero-image" />
      <div className="recruitment-hero-shade" />
      <div className="recruitment-hero-copy">
        <p className="recruitment-hero-eyebrow">CLB Tin học Ngân hàng BIT - BAV</p>
        <h1>{title}</h1>
        <p className="recruitment-hero-subtitle">{subtitle}</p>
      </div>
    </section>
  );
}
