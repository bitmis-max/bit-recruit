"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";
import { getNearestCampaignId } from "../../lib/recruitment/campaign-selection";
import { friendlyError } from "../../lib/ui/friendly-error";
import type { ParsedData } from "../../lib/files/parse";
import { fetchAllPages } from "../admin/recruitment/loadAnswers";
import { APPLICATION_COLUMNS, buildApplicantRows, type ApplicationRecord } from "./applicationRows";

type Campaign = { id: string; name: string; status: string; start_date: string | null; end_date: string | null; created_at: string };
type Position = { id: string; campaign_id: string; name: string };
type Preview = { rows: Record<string, string>[]; noEmail: number; duplicates: number };

const selectClass = "mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function ApplicationImport({ clubId, onImport, onClose }: { clubId: string; onImport: (data: ParsedData) => void; onClose: () => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  async function loadCampaigns() {
    const supabase = getSupabaseClient();
    if (!supabase || !clubId) { setError("Không thể tải dữ liệu ứng tuyển của CLB hiện tại."); return; }
    setLoading(true); setError("");
    const { data: campaignRows, error: campaignError } = await supabase.from("recruitment_campaigns")
      .select("id,name,status,start_date,end_date,created_at").eq("club_id", clubId);
    if (campaignError) { setLoading(false); setError(friendlyError(campaignError, "Không tải được danh sách đợt tuyển.")); return; }
    const campaignList = (campaignRows ?? []) as Campaign[];
    if (!campaignList.length) { setLoading(false); setCampaigns([]); return; }
    const { data: positionRows, error: positionError } = await supabase.from("recruitment_positions")
      .select("id,campaign_id,name").in("campaign_id", campaignList.map((campaign) => campaign.id)).order("name");
    if (positionError) { setLoading(false); setError(friendlyError(positionError, "Không tải được danh sách vị trí.")); return; }
    const positionList = (positionRows ?? []) as Position[];
    const initial = getNearestCampaignId(campaignList);
    setCampaigns(campaignList); setPositions(positionList); setCampaignId(initial); setPositionId("");
    await loadPreview(campaignList, initial, "", positionList);
  }

  async function loadPreview(campaignList: Campaign[], nextCampaignId: string, nextPositionId: string, positionRows: Position[]) {
    const supabase = getSupabaseClient();
    if (!supabase || !nextCampaignId) return;
    const current = ++requestId.current;
    setLoading(true); setError(""); setPreview(null);
    const { data, error: queryError } = await fetchAllPages<ApplicationRecord>((from, to) => {
      let query = supabase.from("applications")
        .select("position_id,email,full_name,phone,student_code,class_name")
        .eq("campaign_id", nextCampaignId);
      if (nextPositionId) query = query.eq("position_id", nextPositionId);
      return query.order("submitted_at", { ascending: false }).order("id").range(from, to);
    });
    if (current !== requestId.current) return;
    setLoading(false);
    if (queryError) { setError(friendlyError(queryError, "Không tải được đơn ứng tuyển.")); return; }
    const campaignName = campaignList.find((campaign) => campaign.id === nextCampaignId)?.name ?? "";
    setPreview(buildApplicantRows(data, campaignName, new Map(positionRows.map((position) => [position.id, position.name]))));
  }

  // Hộp chỉ được gắn khi người dùng bấm "Import đơn ứng tuyển": tải danh sách đợt một lần.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const campaignPositions = positions.filter((position) => position.campaign_id === campaignId);

  function changeCampaign(value: string) {
    setCampaignId(value); setPositionId("");
    void loadPreview(campaigns ?? [], value, "", positions);
  }
  function changePosition(value: string) {
    setPositionId(value);
    void loadPreview(campaigns ?? [], campaignId, value, positions);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      {campaigns && !campaigns.length ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-300">CLB chưa có đợt tuyển nào.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Đợt tuyển
            <select className={selectClass} value={campaignId} disabled={loading || !campaigns} onChange={(event) => changeCampaign(event.target.value)}>
              {(campaigns ?? []).map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Vị trí (không bắt buộc)
            <select className={selectClass} value={positionId} disabled={loading || !campaigns} onChange={(event) => changePosition(event.target.value)}>
              <option value="">Tất cả vị trí</option>
              {campaignPositions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
            </select>
          </label>
        </div>
      )}
      <p role="status" className="text-xs text-zinc-600 dark:text-zinc-300">
        {loading ? "Đang đếm đơn ứng tuyển…" : preview
          ? `${preview.rows.length} người có email${preview.duplicates ? `, đã loại ${preview.duplicates} email trùng` : ""}${preview.noEmail ? `, bỏ ${preview.noEmail} đơn không có email` : ""}.`
          : ""}
      </p>
      {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">Đóng</button>
        <button
          type="button"
          disabled={loading || !preview?.rows.length}
          onClick={() => { if (preview) { onImport({ columns: APPLICATION_COLUMNS, rows: preview.rows }); onClose(); } }}
          className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {preview?.rows.length ? `Nạp ${preview.rows.length} người` : "Nạp vào danh sách"}
        </button>
      </div>
    </div>
  );
}
