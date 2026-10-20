"use client";

import Link from "next/link";
import FlipClockCountdownLibrary from "@leenguyen/react-flip-clock-countdown";

type FlipClockCountdownProps = {
  deadline: string | null;
};

export function FlipClockCountdown({ deadline }: FlipClockCountdownProps) {
  const deadlineTime = deadline ? Date.parse(deadline) : Number.NaN;
  const deadlineIsValid = Number.isFinite(deadlineTime);
  const deadlineHasPassed = deadlineIsValid && deadlineTime <= Date.now();

  return (
    <div className="countdown-wrap">
      {deadlineIsValid && !deadlineHasPassed ? (
        <FlipClockCountdownLibrary
          to={deadlineTime}
          className="recruitment-flip-clock"
          renderOnServer
          hideOnComplete={false}
          stopOnHiddenVisibility
          labels={["Ngày", "Giờ", "Phút", "Giây"]}
          labelStyle={{ color: "#637887", fontSize: 11, fontWeight: 750, letterSpacing: "0.1em", textTransform: "uppercase" }}
          digitBlockStyle={{ width: "clamp(25px, 7.5vw, 50px)", height: "clamp(48px, 13vw, 74px)", fontSize: "clamp(22px, 6vw, 40px)", color: "#ffffff", background: "#173953", borderRadius: 9, boxShadow: "0 10px 20px rgb(13 42 65 / 19%)" }}
          dividerStyle={{ color: "rgb(255 255 255 / 38%)", height: 1 }}
          separatorStyle={{ color: "#0789d1", size: 5 }}
          spacing={{ clock: "clamp(6px, 2vw, 16px)", digitBlock: 3 }}
          duration={0.6}
          aria-label="Đếm ngược đến khi kết thúc đợt tuyển"
        />
      ) : (
        <p className="countdown-closed">{deadlineIsValid ? "Đợt tuyển này đã kết thúc." : "Hiện chưa có đợt tuyển đang mở."}</p>
      )}
      <Link href="/positions" className="about-button about-button-primary countdown-cta">Đăng ký ngay <span aria-hidden="true">↗</span></Link>
    </div>
  );
}
