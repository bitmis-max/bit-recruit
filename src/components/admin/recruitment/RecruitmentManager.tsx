"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { friendlyError } from "../../../lib/ui/friendly-error";
import { useCurrentAdminClub } from "../AdminClubContext";
import { Button } from "../ui/Button";
import { CreatePanel } from "../ui/CreatePanel";
import { EmptyState } from "../ui/EmptyState";
import { Field, inputClass } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { Panel } from "../ui/Panel";
import { FormBuilder, interviewAvailabilityQuestion, type Question } from "./FormBuilder";

type Campaign = { id: string; club_id: string; name: string; description: string | null; status: "draft" | "open" | "closed" | "done"; start_date: string | null; end_date: string | null };
type Position = { id: string; campaign_id: string; team_id: string | null; name: string; description: string | null };
type Team = { id: string; name: string };
type ApplicationForm = { id: string; name: string; description: string | null; source_template_id: string | null };
type Supabase = NonNullable<ReturnType<typeof getSupabaseClient>>;

const statusLabels = { draft: "Nháp", open: "Đang mở", closed: "Đã đóng", done: "Hoàn tất" };
const toLocalDateTime = (value: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
const toIsoDateTime = (value: FormDataEntryValue | null) => { const text = String(value ?? ""); return text ? new Date(text).toISOString() : null; };
const countEditable = (rows: { question_text: string }[]) => rows.filter((row) => row.question_text.trim() !== interviewAvailabilityQuestion).length;

/** Số câu hỏi của biểu mẫu từng vị trí; vị trí chưa có biểu mẫu thì không có khóa. */
async function fetchFormCounts(supabase: Supabase, ids: string[]) {
  const counts: Record<string, number> = {};
  if (!ids.length) return counts;
  const { data, error } = await supabase.from("application_forms").select("position_id,form_questions(question_text)").in("position_id", ids);
  if (error) return null; // không biết số câu: đừng báo nhầm "Chưa có biểu mẫu"
  for (const row of (data ?? []) as unknown as { position_id: string; form_questions: { question_text: string }[] | null }[]) counts[row.position_id] = countEditable(row.form_questions ?? []);
  return counts;
}

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
  const [formLoading, setFormLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  // Câu hỏi đã sửa/đổi thứ tự nhưng chưa bấm "Lưu các câu hỏi" (thêm/xóa câu hỏi thì đã ghi DB ngay).
  const [formDirty, setFormDirty] = useState(false);
  const [formReload, setFormReload] = useState(0);
  const [formCounts, setFormCounts] = useState<Record<string, number>>({});
  const [countsFailed, setCountsFailed] = useState(false);
  const [campaignDraft, setCampaignDraft] = useState<Campaign | null>(null);
  const [positionDraft, setPositionDraft] = useState<Position | null>(null);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [view, setView] = useState<"detail" | "form">("detail");
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
      if (campaignError) setError(friendlyError(campaignError, "Không tải được danh sách đợt tuyển."));
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

  const refreshTeams = useCallback(async () => {
    if (!supabase || !clubId) return;
    const { data } = await supabase.from("teams").select("id,name").eq("club_id", clubId).order("name");
    if (data) setTeams(data as Team[]);
  }, [supabase, clubId]);

  useEffect(() => {
    const handleTeamsChanged = () => { void refreshTeams(); };
    window.addEventListener("bit:teams-changed", handleTeamsChanged);
    window.addEventListener("focus", handleTeamsChanged);
    return () => {
      window.removeEventListener("bit:teams-changed", handleTeamsChanged);
      window.removeEventListener("focus", handleTeamsChanged);
    };
  }, [refreshTeams]);

  useEffect(() => {
    let cancelled = false;
    async function loadPositions() {
      if (!supabase || !campaignId) { setPositions([]); setPositionId(""); setPositionDraft(null); return; }
      const { data, error: queryError } = await supabase.from("recruitment_positions").select("id,campaign_id,team_id,name,description").eq("campaign_id", campaignId).order("created_at");
      if (cancelled) return;
      if (queryError) { reportError(friendlyError(queryError, "Không tải được danh sách vị trí tuyển.")); setPositions([]); return; }
      const rows = (data ?? []) as Position[];
      setPositions(rows);
      setPositionId("");
      setPositionDraft(null);
      const counts = await fetchFormCounts(supabase, rows.map((row) => row.id));
      if (!cancelled) { setCountsFailed(counts === null); setFormCounts(counts ?? {}); }
    }
    void loadPositions();
    return () => { cancelled = true; };
  }, [supabase, campaignId, reportError]);

  useEffect(() => {
    let cancelled = false;
    async function loadForm() {
      setForm(null); setQuestions([]); setFormDirty(false);
      if (!supabase || !positionId) { setFormLoading(false); return; }
      setFormLoading(true);
      const { data: formRow, error: formError } = await supabase.from("application_forms").select("id,name,description,source_template_id").eq("position_id", positionId).maybeSingle();
      if (cancelled) return;
      if (formError) { reportError(friendlyError(formError, "Không tải được biểu mẫu của vị trí này.")); setFormLoading(false); return; }
      if (!formRow) { setFormLoading(false); return; }
      setForm(formRow as ApplicationForm);
      const { data, error: questionError } = await supabase.from("form_questions").select("id,question_text,question_type,field_key,options,is_required,order_index").eq("form_id", formRow.id).order("order_index");
      if (cancelled) return;
      if (questionError) reportError(friendlyError(questionError, "Không tải được câu hỏi của biểu mẫu.")); else setQuestions((data ?? []) as Question[]);
      setFormLoading(false);
    }
    void loadForm();
    return () => { cancelled = true; };
  }, [supabase, positionId, reportError, formReload]);

  function resetPosition() { setPositionId(""); setPositionDraft(null); setForm(null); setQuestions([]); setFormDirty(false); setView("detail"); }
  const discardUnsaved = () => !formDirty || confirm("Có câu hỏi đã sửa nhưng chưa lưu. Bỏ các thay đổi này?");

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !clubId || !canWrite) return;
    const values = new FormData(event.currentTarget); setBusy(true);
    const { data, error: insertError } = await supabase.from("recruitment_campaigns").insert({ club_id: clubId, name: String(values.get("name")).trim(), description: String(values.get("description") ?? "").trim() || null, status: "draft" }).select("id,club_id,name,description,status,start_date,end_date").single();
    setBusy(false);
    if (insertError) reportError(friendlyError(insertError, "Không tạo được đợt tuyển.")); else { setCampaigns((rows) => [data as Campaign, ...rows]); resetPosition(); setCampaignId(data.id); setCampaignDraft(data as Campaign); setCreatingCampaign(false); reportSuccess("Đã tạo đợt tuyển."); }
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !campaignDraft || !canWrite) return;
    const values = new FormData(event.currentTarget);
    const startDate = toIsoDateTime(values.get("start_date"));
    const endDate = toIsoDateTime(values.get("end_date"));
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) { reportError("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu."); return; }
    setBusy(true);
    const payload = { name: String(values.get("name")).trim(), description: String(values.get("description") ?? "").trim() || null, status: String(values.get("status")), start_date: startDate, end_date: endDate };
    const { error: updateError } = await supabase.from("recruitment_campaigns").update(payload).eq("id", campaignDraft.id);
    setBusy(false);
    if (updateError) reportError(friendlyError(updateError, "Không lưu được đợt tuyển.")); else { const updated = { ...campaignDraft, ...payload } as Campaign; setCampaignDraft(updated); setCampaigns((rows) => rows.map((row) => row.id === updated.id ? updated : row)); reportSuccess("Đã lưu đợt tuyển."); }
  }

  async function deleteCampaign() {
    if (!supabase || !campaignDraft || !confirm("Xóa đợt tuyển này cùng các ban, biểu mẫu và câu hỏi liên quan?")) return;
    const { count, error: countError } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("campaign_id", campaignDraft.id);
    if (countError) { reportError(friendlyError(countError, "Không kiểm tra được số đơn ứng tuyển.")); return; }
    if (count) { reportError("Đợt tuyển đã có đơn ứng tuyển nên không thể xóa để bảo toàn hồ sơ. Hãy chuyển trạng thái sang Hoàn tất hoặc Đã đóng."); return; }
    const { error: deleteError } = await supabase.from("recruitment_campaigns").delete().eq("id", campaignDraft.id);
    if (deleteError) reportError(friendlyError(deleteError, "Không xóa được đợt tuyển.")); else { const rows = campaigns.filter((row) => row.id !== campaignDraft.id); resetPosition(); setCampaigns(rows); setCampaignId(rows[0]?.id ?? ""); setCampaignDraft(rows[0] ?? null); reportSuccess("Đã xóa đợt tuyển."); }
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
    if (result.error) reportError(friendlyError(result.error, "Không lưu được vị trí tuyển.")); else { const row = result.data as Position; setPositions((items) => positionDraft?.id ? items.map((item) => item.id === row.id ? row : item) : [...items, row]); setPositionId(row.id); setPositionDraft(row); reportSuccess(positionDraft?.id ? "Đã lưu vị trí tuyển." : "Đã tạo vị trí tuyển."); }
  }

  function newPosition() { setPositionId(""); setPositionDraft({ id: "", campaign_id: campaignId, team_id: null, name: "", description: null }); setForm(null); setQuestions([]); setView("detail"); }

  async function deletePosition() {
    if (!supabase || !positionDraft?.id || !confirm("Xóa vị trí cùng biểu mẫu và câu hỏi của ban?")) return;
    const { count, error: countError } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("position_id", positionDraft.id);
    if (countError) { reportError(friendlyError(countError, "Không kiểm tra được số đơn ứng tuyển.")); return; }
    if (count) { reportError("Ban tuyển đã có đơn ứng tuyển nên không thể xóa để bảo toàn hồ sơ."); return; }
    const { error: deleteError } = await supabase.from("recruitment_positions").delete().eq("id", positionDraft.id);
    if (deleteError) reportError(friendlyError(deleteError, "Không xóa được vị trí tuyển.")); else { setPositions(positions.filter((row) => row.id !== positionDraft.id)); resetPosition(); reportSuccess("Đã xóa vị trí."); }
  }

  async function backToCampaign() {
    if (!discardUnsaved()) return;
    if (formDirty) setFormReload((n) => n + 1);
    setView("detail");
    if (supabase) { const counts = await fetchFormCounts(supabase, positions.map((row) => row.id)); setCountsFailed(counts === null); if (counts) setFormCounts(counts); }
  }

  function openPosition(position: Position) { setPositionId(position.id); setPositionDraft(position); setView("detail"); }

  function selectCampaign(campaign: Campaign) { if (!discardUnsaved()) return; resetPosition(); setCampaignId(campaign.id); setCampaignDraft(campaign); }

  // Biểu mẫu đang mở thì lấy số câu hỏi theo dữ liệu đang sửa; còn lại theo lần tải gần nhất.
  const questionCount = (id: string) => id === positionId && form ? countEditable(questions) : formCounts[id];
  const teamName = (teamId: string | null) => teams.find((team) => team.id === teamId)?.name;
  const showForm = view === "form" && !!positionDraft?.id;

  const positionForm = positionDraft && <form key={positionDraft.id || "new-position"} onSubmit={savePosition} className="grid gap-4 sm:grid-cols-2">
    <Field label="Tên vị trí"><input name="name" required defaultValue={positionDraft.name} disabled={!canWrite} className={inputClass} data-autofocus={!positionDraft.id || undefined} /></Field>
    <Field label="Ban chủ quản"><select name="team_id" defaultValue={positionDraft.team_id ?? ""} disabled={!canWrite} className={inputClass}><option value="" disabled>Chọn ban</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></Field>
    <Field label="Mô tả" className="sm:col-span-2"><textarea name="description" rows={2} defaultValue={positionDraft.description ?? ""} disabled={!canWrite} className={inputClass} /></Field>
    <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
      {canWrite && <Button type="submit" loading={busy}>{positionDraft.id ? "Lưu vị trí" : "Tạo vị trí"}</Button>}
      {positionDraft.id && <Button icon="edit" onClick={() => setView("form")}>{canWrite ? "Sửa biểu mẫu" : "Xem biểu mẫu"}{questionCount(positionDraft.id) !== undefined ? ` (${questionCount(positionDraft.id)} câu)` : countsFailed ? "" : canWrite ? " (chưa có)" : ""}</Button>}
      {!positionDraft.id && <Button onClick={resetPosition}>Hủy</Button>}
      {canWrite && positionDraft.id && <Button variant="danger" icon="trash" className="sm:ml-auto" onClick={() => void deletePosition()}>Xóa vị trí</Button>}
    </div>
  </form>;

  if (loading) return <section className="mx-auto max-w-6xl p-5 sm:p-8"><div role="status" aria-label="Đang tải dữ liệu tuyển gen" className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="h-48 animate-pulse rounded-xl bg-zinc-100" /><div className="h-72 animate-pulse rounded-xl bg-zinc-100" /></div></section>;
  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <PageHeader title="Đợt tuyển" description="Đợt tuyển, vị trí tuyển và biểu mẫu ứng tuyển của CLB." actions={canWrite && <Button variant="primary" icon="plus" onClick={() => setCreatingCampaign(true)} aria-expanded={creatingCampaign}>Đợt tuyển mới</Button>} />
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    <CreatePanel open={creatingCampaign} title="Tạo đợt tuyển" onClose={() => setCreatingCampaign(false)}>
      <form onSubmit={createCampaign} className="space-y-4">
        <Field label="Tên đợt tuyển"><input required name="name" className={inputClass} placeholder="Tuyển thành viên 2026" data-autofocus /></Field>
        <Field label="Mô tả"><textarea name="description" rows={2} className={inputClass} /></Field>
        <div className="flex gap-2"><Button type="submit" variant="primary" loading={busy}>{busy ? "Đang tạo…" : "Tạo đợt tuyển"}</Button><Button onClick={() => setCreatingCampaign(false)}>Hủy</Button></div>
      </form>
    </CreatePanel>
    {!campaigns.length
      ? <Panel padded={false}><EmptyState title="Chưa có đợt tuyển" description={canWrite ? "Tạo đợt tuyển đầu tiên để thêm vị trí và biểu mẫu ứng tuyển." : "CLB chưa có đợt tuyển nào."} action={canWrite && !creatingCampaign && <Button variant="primary" icon="plus" onClick={() => setCreatingCampaign(true)}>Đợt tuyển mới</Button>} /></Panel>
      : <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Panel title="Các đợt tuyển" padded={false}>
          <ul className="space-y-0.5 p-2">{campaigns.map((campaign) => <li key={campaign.id}><button type="button" aria-current={campaignId === campaign.id ? "true" : undefined} onClick={() => selectCampaign(campaign)} className={`w-full rounded-lg px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600 ${campaignId === campaign.id ? "bg-emerald-50 text-emerald-900" : "text-zinc-700 hover:bg-zinc-100"}`}><span className="block text-sm font-medium">{campaign.name}</span><span className={`mt-0.5 block text-xs ${campaign.status === "open" ? "text-emerald-700" : "text-zinc-500"}`}>{statusLabels[campaign.status]}</span></button></li>)}</ul>
        </Panel>
        {campaignDraft && (showForm && positionDraft
          ? <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button variant="ghost" size="sm" onClick={() => void backToCampaign()}><Icon name="chevron-right" size={14} className="rotate-180" />Quay lại đợt tuyển</Button>
              <p className="min-w-0 text-sm text-zinc-600">{campaignDraft.name} · <span className="font-medium text-zinc-900">{positionDraft.name}</span></p>
            </div>
            {formLoading
              ? <div role="status" aria-label="Đang tải biểu mẫu" className="h-64 animate-pulse rounded-xl bg-zinc-100" />
              : <FormBuilder key={`form-builder-${positionDraft.id}`} positionId={positionDraft.id} form={form} questions={questions} canWrite={canWrite} onFormChange={setForm} onQuestionsChange={setQuestions} onError={reportError} onDirtyChange={setFormDirty} />}
          </div>
          : <div className="space-y-5">
            <Panel title="Thông tin đợt tuyển">
              <form onSubmit={saveCampaign} className="grid gap-4 sm:grid-cols-2">
                <Field label="Tên"><input key={`${campaignDraft.id}-name`} name="name" required defaultValue={campaignDraft.name} disabled={!canWrite} className={inputClass} /></Field>
                <Field label="Trạng thái"><select key={`${campaignDraft.id}-status`} name="status" defaultValue={campaignDraft.status} disabled={!canWrite} className={inputClass}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Bắt đầu"><input key={`${campaignDraft.id}-start`} type="datetime-local" name="start_date" defaultValue={toLocalDateTime(campaignDraft.start_date)} disabled={!canWrite} className={inputClass} /></Field>
                <Field label="Kết thúc"><input key={`${campaignDraft.id}-end`} type="datetime-local" name="end_date" defaultValue={toLocalDateTime(campaignDraft.end_date)} disabled={!canWrite} className={inputClass} /></Field>
                <Field label="Mô tả" className="sm:col-span-2"><textarea key={`${campaignDraft.id}-description`} name="description" rows={3} defaultValue={campaignDraft.description ?? ""} disabled={!canWrite} className={inputClass} /></Field>
                {canWrite && <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4 sm:col-span-2">
                  <Button type="submit" variant="primary" loading={busy}>Lưu đợt tuyển</Button>
                  <Button variant="danger" icon="trash" className="sm:ml-auto" onClick={() => void deleteCampaign()}>Xóa đợt tuyển</Button>
                </div>}
              </form>
            </Panel>
            <Panel title="Ban tuyển" padded={false} actions={canWrite && <Button size="sm" icon="plus" onClick={newPosition} disabled={positionDraft?.id === ""}>Thêm vị trí</Button>}>
              {!positions.length && !positionDraft
                ? <EmptyState title="Chưa có vị trí tuyển" description="Thêm vị trí (ví dụ một ban) rồi tạo biểu mẫu ứng tuyển cho vị trí đó." action={canWrite && <Button icon="plus" onClick={newPosition}>Thêm vị trí</Button>} />
                : <ul className="divide-y divide-zinc-100">
                  {positionDraft && !positionDraft.id && <li className="bg-zinc-50/70 px-4 py-4 sm:px-5"><p className="mb-3 text-sm font-semibold text-zinc-900">Vị trí mới</p>{positionForm}</li>}
                  {positions.map((position) => {
                    const open = positionId === position.id;
                    const count = questionCount(position.id);
                    return <li key={position.id} className={open ? "bg-zinc-50/70" : undefined}>
                      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-900">{position.name}</p>
                          <p className="truncate text-xs text-zinc-500">{teamName(position.team_id) ?? "Chưa gán ban"} · {count === undefined ? (countsFailed ? "Chưa tải được số câu hỏi" : "Chưa có biểu mẫu") : `${count} câu hỏi`}</p>
                        </div>
                        <Button size="sm" icon={open ? "close" : "edit"} aria-expanded={open} onClick={() => { if (!discardUnsaved()) return; if (open) resetPosition(); else openPosition(position); }}>{open ? "Đóng" : canWrite ? "Sửa" : "Xem"}</Button>
                      </div>
                      {open && positionDraft && <div className="border-t border-zinc-100 px-4 py-4 sm:px-5">{positionForm}</div>}
                    </li>;
                  })}
                </ul>}
            </Panel>
          </div>)}
      </div>}
  </section>;
}
