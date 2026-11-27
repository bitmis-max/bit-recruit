import Image from "next/image";

export type ClubTeam = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  duties: string[] | null;
  fit_for: string | null;
};

// Ban chưa có ảnh: xoay vòng ảnh hoạt động chung (khác ảnh hero /hero/1.jpg) để các thẻ không giống hệt nhau.
const fallbackPhotos = ["/hero/2.png", "/hero/5.jpg", "/hero/3.jpg", "/hero/4.png"];

function TeamCard({ team, index }: { team: ClubTeam; index: number }) {
  const fallbackPhoto = fallbackPhotos[index % fallbackPhotos.length];
  const description = team.description?.trim() ?? "";
  const paragraphs = description ? description.split(/\n\s*\n/) : [];
  const duties = (team.duties ?? []).filter((duty) => duty.trim());
  const fitFor = team.fit_for?.trim() ?? "";
  // Có việc chính thì phần mô tả nằm hết trong phần mở rộng; chưa có thì thẻ hiện đoạn đầu mô tả.
  const showTeaser = duties.length === 0 && description !== "";
  const hasMore = description !== "" && (duties.length > 0 || paragraphs.length > 1 || description.length > 240);
  const isEmpty = !description && duties.length === 0 && !fitFor;
  const headingId = `team-${team.id}`;

  return (
    <article className="club-team-card" aria-labelledby={headingId}>
      <figure className="club-team-media">
        {team.image_url ? (
          // Ảnh từ Supabase Storage (tên miền ngoài), giữ thẻ img như trước.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.image_url} alt={`Ảnh ban ${team.name}`} loading="lazy" decoding="async" />
        ) : (
          <Image src={fallbackPhoto} alt="" fill sizes="(max-width: 760px) 100vw, 540px" />
        )}
      </figure>

      <div className="club-team-body">
        <h3 id={headingId}>{team.name}</h3>

        {duties.length > 0 && (
          <ul className="club-team-duties" aria-label={`Việc chính của ${team.name}`}>
            {duties.map((duty, index) => <li key={`${index}-${duty}`}>{duty}</li>)}
          </ul>
        )}

        {fitFor && (
          <p className="club-team-fit"><span>Hợp với bạn nếu…</span>{fitFor}</p>
        )}

        {showTeaser && <p className="club-team-teaser">{paragraphs[0]}</p>}
        {isEmpty && <p className="club-team-empty">Thông tin giới thiệu của ban sẽ được cập nhật tại đây.</p>}
      </div>

      {hasMore && (
        <details className="club-team-more">
          <summary>
            <span className="club-team-more-open">Xem giới thiệu đầy đủ</span>
            <span className="club-team-more-close">Thu gọn</span>
          </summary>
          <div className="club-team-full">
            <p>{description}</p>
          </div>
        </details>
      )}
    </article>
  );
}

export function ClubTeamCards({ teams, loadError }: { teams: ClubTeam[]; loadError: boolean }) {
  if (teams.length === 0) {
    return (
      <p className="club-team-empty-state" role={loadError ? "alert" : undefined}>
        {loadError ? "Chưa tải được danh sách ban của CLB. Vui lòng thử lại sau." : "Chưa thể hiển thị danh sách ban của CLB lúc này."}
      </p>
    );
  }

  return (
    <ul className="club-team-grid">
      {teams.map((team, index) => <li key={team.id}><TeamCard team={team} index={index} /></li>)}
    </ul>
  );
}
