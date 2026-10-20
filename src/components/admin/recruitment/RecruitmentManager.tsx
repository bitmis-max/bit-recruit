"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { useCurrentAdminClub } from "../AdminShell";
import { FormBuilder, type Question } from "./FormBuilder";

type Campaign = { id: string; club_id: string; name: string; description: string | null; status: "draft" | "open" | "closed" | "done"; start_date: string | null; end_date: string | null };
type Position = { id: string; campaign_id: string; team_id: string | null; name: string; description: string | null };
type Team = { id: string; name: string };
type ApplicationForm = { id: string; name: string; description: string | null };

const statusLabels = { draft: "Nháp", open: "Đang mở", closed: "Đã đóng", done: "Hoàn tất" };
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600";
const toLocalDateTime = (value: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
const toIsoDateTime = (value: FormDataEntryValue | null) => { const text = String(value ?? ""); return text ? new Date(text).toISOString() : null; };

export function RecruitmentManager() {
  const supabase = getSupabaseClient();
  const { id: clubId, role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionId, setPositionId] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [form, setForm] = useState<ApplicationForm | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [campaignDraft, setCampaignDraft] = useState<Campaign | null>(null);
  const [positionDraft, setPositionDraft] = useState<Position | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reportError = useCallback((message: string) => { setError(message); setNotice(null); }, []);
  const reportSuccess = (message: string) => { setNotice(message); setError(null); };

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!supabase) { setLoading(false); return; }
      if (!clubId) { setError("Tài khoản chưa được gán vào CLB nào."); setLoading(false); return; }
      const [{ data: clubTeams }, { data: campaignRows, error: campaignError }] = await Promise.all([
        supabase.from("teams").select("id,name").eq("club_id", clubId).order("name"),
        supabase.from("recruitment_campaigns").select("id,club_id,name,description,status,start_date,end_date").eq("club_id", clubId).order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      if (campaignError) setError(campaignError.message);
      setTeams((clubTeams ?? []) as Team[]);
      const rows = (campaignRows ?? []) as Campaign[];
      setCampaigns(rows);
      setCampaignId(rows[0]?.id ?? "");
      setCampaignDraft(rows[0] ?? null);
      setLoading(false);
    }
    void init();
    return () => { cancelled = true; };
  }, [supabase, clubId]);

  useEffect(() => {
    let cancelled = false;
    async function loadPositions() {
      if (!supabase || !campaignId) { setPositions([]); setPositionId(""); return; }
      const { data, error: queryError } = await supabase.from("recruitment_positions").select("id,campaign_id,team_id,name,description").eq("campaign_id", campaignId).order("created_at");
      if (cancelled) return;
      if (queryError) { reportError(queryError.message); setPositions([]); return; }
      const rows = (data ?? []) as Position[];
      setPositions(rows);
      const firstPosition = rows[0] ?? null;
      setPositionId(firstPosition?.id ?? "");
      setPositionDraft(firstPosition);
    }
    void loadPositions();
    return () => { cancelled = true; };
  }, [supabase, campaignId, reportError]);

  useEffect(() => {
    let cancelled = false;
    async function loadForm() {
      setForm(null); setQuestions([]);
      if (!supabase || !positionId) return;
      const { data: formRow, error: formError } = await supabase.from("application_forms").select("id,name,description").eq("position_id", positionId).maybeSingle();
      if (cancelled) return;
      if (formError) { reportError(formError.message); return; }
      if (!formRow) return;
      setForm(formRow as ApplicationForm);
      const { data, error: questionError } = await supabase.from("form_questions").select("id,question_text,question_type,options,is_required,order_index").eq("form_id", formRow.id).order("order_index");
      if (cancelled) return;
      if (questionError) reportError(questionError.message); else setQuestions((data ?? []) as Question[]);
    }
    void loadForm();
    return () => { cancelled = true; };
  }, [supabase, positionId, reportError]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !clubId || !canWrite) return;
    const formElement = event.currentTarget;
    const values = new FormData(formElement); setBusy(true);
    const { data, error: insertError } = await supabase.from("recruitment_campaigns").insert({ club_id: clubId, name: String(values.get("name")).trim(), description: String(values.get("description") ?? "").trim() || null, status: "draft" }).select("id,club_id,name,description,status,start_date,end_date").single();
    setBusy(false);
    if (insertError) reportError(insertError.message); else { setCampaigns((rows) => [data as Campaign, ...rows]); setPositionId(""); setPositionDraft(null); setForm(null); setQuestions([]); setCampaignId(data.id); setCampaignDraft(data as Campaign); formElement.reset(); reportSuccess("Đã tạo đợt tuyển."); }
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !campaignDraft || !canWrite) return;
    const values = new FormData(event.currentTarget); setBusy(true);
    const payload = { name: String(values.get("name")).trim(), description: String(values.get("description") ?? "").trim() || null, status: String(values.get("status")), start_date: toIsoDateTime(values.get("start_date")), end_date: toIsoDateTime(values.get("end_date")) };
    const { error: updateError } = await supabase.from("recruitment_campaigns").update(payload).eq("id", campaignDraft.id);
    setBusy(false);
    if (updateError) reportError(updateError.message); else { const updated = { ...campaignDraft, ...payload } as Campaign; setCampaignDraft(updated); setCampaigns((rows) => rows.map((row) => row.id === updated.id ? updated : row)); reportSuccess("Đã lưu đợt tuyển."); }
  }

  async function deleteCampaign() {
    if (!supabase || !campaignDraft || !confirm("Xóa đợt tuyển này cùng các ban, biểu mẫu và câu hỏi liên quan?")) return;
    const { count, error: countError } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("campaign_id", campaignDraft.id);
    if (countError) { reportError(countError.message); return; }
    if (count) { reportError("Đợt tuyển đã có đơn ứng tuyển nên không thể xóa để bảo toàn hồ sơ. Hãy chuyển trạng thái sang Hoàn tất hoặc Đã đóng."); return; }
    const { error: deleteError } = await supabase.from("recruitment_campaigns").delete().eq("id", campaignDraft.id);
    if (deleteError) reportError(deleteError.message); else { const rows = campaigns.filter((row) => row.id !== campaignDraft.id); setCampaigns(rows); setCampaignId(rows[0]?.id ?? ""); setCampaignDraft(rows[0] ?? null); reportSuccess("Đã xóa đợt tuyển."); }
  }

  async function savePosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !campaignId || !canWrite) return;
    const values = new FormData(event.currentTarget);
    const payload = { campaign_id: campaignId, name: String(values.get("name")).trim(), description: String(values.get("description") ?? "").trim() || null, team_id: String(values.get("team_id") ?? "") || null };
    setBusy(true);
    const result = positionDraft?.id
      ? await supabase.from("recruitment_positions").update(payload).eq("id", positionDraft.id).select("id,campaign_id,team_id,name,description").single()
      : await supabase.from("recruitment_positions").insert(payload).select("id,campaign_id,team_id,name,description").single();
    setBusy(false);
    if (result.error) reportError(result.error.message); else { const row = result.data as Position; setPositions((items) => positionDraft?.id ? items.map((item) => item.id === row.id ? row : item) : [...items, row]); setPositionId(row.id); setPositionDraft(row); reportSuccess(positionDraft?.id ? "Đã lưu ban tuyển." : "Đã tạo ban tuyển."); }
  }

  function newPosition() { setPositionId(""); setPositionDraft({ id: "", campaign_id: campaignId, team_id: null, name: "", description: null }); setForm(null); setQuestions([]); }

  async function deletePosition() {
    if (!supabase || !positionDraft?.id || !confirm("Xóa vị trí cùng biểu mẫu và câu hỏi của ban?")) return;
    const { count, error: countError } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("position_id", positionDraft.id);
    if (countError) { reportError(countError.message); return; }
    if (count) { reportError("Ban tuyển đã có đơn ứng tuyển nên không thể xóa để bảo toàn hồ sơ."); return; }
    const { error: deleteError } = await supabase.from("recruitment_positions").delete().eq("id", positionDraft.id);
    if (deleteError) reportError(deleteError.message); else { const rows = positions.filter((row) => row.id !== positionDraft.id); setPositions(rows); setPositionId(rows[0]?.id ?? ""); setPositionDraft(rows[0] ?? null); setForm(null); setQuestions([]); reportSuccess("Đã xóa vị trí."); }
  }

  if (loading) return <div className="p-8 text-sm text-zinc-600">Đang tải dữ liệu tuyển gen…</div>;
  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <header className="mb-6"><p className="text-sm font-semibold text-emerald-700">Quản trị CLB</p><h1 className="mt-1 text-3xl font-bold">Quản lý tuyển gen</h1></header>
    {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}{notice && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-4">
        {canWrite && <form onSubmit={createCampaign} className="rounded-xl border bg-white p-4"><h2 className="mb-3 font-semibold">Tạo đợt tuyển</h2><label className="text-sm">Tên đợt tuyển<input required name="name" className={inputClass} placeholder="Tuyển thành viên 2026" /></label><label className="mt-3 block text-sm">Mô tả<textarea name="description" rows={2} className={inputClass} /></label><button disabled={busy} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Tạo đợt tuyển</button></form>}
        <div className="rounded-xl border bg-white p-3"><h2 className="px-2 py-1 text-sm font-semibold">Các đợt tuyển</h2>{campaigns.length ? <ul className="mt-2 space-y-1">{campaigns.map((campaign) => <li key={campaign.id}><button onClick={() => { setPositionId(""); setPositionDraft(null); setForm(null); setQuestions([]); setCampaignId(campaign.id); setCampaignDraft(campaign); }} className={`w-full rounded-lg px-3 py-2 text-left ${campaignId === campaign.id ? "bg-emerald-50 text-emerald-900" : "hover:bg-zinc-50"}`}><span className="block text-sm font-medium">{campaign.name}</span><span className="mt-1 block text-xs text-zinc-500">{statusLabels[campaign.status]}</span></button></li>)}</ul> : <p className="px-2 py-3 text-sm text-zinc-500">Chưa có đợt tuyển.</p>}</div>
      </aside>
      <div className="space-y-5">
        {campaignDraft ? <>
          <form onSubmit={saveCampaign} className="rounded-xl border bg-white p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Thông tin đợt tuyển</h2>{canWrite && <button type="button" onClick={() => void deleteCampaign()} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100">Xóa đợt tuyển</button>}</div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Tên<input key={`${campaignDraft.id}-name`} name="name" required defaultValue={campaignDraft.name} disabled={!canWrite} className={inputClass} /></label><label className="text-sm">Trạng thái<select key={`${campaignDraft.id}-status`} name="status" defaultValue={campaignDraft.status} disabled={!canWrite} className={inputClass}>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm">Bắt đầu<input key={`${campaignDraft.id}-start`} type="datetime-local" name="start_date" defaultValue={toLocalDateTime(campaignDraft.start_date)} disabled={!canWrite} className={inputClass} /></label><label className="text-sm">Kết thúc<input key={`${campaignDraft.id}-end`} type="datetime-local" name="end_date" defaultValue={toLocalDateTime(campaignDraft.end_date)} disabled={!canWrite} className={inputClass} /></label><label className="text-sm sm:col-span-2">Mô tả<textarea key={`${campaignDraft.id}-description`} name="description" rows={3} defaultValue={campaignDraft.description ?? ""} disabled={!canWrite} className={inputClass} /></label></div>{canWrite && <button disabled={busy} className="mt-4 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800">Lưu đợt tuyển</button>}</form>
          <div className="rounded-xl border bg-white p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-semibold">Ban tuyển</h2></div>{canWrite && <button type="button" onClick={newPosition} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">+ Thêm vị trí</button>}</div>
            {positions.length > 0 && <select value={positionId} onChange={(event) => { const row = positions.find((item) => item.id === event.target.value) ?? null; setPositionId(event.target.value); setPositionDraft(row); }} className="mb-4 w-full rounded-lg border bg-white px-3 py-2 text-sm"><option value="">Chọn ban tuyển</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select>}
            {positionDraft ? <><form key={positionDraft.id || "new-position"} onSubmit={savePosition} className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Tên vị trí<input name="name" required defaultValue={positionDraft.name} disabled={!canWrite} className={inputClass} /></label><label className="text-sm">Ban chủ quản<select name="team_id" defaultValue={positionDraft.team_id ?? ""} disabled={!canWrite} className={inputClass}><option value="" disabled>Chọn ban</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="text-sm sm:col-span-2">Mô tả<textarea name="description" rows={2} defaultValue={positionDraft.description ?? ""} disabled={!canWrite} className={inputClass} /></label><div className="flex gap-3 sm:col-span-2">{canWrite && <button disabled={busy} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800">{positionDraft.id ? "Lưu vị trí" : "Tạo vị trí"}</button>}{canWrite && positionDraft.id && <button type="button" onClick={() => void deletePosition()} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100">Xóa vị trí</button>}</div></form>
              {positionDraft.id && <FormBuilder key={`form-builder-${positionDraft.id}`} positionId={positionDraft.id} form={form} questions={questions} canWrite={canWrite} onFormChange={setForm} onQuestionsChange={setQuestions} onError={reportError} />}
            </> : <p className="rounded-lg border border-dashed p-5 text-sm text-zinc-500">Chọn ban tuyển hoặc tạo ban mới.</p>}
          </div>
        </> : <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-zinc-500">{canWrite ? "Tạo hoặc chọn một đợt tuyển để bắt đầu." : "CLB chưa có đợt tuyển nào."}</div>}
      </div>
    </div>
  </section>;
}
