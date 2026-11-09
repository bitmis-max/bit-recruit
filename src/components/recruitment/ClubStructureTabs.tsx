"use client";

import { useState } from "react";

type Team = { id: string; name: string; description: string | null; image_url: string | null };

export function ClubStructureTabs({ teams, loadError }: { teams: Team[]; loadError: boolean }) {
  const [activeTeamId, setActiveTeamId] = useState(teams[0]?.id ?? "");
  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];

  return (
    <div className="clubs-structure-inner">
      {teams.length > 0 ? (
        <>
          <div className="club-team-tabs" role="tablist" aria-label="Chọn ban của CLB BIT">
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                id={`team-tab-${team.id}`}
                role="tab"
                aria-selected={activeTeam?.id === team.id}
                aria-controls={`team-panel-${team.id}`}
                className={`club-team-tab${activeTeam?.id === team.id ? " is-active" : ""}`}
                onClick={() => setActiveTeamId(team.id)}
              >
                {team.name}
              </button>
            ))}
          </div>

          {activeTeam && (
            <div key={activeTeam.id} id={`team-panel-${activeTeam.id}`} role="tabpanel" aria-labelledby={`team-tab-${activeTeam.id}`} className="club-team-panel">
              <div className="club-team-description">
                <h2>{activeTeam.name}</h2>
                {activeTeam.description?.trim() ? (
                  <p className="club-team-copy">{activeTeam.description}</p>
                ) : (
                  <p className="club-team-copy club-team-empty">Thông tin giới thiệu của ban sẽ được cập nhật tại đây.</p>
                )}
              </div>
              <figure className="club-team-photo-wrap">
                <img src={activeTeam.image_url || "/hero/1.jpg"} alt={`Ảnh ban ${activeTeam.name}`} className="club-team-photo" />
                <figcaption>{activeTeam.name}</figcaption>
              </figure>
            </div>
          )}
        </>
      ) : (
        <p className="club-team-empty-state" role={loadError ? "alert" : undefined}>
          {loadError ? "Chưa tải được danh sách ban của CLB. Vui lòng thử lại sau." : "Chưa thể hiển thị danh sách ban của CLB lúc này."}
        </p>
      )}
    </div>
  );
}
