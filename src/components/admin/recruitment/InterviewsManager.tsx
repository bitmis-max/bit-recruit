"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { getNearestCampaignId } from "../../../lib/recruitment/campaign-selection";
import { normalizeSearchText } from "../../../lib/recruitment/search";
import { useCurrentAdminClub } from "../AdminClubContext";
import { roleLabel } from "../roles";
import { ApplicantAnswersModal } from "./ApplicantAnswersModal";
import { ApplicantImportDialog } from "./ApplicantImportDialog";

type Campaign = { id: string; name: string; status: string; start_date: string | null; end_date: string | null; created_at: string };
type Position = { id: string; campaign_id: string; name: string; team_id: string | null };
type Application = { id: string; campaign_id: string; position_id: string; full_name: string | null; email: string | null; phone: string | null; student_code: string | null; class_name: string | null };
type Session = { id: string; campaign_id: string; position_id: string | null; round: number; start_time: string; end_time: string; location: string | null; meeting_link: string | null; capacity: number | null; note: string | null };
type Assignment = { id: string; session_id: string; application_id: string; comment: string | null; result: string; score: number | null };
const resultLabel: Record<string, string> = { pending: "Chờ", pass: "Đạt", fail: "Không đạt", consider: "Cân nhắc" };
type SupportAssignment = { session_id: string; member_id: string; duty: string | null };
type Member = { id: string; full_name: string; student_code: string | null; role: string; is_active: boolean; team_id: string | null; team_ids?: string[] };
// Thành viên thuộc ban X khi X nằm trong tập ban (ban chính chỉ là một phần tử). teamId null = ca không gắn ban.
const inTeam = (member: Member, teamId: string | null) => teamId ? (member.team_ids ?? (member.team_id ? [member.team_id] : [])).includes(teamId) : !member.team_id;
type FormAnswer = { application_id: string; question_id: string; question_text: string; answer_text: string | null; answer_json: unknown };
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";
const availabilityQuestionLabel = "Thời gian có thể tham gia phỏng vấn";

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function answerValue(answer: FormAnswer) {
  if (answer.answer_text) return answer.answer_text;
  if (answer.answer_json == null) return "Chưa có câu trả lời";
  return typeof answer.answer_json === "string" ? answer.answer_json : JSON.stringify(answer.answer_json);
}

function preferredInterviewSessionId(rows: FormAnswer[] | undefined) {
  const answer = rows?.find((row) => row.question_text.trim().toLocaleLowerCase("vi") === availabilityQuestionLabel.toLocaleLowerCase("vi"));
  if (Array.isArray(answer?.answer_json)) return typeof answer.answer_json[0] === "string" ? answer.answer_json[0] : null;
  if (typeof answer?.answer_json === "string") {
    try {
      const value: unknown = JSON.parse(answer.answer_json);
      return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
    } catch { return null; }
  }
  return null;
}

export function InterviewsManager() {
  const supabase = getSupabaseClient();
  const { id: clubId, role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [support, setSupport] = useState<SupportAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [campaignFilter, setCampaignFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [createCampaignId, setCreateCampaignId] = useState("");
  const [supportSelection, setSupportSelection] = useState<Record<string, string[]>>({});
  const [candidateSelection, setCandidateSelection] = useState<Record<string, string>>({});
  const [supportSearch, setSupportSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [sessionApplicantSearch, setSessionApplicantSearch] = useState("");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState(false);
  const [answers, setAnswers] = useState<Record<string, FormAnswer[]>>({});
  const [answersLoaded, setAnswersLoaded] = useState<string[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [draftResults, setDraftResults] = useState<Record<string, string>>({});
  const [draftScores, setDraftScores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !clubId) { setLoading(false); return; }
    setLoading(true); setError("");
    const [campaignResult, memberResponse] = await Promise.all([
      supabase.from("recruitment_campaigns").select("id,name,status,start_date,end_date,created_at").eq("club_id", clubId),
      fetch(`/api/admin/club-members?clubId=${encodeURIComponent(clubId)}`),
    ]);
    const memberJson = await memberResponse.json();
    if (campaignResult.error || !memberResponse.ok) {
      setError(campaignResult.error?.message ?? memberJson.error ?? "Không tải được dữ liệu CLB."); setLoading(false); return;
    }
    const campaignRows = (campaignResult.data ?? []) as Campaign[];
    setCampaigns(campaignRows); setMembers((memberJson.members ?? []) as Member[]);
    setCampaignFilter((current) => campaignRows.some((campaign) => campaign.id === current) ? current : getNearestCampaignId(campaignRows));
    if (!campaignRows.length) {
      setPositions([]); setApplications([]); setSessions([]); setAssignments([]); setSupport([]); setSupportSelection({}); setLoading(false); return;
    }
    const campaignIds = campaignRows.map((campaign) => campaign.id);
    const [positionResult, applicationResult, sessionResult] = await Promise.all([
      supabase.from("recruitment_positions").select("id,campaign_id,name,team_id").in("campaign_id", campaignIds),
      supabase.from("applications").select("id,campaign_id,position_id,full_name,email,phone,student_code,class_name").in("campaign_id", campaignIds).order("full_name"),
      supabase.from("interview_sessions").select("id,campaign_id,position_id,round,start_time,end_time,location,meeting_link,capacity,note").in("campaign_id", campaignIds).order("start_time"),
    ]);
    const failure = positionResult.error ?? applicationResult.error ?? sessionResult.error;
    if (failure) { setError(failure.message); setLoading(false); return; }
    const sessionRows = (sessionResult.data ?? []) as Session[];
    setPositions((positionResult.data ?? []) as Position[]);
    setApplications((applicationResult.data ?? []) as Application[]);
    setSessions(sessionRows);
    if (sessionRows.length) {
      const sessionIds = sessionRows.map((session) => session.id);
      const [assignmentResult, supportResult] = await Promise.all([
        supabase.from("interview_assignments").select("id,session_id,application_id,comment,result,score").in("session_id", sessionIds),
        supabase.from("interview_session_members").select("session_id,member_id,duty").in("session_id", sessionIds),
      ]);
      if (assignmentResult.error || supportResult.error) setError(assignmentResult.error?.message ?? supportResult.error?.message ?? "Không tải được dữ liệu ca phỏng vấn.");
      const assignmentRows = (assignmentResult.data ?? []) as Assignment[];
      const supportRows = (supportResult.data ?? []) as SupportAssignment[];
      setAssignments(assignmentRows); setSupport(supportRows);
      setDraftNotes(Object.fromEntries(assignmentRows.map((row) => [row.id, row.comment ?? ""])));
      setDraftResults(Object.fromEntries(assignmentRows.map((row) => [row.id, row.result])));
      setDraftScores(Object.fromEntries(assignmentRows.map((row) => [row.id, row.score == null ? "" : String(row.score)])));
      const selected: Record<string, string[]> = {};
      for (const row of supportRows) selected[row.session_id] = [...(selected[row.session_id] ?? []), row.member_id];
      setSupportSelection(selected);
    } else { setAssignments([]); setSupport([]); setSupportSelection({}); }
    setLoading(false);
  }, [supabase, clubId]);

  useEffect(() => { void load(); }, [load]);

  const campaignName = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])), [campaigns]);
  const positionById = useMemo(() => new Map(positions.map((position) => [position.id, position])), [positions]);
  const applicationById = useMemo(() => new Map(applications.map((application) => [application.id, application])), [applications]);
  const visibleSessions = sessions.filter((session) =>
    session.campaign_id === campaignFilter
    && (positionFilter === "all" || session.position_id === positionFilter),
  );
  const availabilityByApplication = useMemo(() => new Map(Object.entries(answers).map(([applicationId, rows]) => {
    const answer = rows.find((row) => row.question_text.trim().toLocaleLowerCase("vi") === availabilityQuestionLabel.toLocaleLowerCase("vi"));
    return [applicationId, answer ? answerValue(answer) : "Chưa trả lời thời gian"];
  })), [answers]);

  async function openSession(sessionId: string, applicationIds: string[]) {
    setSelectedSession(sessionId);
    setEditingSession(false);
    setSupportSearch(""); setCandidateSearch(""); setSessionApplicantSearch("");
    const missing = applicationIds.filter((id) => !answersLoaded.includes(id));
    if (!supabase || !missing.length) return;
    setAnswersLoading(true); setError("");
    const { data: answerRows, error: answerError } = await supabase.from("application_answers").select("application_id,question_id,answer_text,answer_json").in("application_id", missing);
    if (answerError) setError(`Không tải được câu trả lời ứng viên: ${answerError.message}`);
    else {
      const rows = (answerRows ?? []) as Omit<FormAnswer, "question_text">[];
      const questionIds = [...new Set(rows.map((answer) => answer.question_id))];
      const { data: questionRows, error: questionError } = questionIds.length
        ? await supabase.from("form_questions").select("id,question_text").in("id", questionIds)
        : { data: [], error: null };
      if (questionError) setError(`Không tải được nội dung câu hỏi: ${questionError.message}`);
      else {
        const questionById = new Map((questionRows ?? []).map((question) => [question.id, question.question_text]));
        const grouped: Record<string, FormAnswer[]> = {};
        for (const answer of rows) grouped[answer.application_id] = [...(grouped[answer.application_id] ?? []), { ...answer, question_text: questionById.get(answer.question_id) ?? "Câu trả lời" }];
        setAnswers((current) => ({ ...current, ...grouped }));
        setAnswersLoaded((current) => [...new Set([...current, ...missing])]);
      }
    }
    setAnswersLoading(false);
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !canWrite) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const start = String(values.get("start_time") ?? "");
    const end = String(values.get("end_time") ?? "");
    if (new Date(end) <= new Date(start)) { setError("Thời gian kết thúc phải sau thời gian bắt đầu."); return; }
    const campaignId = String(values.get("campaign_id"));
    const selectedPositionId = String(values.get("position_id"));
    const targetPositions = selectedPositionId === "__all_positions__"
      ? positions.filter((position) => position.campaign_id === campaignId)
      : positions.filter((position) => position.id === selectedPositionId && position.campaign_id === campaignId);
    if (!targetPositions.length) { setError("Vui lòng chọn vị trí thuộc đợt tuyển đã chọn."); return; }
    setBusy(true); setError(""); setNotice("");
    const sessionRows = targetPositions.map((position) => ({
      campaign_id: position.campaign_id, position_id: position.id,
      round: Number(values.get("round") || 1), start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(),
      location: String(values.get("location") ?? "").trim() || null, meeting_link: String(values.get("meeting_link") ?? "").trim() || null,
      capacity: values.get("capacity") ? Number(values.get("capacity")) : null, note: String(values.get("note") ?? "").trim() || null,
    }));
    const { error: insertError } = await supabase.from("interview_sessions").insert(sessionRows);
    setBusy(false);
    if (insertError) { setError(insertError.message); return; }
    form.reset(); setCreateCampaignId(""); setNotice(`Đã tạo ca phỏng vấn cho ${targetPositions.length} vị trí.`); await load();
  }

  function toggleSupport(sessionId: string, memberId: string) {
    setSupportSelection((current) => {
      const selected = current[sessionId] ?? [];
      return { ...current, [sessionId]: selected.includes(memberId) ? selected.filter((id) => id !== memberId) : [...selected, memberId] };
    });
  }

  async function saveSupport(session: Session) {
    if (!supabase || !canWrite) return;
    const wanted = supportSelection[session.id] ?? [];
    const sessionTeamId = positionById.get(session.position_id ?? "")?.team_id ?? null;
    if (wanted.some((id) => { const member = members.find((item) => item.id === id); return !member || !inTeam(member, sessionTeamId); })) { setError("Chỉ có thể chọn thành viên thuộc ban của ca phỏng vấn."); return; }
    const current = support.filter((row) => row.session_id === session.id).map((row) => row.member_id);
    const add = wanted.filter((id) => !current.includes(id));
    const remove = current.filter((id) => !wanted.includes(id));
    setBusy(true); setError(""); setNotice("");
    if (add.length) {
      const { error: addError } = await supabase.from("interview_session_members").upsert(add.map((member_id) => ({ session_id: session.id, member_id })), { onConflict: "session_id,member_id" });
      if (addError) { setError(addError.message); setBusy(false); return; }
    }
    for (const memberId of remove) {
      const { error: deleteError } = await supabase.from("interview_session_members").delete().eq("session_id", session.id).eq("member_id", memberId);
      if (deleteError) { setError(deleteError.message); setBusy(false); return; }
    }
    setBusy(false); setNotice("Đã cập nhật thành viên hỗ trợ."); await load();
  }

  async function saveNote(assignment: Assignment) {
    if (!supabase || !canWrite) return;
    const comment = draftNotes[assignment.id] ?? assignment.comment ?? "";
    const result = draftResults[assignment.id] ?? assignment.result;
    const scoreText = (draftScores[assignment.id] ?? "").trim();
    const score = scoreText === "" ? null : Number(scoreText);
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 99.99)) { setError("Điểm phải nằm trong khoảng từ 0 đến 99,99."); return; }
    setBusy(true); setError(""); setNotice("");
    const { data: updated, error: updateError } = await supabase.from("interview_assignments").update({ comment: comment.trim() || null, result, score }).eq("id", assignment.id).select("id");
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    if (!updated?.length) { setError("Không lưu được đánh giá. Ứng viên có thể đã bị gỡ khỏi ca hoặc bạn không có quyền."); return; }
    setAssignments((current) => current.map((row) => row.id === assignment.id ? { ...row, comment: comment.trim() || null, result, score } : row));
    setNotice("Đã lưu đánh giá ứng viên.");
  }

  async function addCandidate(event: FormEvent<HTMLFormElement>, sessionId: string) {
    event.preventDefault(); if (!supabase || !canWrite) return;
    const applicationId = candidateSelection[sessionId];
    if (!applicationId) return;
    setBusy(true); setError(""); setNotice("");
    const { error: insertError } = await supabase.from("interview_assignments").insert({ session_id: sessionId, application_id: applicationId });
    setBusy(false);
    if (insertError) setError(insertError.message); else { setNotice("Đã thêm ứng viên vào ca phỏng vấn."); setCandidateSelection((current) => ({ ...current, [sessionId]: "" })); await load(); }
  }

  async function deleteSession(session: Session) {
    if (!supabase || !canWrite) return;
    const applicantCount = assignments.filter((assignment) => assignment.session_id === session.id).length;
    const supportCount = support.filter((row) => row.session_id === session.id).length;
    if (applicantCount || supportCount) {
      setError("Không thể xóa ca đã có ứng viên hoặc thành viên hỗ trợ.");
      return;
    }
    if (!window.confirm("Xóa ca phỏng vấn này? Thao tác không thể hoàn tác.")) return;

    setBusy(true); setError(""); setNotice("");
    const { data: deletedSession, error: deleteError } = await supabase.from("interview_sessions").delete().eq("id", session.id).select("id").maybeSingle();
    setBusy(false);
    if (deleteError) { setError(deleteError.message); return; }
    if (!deletedSession) { setError("Không thể xóa ca này. Ca có thể đã được gán ứng viên/người hỗ trợ hoặc bạn không có quyền."); return; }
    setSessions((current) => current.filter((row) => row.id !== session.id));
    setAssignments((current) => current.filter((row) => row.session_id !== session.id));
    setSupport((current) => current.filter((row) => row.session_id !== session.id));
    setSupportSelection((current) => { const next = { ...current }; delete next[session.id]; return next; });
    setNotice("Đã xóa ca phỏng vấn.");
    setSelectedSession(null);
  }

  async function updateSession(event: FormEvent<HTMLFormElement>, session: Session) {
    event.preventDefault();
    if (!supabase || !canWrite) return;
    const values = new FormData(event.currentTarget);
    const start = String(values.get("start_time") ?? "");
    const end = String(values.get("end_time") ?? "");
    if (new Date(end) <= new Date(start)) {
      setError("Thời gian kết thúc phải sau thời gian bắt đầu.");
      return;
    }

    setBusy(true); setError(""); setNotice("");
    const { data: updatedSession, error: updateError } = await supabase.from("interview_sessions").update({
      round: Number(values.get("round") || 1),
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      location: String(values.get("location") ?? "").trim() || null,
      meeting_link: String(values.get("meeting_link") ?? "").trim() || null,
      capacity: values.get("capacity") ? Number(values.get("capacity")) : null,
      note: String(values.get("note") ?? "").trim() || null,
    }).eq("id", session.id).select("id").maybeSingle();
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    if (!updatedSession) { setError("Không thể cập nhật ca này. Vui lòng kiểm tra quyền quản trị."); return; }
    setSessions((current) => current.map((row) => row.id === session.id ? {
      ...row,
      round: Number(values.get("round") || 1),
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      location: String(values.get("location") ?? "").trim() || null,
      meeting_link: String(values.get("meeting_link") ?? "").trim() || null,
      capacity: values.get("capacity") ? Number(values.get("capacity")) : null,
      note: String(values.get("note") ?? "").trim() || null,
    } : row));
    setEditingSession(false);
    setNotice("Đã cập nhật thông tin ca phỏng vấn.");
  }

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    {!selectedSession && <header className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-700">Lịch phỏng vấn</p><h1 className="mt-1 text-3xl font-bold">Quản lý phỏng vấn</h1><p className="mt-2 text-sm text-zinc-600">Câu trả lời và ghi chú ứng viên được hiển thị khi mở từng ca.</p></div><div className="flex flex-wrap gap-2">{canWrite && <ApplicantImportDialog campaignId={campaignFilter} campaignName={campaignName.get(campaignFilter) ?? ""} disabled={busy || loading} onError={setError} onImported={async (message) => { setError(""); setNotice(message); await load(); }} />}<button type="button" onClick={() => void load()} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Làm mới</button></div></header>}
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!selectedSession && canWrite && <form onSubmit={(event) => void createSession(event)} className="mb-6 rounded-xl border bg-white p-5">
      <h2 className="mb-4 font-semibold">Tạo ca phỏng vấn</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">Đợt tuyển<select required name="campaign_id" className={inputClass} value={createCampaignId} onChange={(event) => setCreateCampaignId(event.target.value)}><option value="" disabled>Chọn đợt tuyển</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
        <label className="text-sm">Vị trí tuyển<select required name="position_id" className={inputClass} defaultValue="" key={createCampaignId}><option value="" disabled>Chọn vị trí</option><option value="__all_positions__">Tất cả các vị trí</option>{positions.filter((position) => position.campaign_id === createCampaignId).map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select></label>
        <label className="text-sm">Vòng<input type="number" name="round" min="1" defaultValue="1" className={inputClass} /></label>
        <label className="text-sm">Bắt đầu<input required type="datetime-local" name="start_time" className={inputClass} /></label>
        <label className="text-sm">Kết thúc<input required type="datetime-local" name="end_time" className={inputClass} /></label>
        <label className="text-sm">Sức chứa<input type="number" name="capacity" min="1" className={inputClass} /></label>
        <label className="text-sm">Địa điểm<input name="location" className={inputClass} placeholder="Phòng / địa chỉ" /></label>
        <label className="text-sm">Đường dẫn họp<input type="url" name="meeting_link" className={inputClass} placeholder="https://…" /></label>
        <label className="text-sm">Ghi chú<input name="note" className={inputClass} /></label>
      </div>
      <button disabled={busy || !campaigns.length} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Tạo ca</button>
    </form>}
    {!selectedSession && !canWrite && <p className="mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Bạn có quyền xem ca phỏng vấn. Ban chủ nhiệm và Ban chủ chốt có thể tạo ca và gán người hỗ trợ.</p>}
    {!selectedSession && <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4"><label htmlFor="interview-campaign-filter" className="text-sm font-semibold">Lọc đợt tuyển</label><select id="interview-campaign-filter" value={campaignFilter} onChange={(event) => { setCampaignFilter(event.target.value); setPositionFilter("all"); }} className="min-w-52 rounded-lg border bg-white px-3 py-2 text-sm">{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select><label htmlFor="interview-position-filter" className="text-sm font-semibold">Lọc vị trí</label><select id="interview-position-filter" value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} className="min-w-52 rounded-lg border bg-white px-3 py-2 text-sm"><option value="all">Tất cả vị trí</option>{positions.filter((position) => position.campaign_id === campaignFilter).map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select><span className="text-sm text-zinc-500">{visibleSessions.length} ca</span></div>}
    {loading ? <p className="rounded-xl border bg-white p-8 text-sm text-zinc-500">Đang tải ca phỏng vấn…</p> : selectedSession ? (() => {
      const session = sessions.find((item) => item.id === selectedSession);
      if (!session) return <div className="rounded-xl border bg-white p-8 text-sm text-zinc-500">Không tìm thấy ca phỏng vấn.</div>;
      const positionId = session.position_id;
      const teamId = positionById.get(positionId ?? "")?.team_id ?? null;
      const sessionAssignments = assignments.filter((assignment) => assignment.session_id === session.id);
      const assignedIds = sessionAssignments.map((assignment) => assignment.application_id);
      const candidates = applications.filter((application) => {
        if (assignedIds.includes(application.id) || application.position_id !== positionId) return false;
        const preference = preferredInterviewSessionId(answers[application.id]);
        return !preference || preference === session.id;
      });
      const currentSupport = supportSelection[session.id] ?? [];
      const helpers = support.filter((row) => row.session_id === session.id);
      const canDelete = canWrite && sessionAssignments.length === 0 && helpers.length === 0;
      const supportSearchText = normalizeSearchText(supportSearch);
      const filteredSupportMembers = members.filter((member) => inTeam(member, teamId)
        && (member.is_active || currentSupport.includes(member.id))
        && (!supportSearchText || [member.full_name, member.student_code].some((value) => normalizeSearchText(value).includes(supportSearchText))));
      const hasActiveSupportMembers = members.some((member) => inTeam(member, teamId) && member.is_active);
      const candidateSearchText = normalizeSearchText(candidateSearch);
      const filteredCandidates = candidates.filter((application) => !candidateSearchText
        || [application.full_name ?? "", application.student_code ?? "", application.class_name ?? ""].some((value) => normalizeSearchText(value).includes(candidateSearchText)));
      const sessionApplicantSearchText = normalizeSearchText(sessionApplicantSearch);
      const filteredSessionAssignments = sessionAssignments.filter((assignment) => {
        const applicant = applicationById.get(assignment.application_id);
        return !!applicant && (!sessionApplicantSearchText
          || [applicant.full_name ?? "", applicant.student_code ?? "", applicant.class_name ?? ""].some((value) => normalizeSearchText(value).includes(sessionApplicantSearchText)));
      });
      return <article key={session.id} className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b bg-zinc-50 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => { setSelectedSession(null); setEditingSession(false); }} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-100">← Quay lại danh sách ca</button>
            {canWrite && <div className="flex gap-2">
              <button type="button" onClick={() => setEditingSession((current) => !current)} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">{editingSession ? "Đóng chỉnh sửa" : "Sửa thông tin"}</button>
              <button type="button" disabled={!canDelete || busy} onClick={() => void deleteSession(session)} title={canDelete ? "Xóa ca phỏng vấn" : "Không thể xóa ca đã có ứng viên hoặc người hỗ trợ"} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">Xóa ca</button>
            </div>}
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{positionById.get(positionId ?? "")?.name ?? "Chưa gắn vị trí"} · Vòng {session.round}</p><h2 className="mt-1 text-xl font-semibold">{campaignName.get(session.campaign_id) ?? "Đợt tuyển"}</h2><p className="mt-2 text-sm text-zinc-600">{new Date(session.start_time).toLocaleString("vi-VN")} – {new Date(session.end_time).toLocaleString("vi-VN")}</p><p className="mt-1 text-sm text-zinc-600">{session.location || "Chưa có địa điểm"}{session.capacity ? ` · Sức chứa ${session.capacity}` : ""} · {sessionAssignments.length} ứng viên · {helpers.length} hỗ trợ</p>
        </div>
        {editingSession && canWrite && <form onSubmit={(event) => void updateSession(event, session)} className="grid gap-3 border-b bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">Vòng<input required type="number" name="round" min="1" defaultValue={session.round} className={inputClass} /></label>
          <label className="text-sm">Bắt đầu<input required type="datetime-local" name="start_time" defaultValue={toDateTimeLocalValue(session.start_time)} className={inputClass} /></label>
          <label className="text-sm">Kết thúc<input required type="datetime-local" name="end_time" defaultValue={toDateTimeLocalValue(session.end_time)} className={inputClass} /></label>
          <label className="text-sm">Địa điểm<input name="location" defaultValue={session.location ?? ""} className={inputClass} /></label>
          <label className="text-sm">Đường dẫn họp<input type="url" name="meeting_link" defaultValue={session.meeting_link ?? ""} className={inputClass} placeholder="https://..." /></label>
          <label className="text-sm">Sức chứa<input type="number" name="capacity" min="1" defaultValue={session.capacity ?? ""} className={inputClass} /></label>
          <label className="text-sm sm:col-span-2 lg:col-span-3">Ghi chú<input name="note" defaultValue={session.note ?? ""} className={inputClass} /></label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3"><button disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Lưu thay đổi</button><button type="button" disabled={busy} onClick={() => setEditingSession(false)} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">Hủy</button></div>
        </form>}
        <div className="flex flex-col gap-6 border-t p-5">
          <section className="order-2"><h3 className="font-semibold">Ứng viên trong ca</h3>{canWrite && candidates.length > 0 && <form onSubmit={(event) => void addCandidate(event, session.id)} className="mt-3 grid gap-2 rounded-lg border bg-zinc-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="text-sm">Tìm ứng viên<input type="search" value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Họ tên, mã sinh viên hoặc lớp" className={inputClass} /></label><label className="text-sm">Ứng viên<select required value={candidateSelection[session.id] ?? ""} onChange={(event) => setCandidateSelection((current) => ({ ...current, [session.id]: event.target.value }))} className={inputClass}><option value="" disabled>Chọn ứng viên</option>{filteredCandidates.map((application) => <option key={application.id} value={application.id}>{application.full_name} · {application.student_code || "Chưa có MSSV"} · {application.class_name || "Chưa có lớp"}</option>)}</select></label><button disabled={busy || !filteredCandidates.length} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Thêm vào ca</button>{candidateSearch && !filteredCandidates.length && <p className="text-sm text-zinc-500 sm:col-span-3">Không tìm thấy ứng viên phù hợp.</p>}</form>}
            {session.meeting_link && <a href={session.meeting_link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-emerald-800 underline">Mở đường dẫn họp</a>}{session.note && <p className="mt-2 text-sm text-zinc-600">Ghi chú ca: {session.note}</p>}
            {sessionAssignments.length ? <><label className="mt-3 block max-w-md text-sm font-medium">Tìm ứng viên trong ca<input type="search" value={sessionApplicantSearch} onChange={(event) => setSessionApplicantSearch(event.target.value)} placeholder="Họ tên, mã sinh viên hoặc lớp" className={inputClass} /></label><div className="mt-3 overflow-x-auto rounded-lg border"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Ứng viên</th><th className="w-28 px-2 py-3">Vị trí</th><th className="px-4 py-3">Câu trả lời trong form</th><th className="px-4 py-3">Kết quả / điểm</th><th className="px-4 py-3">Ghi chú</th></tr></thead><tbody className="divide-y">{filteredSessionAssignments.map((assignment) => {
              const applicant = applicationById.get(assignment.application_id);
              if (!applicant) return null;
              const position = positionById.get(applicant.position_id);
              return <tr key={assignment.id} className="align-top">
                <td className="px-4 py-2"><p className="font-medium">{applicant.full_name}</p><p className="text-xs text-zinc-600">{applicant.email}</p><p className="text-xs text-zinc-600">{applicant.phone || "Chưa có số điện thoại"}</p><p className="text-xs text-zinc-500">{applicant.student_code || ""}</p></td>
                <td className="w-28 max-w-28 px-2 py-2"><span className="block truncate" title={position?.name ?? "Vị trí"}>{position?.name ?? "Vị trí"}</span></td>
                <td className="px-4 py-2">{answersLoading && !answersLoaded.includes(applicant.id) ? <span className="text-xs text-zinc-500">Đang tải…</span> : <ApplicantAnswersModal applicantName={applicant.full_name ?? "Ứng viên"} answers={answers[applicant.id] ?? []} />}</td>
                <td className="min-w-[150px] px-4 py-2">{canWrite ? <><label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">Kết quả<select value={draftResults[assignment.id] ?? assignment.result} onChange={(event) => setDraftResults((current) => ({ ...current, [assignment.id]: event.target.value }))} className={inputClass}>{Object.entries(resultLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="mt-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Điểm<input type="number" min="0" max="99.99" step="0.01" inputMode="decimal" value={draftScores[assignment.id] ?? ""} onChange={(event) => setDraftScores((current) => ({ ...current, [assignment.id]: event.target.value }))} className={inputClass} /></label></> : <><p className="font-medium">{resultLabel[assignment.result] ?? assignment.result}</p><p className="text-xs text-zinc-500">Điểm: {assignment.score ?? "—"}</p></>}</td>
                <td className="min-w-[260px] px-4 py-2">{canWrite ? <><label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">Ghi chú<textarea rows={2} value={draftNotes[assignment.id] ?? ""} onChange={(event) => setDraftNotes((current) => ({ ...current, [assignment.id]: event.target.value }))} className={inputClass} placeholder="Nhận xét sau phỏng vấn" /></label><button disabled={busy} onClick={() => void saveNote(assignment)} className="mt-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50">{busy ? "Đang lưu…" : "Lưu đánh giá"}</button></> : <p className="whitespace-pre-wrap text-zinc-700">{assignment.comment || "—"}</p>}</td>
              </tr>;
            })}</tbody></table></div>{!filteredSessionAssignments.length && <p className="mt-2 text-sm text-zinc-500">Không tìm thấy ứng viên phù hợp.</p>}</> : <p className="mt-2 text-sm text-zinc-500">Chưa có ứng viên được xếp vào ca.</p>}
          </section>
          <section className="order-1"><h3 className="font-semibold">Thành viên hỗ trợ phỏng vấn</h3>
            {!teamId ? <p className="mt-2 text-sm text-amber-800">Vị trí này chưa gắn ban nên không thể chọn thành viên hỗ trợ theo ban.</p> : canWrite ? <><label className="mt-3 block max-w-md text-sm font-medium">Tìm thành viên hỗ trợ<input type="search" value={supportSearch} onChange={(event) => setSupportSearch(event.target.value)} placeholder="Họ tên hoặc mã sinh viên" className={inputClass} /></label><div className="mt-3 grid gap-2 sm:grid-cols-2">{filteredSupportMembers.map((member) => <label key={member.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={currentSupport.includes(member.id)} onChange={() => toggleSupport(session.id, member.id)} /><span>{member.full_name}</span><span className="ml-auto text-xs text-zinc-400">{roleLabel(member.role)}{member.is_active ? "" : " · đã ngừng"}</span></label>)}</div>{!filteredSupportMembers.length && <p className="mt-2 text-sm text-zinc-500">{hasActiveSupportMembers ? "Không tìm thấy thành viên phù hợp." : "Ban này chưa có thành viên đang hoạt động."}</p>}<button disabled={busy} onClick={() => void saveSupport(session)} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Lưu người hỗ trợ</button></> : <ul className="mt-3 space-y-2">{helpers.map((row) => <li key={row.member_id} className="rounded-lg border p-3 text-sm">{members.find((member) => member.id === row.member_id)?.full_name ?? "Thành viên CLB"}{row.duty ? ` · ${row.duty}` : ""}</li>)}{!helpers.length && <li className="text-sm text-zinc-500">Chưa gán người hỗ trợ.</li>}</ul>}
          </section>
        </div>
      </article>;
    })() : visibleSessions.length ? <div className="space-y-3">{visibleSessions.map((session) => {
      const helpers = support.filter((row) => row.session_id === session.id);
      const applicantCount = assignments.filter((assignment) => assignment.session_id === session.id).length;
      return <article key={session.id} className="flex flex-col gap-3 rounded-xl border bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/30 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => void openSession(session.id, applications.filter((application) => application.position_id === session.position_id).map((application) => application.id))} className="min-w-0 flex-1 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{positionById.get(session.position_id ?? "")?.name ?? "Chưa gắn vị trí"} · Vòng {session.round}</p><h2 className="mt-1 text-lg font-semibold">{campaignName.get(session.campaign_id) ?? "Đợt tuyển"}</h2><p className="mt-2 text-sm text-zinc-600">{new Date(session.start_time).toLocaleString("vi-VN")} – {new Date(session.end_time).toLocaleString("vi-VN")}</p><p className="mt-1 text-sm text-zinc-600">{session.location || "Chưa có địa điểm"}</p>
        </button>
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">{applicantCount} ứng viên · {helpers.length} hỗ trợ</span>
          <span aria-hidden="true" className="text-zinc-500">→</span>
        </div>
      </article>;
    })}</div> : <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-zinc-500">Chưa có ca phỏng vấn phù hợp. {canWrite && "Tạo một ca ở biểu mẫu phía trên."}</div>}
  </section>;
}
