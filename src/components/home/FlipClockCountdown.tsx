"use client";

import Link from "next/link";
import FlipClockCountdownLibrary from "@leenguyen/react-flip-clock-countdown";
import type { OpenCampaignState } from "./openCampaign";

type FlipClockCountdownProps = {
  campaign: OpenCampaignState;
};

export function FlipClockCountdown({ campaign }: FlipClockCountdownProps) {
  const { deadline } = campaign;
  const deadlineTime = deadline ? Date.parse(deadline) : Number.NaN;
  const deadlineIsValid = Number.isFinite(deadlineTime);
  const deadlineHasPassed = deadlineIsValid && deadlineTime <= Date.now();

  const isOpen = campaign.open && deadlineIsValid && !deadlineHasPassed;
  // Đợt đang mở nhưng không đặt hạn: vẫn cho đăng ký, chỉ không có đồng hồ.
  const isOpenWithoutDeadline = campaign.open && deadline === null;
  const registerLink = <Link href="/positions" className="about-button about-button-primary countdown-cta">Đăng ký ngay <span aria-hidden="true">↗</span></Link>;

  return (
    <div className="countdown-wrap">
      {isOpen ? (
        <>
          <FlipClockCountdownLibrary
            to={deadlineTime}
            className="recruitment-flip-clock"
            renderOnServer
            hideOnComplete={false}
            stopOnHiddenVisibility
            labels={["Ngày", "Giờ", "Phút", "Giây"]}
            labelStyle={{ color: "#516879", fontSize: 12, fontWeight: 750, letterSpacing: "0.1em", textTransform: "uppercase" }}
            digitBlockStyle={{ width: "clamp(25px, 7.5vw, 50px)", height: "clamp(48px, 13vw, 74px)", fontSize: "clamp(22px, 6vw, 40px)", color: "#ffffff", background: "#173953", borderRadius: 9, boxShadow: "0 10px 20px rgb(13 42 65 / 19%)" }}
            dividerStyle={{ color: "rgb(255 255 255 / 38%)", height: 1 }}
            separatorStyle={{ color: "#0677b8", size: 5 }}
            spacing={{ clock: "clamp(6px, 2vw, 16px)", digitBlock: 3 }}
            duration={0.6}
            aria-label="Đếm ngược đến khi kết thúc đợt tuyển"
          />
          {registerLink}
        </>
      ) : isOpenWithoutDeadline ? (
        <>
          <p className="countdown-closed">Đợt tuyển đang mở, chưa đặt hạn đóng đơn.</p>
          {registerLink}
        </>
      ) : (
        <>
          <p className="countdown-closed">{deadlineIsValid ? "Đợt tuyển này đã kết thúc." : "Hiện chưa có đợt tuyển đang mở."} Theo dõi BIT để biết đợt tuyển tiếp theo.</p>
          <a href="https://www.facebook.com/BIT.BAV" target="_blank" rel="noopener noreferrer" className="about-button countdown-follow">Theo dõi BIT trên Facebook <span aria-hidden="true">↗</span><span className="sr-only"> (mở tab mới)</span></a>
        </>
      )}
    </div>
  );
}
