type CampaignOption = {
  id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

function campaignTime(value: string | null, fallback: string) {
  const time = Date.parse(value ?? fallback);
  return Number.isNaN(time) ? 0 : time;
}

export function getNearestCampaignId(campaigns: CampaignOption[], now = Date.now()) {
  const active = campaigns.filter((campaign) =>
    campaign.status === "open"
    && (!campaign.start_date || Date.parse(campaign.start_date) <= now)
    && (!campaign.end_date || Date.parse(campaign.end_date) >= now),
  );
  if (active.length) {
    return [...active].sort((a, b) => campaignTime(b.start_date, b.created_at) - campaignTime(a.start_date, a.created_at))[0].id;
  }

  const upcoming = campaigns.filter((campaign) => campaign.status === "open" && campaign.start_date && Date.parse(campaign.start_date) > now);
  if (upcoming.length) {
    return [...upcoming].sort((a, b) => campaignTime(a.start_date, a.created_at) - campaignTime(b.start_date, b.created_at))[0].id;
  }

  return [...campaigns].sort((a, b) => campaignTime(b.start_date, b.created_at) - campaignTime(a.start_date, a.created_at))[0]?.id ?? "";
}
