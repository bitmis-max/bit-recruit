"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";
import { getNearestCampaignId } from "../../lib/recruitment/campaign-selection";
import { friendlyError } from "../../lib/ui/friendly-error";
import type { ParsedData } from "../../lib/files/parse";
import { fetchAllPages } from "../admin/recruitment/loadAnswers";
import { Button } from "../admin/ui/Button";
import { Field, inputClass } from "../admin/ui/Field";
import { Notice } from "../admin/ui/Notice";
import { APPLICATION_COLUMNS, buildApplicantRows, type ApplicationRecord } from "./applicationRows";

type Campaign = { id: string; name: string; status: string; start_date: string | null; end_date: string | null; created_at: string };
type Position = { id: string; campaign_id: string; name: string };
type Preview = { rows: Record<string, string>[]; noEmail: number; duplicates: number };

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

  // Khối nền nhạt (không viền) để không lồng khung trong Panel.
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg bg-zinc-50 p-4">
      {campaigns && !campaigns.length ? (
        <p className="text-sm text-zinc-600">CLB chưa có đợt tuyển nào.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Đợt tuyển">
            <select className={inputClass} value={campaignId} disabled={loading || !campaigns} onChange={(event) => changeCampaign(event.target.value)}>
              {(campaigns ?? []).map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </Field>
          <Field label="Vị trí (không bắt buộc)">
            <select className={inputClass} value={positionId} disabled={loading || !campaigns} onChange={(event) => changePosition(event.target.value)}>
              <option value="">Tất cả vị trí</option>
              {campaignPositions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
            </select>
          </Field>
        </div>
      )}
      <p role="status" className="text-sm text-zinc-600">
        {loading ? "Đang đếm đơn ứng tuyển…" : preview
          ? `${preview.rows.length} người có email${preview.duplicates ? `, đã loại ${preview.duplicates} email trùng` : ""}${preview.noEmail ? `, bỏ ${preview.noEmail} đơn không có email` : ""}.`
          : ""}
      </p>
      {error ? <Notice tone="error" className="mb-0!">{error}</Notice> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Đóng</Button>
        <Button
          variant="secondary"
          icon="check"
          disabled={loading || !preview?.rows.length}
          onClick={() => { if (preview) { onImport({ columns: APPLICATION_COLUMNS, rows: preview.rows }); onClose(); } }}
        >
          {preview?.rows.length ? `Nạp ${preview.rows.length} người` : "Nạp vào danh sách"}
        </Button>
      </div>
    </div>
  );
}
