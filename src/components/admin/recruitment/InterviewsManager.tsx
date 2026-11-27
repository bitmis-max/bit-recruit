"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { getNearestCampaignId } from "../../../lib/recruitment/campaign-selection";
import { normalizeSearchText } from "../../../lib/recruitment/search";
import { friendlyError } from "../../../lib/ui/friendly-error";
import { useCurrentAdminClub } from "../AdminClubContext";
import { roleLabel } from "../roles";
import { Button } from "../ui/Button";
import { CreatePanel } from "../ui/CreatePanel";
import { EmptyState } from "../ui/EmptyState";
import { Field, inputClass } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { Panel } from "../ui/Panel";
import { ApplicantAnswersModal } from "./ApplicantAnswersModal";
import { ApplicantImportDialog } from "./ApplicantImportDialog";
import { fetchAllPages, loadApplicationAnswers } from "./loadAnswers";

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
const availabilityQuestionLabel = "Thời gian có thể tham gia phỏng vấn";
const MEETING_LINK_PATTERN = /^https?:\/\//i;
const meetingLinkError = "Đường dẫn họp phải bắt đầu bằng http:// hoặc https://.";

// Giữ bản nháp đang gõ của những dòng còn tồn tại; chỉ khởi tạo cho dòng mới.
function mergeDrafts(current: Record<string, string>, rows: Assignment[], pick: (row: Assignment) => string) {
  const next: Record<string, string> = {};
  for (const row of rows) next[row.id] = row.id in current ? current[row.id] : pick(row);
  return next;
}

async function fetchMembers(clubId: string): Promise<{ members: Member[]; error: string | null }> {
  try {
    const response = await fetch(`/api/admin/club-members?clubId=${encodeURIComponent(clubId)}`);
    const json = await response.json().catch(() => null) as { members?: Member[]; error?: string } | null;
    if (!response.ok) return { members: [], error: friendlyError({ message: json?.error }, "Không tải được danh sách thành viên.") };
    return { members: json?.members ?? [], error: null };
  } catch (error) {
    return { members: [], error: friendlyError(error, "Không tải được danh sách thành viên.") };
  }
}

// Cùng ngày thì chỉ ghi giờ kết thúc.
function formatRange(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = start.toDateString() === end.toDateString();
  return `${start.toLocaleString("vi-VN")} – ${sameDay ? end.toLocaleTimeString("vi-VN") : end.toLocaleString("vi-VN")}`;
}

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
  const [creating, setCreating] = useState(false);
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

  const load = useCallback(async ({ keepDrafts = false }: { keepDrafts?: boolean } = {}) => {
    if (!supabase || !clubId) { setLoading(false); return; }
    setLoading(true); setError("");
    const [campaignResult, memberResult] = await Promise.all([
      supabase.from("recruitment_campaigns").select("id,name,status,start_date,end_date,created_at").eq("club_id", clubId),
      fetchMembers(clubId),
    ]);
    if (campaignResult.error || memberResult.error) {
      setError(campaignResult.error ? friendlyError(campaignResult.error, "Không tải được dữ liệu CLB.") : memberResult.error ?? "Không tải được dữ liệu CLB."); setLoading(false); return;
    }
    const campaignRows = (campaignResult.data ?? []) as Campaign[];
    setCampaigns(campaignRows); setMembers(memberResult.members);
    setCampaignFilter((current) => campaignRows.some((campaign) => campaign.id === current) ? current : getNearestCampaignId(campaignRows));
    if (!campaignRows.length) {
      setPositions([]); setApplications([]); setSessions([]); setAssignments([]); setSupport([]); setSupportSelection({}); setLoading(false); return;
    }
    const campaignIds = campaignRows.map((campaign) => campaign.id);
    const [positionResult, applicationResult, sessionResult] = await Promise.all([
      supabase.from("recruitment_positions").select("id,campaign_id,name,team_id").in("campaign_id", campaignIds),
      fetchAllPages<Application>((from, to) => supabase.from("applications").select("id,campaign_id,position_id,full_name,email,phone,student_code,class_name").in("campaign_id", campaignIds).order("full_name").order("id").range(from, to)),
      supabase.from("interview_sessions").select("id,campaign_id,position_id,round,start_time,end_time,location,meeting_link,capacity,note").in("campaign_id", campaignIds).order("start_time"),
    ]);
    const failure = positionResult.error ?? applicationResult.error ?? sessionResult.error;
    if (failure) { setError(friendlyError(failure, "Không tải được lịch phỏng vấn.")); setLoading(false); return; }
    const sessionRows = (sessionResult.data ?? []) as Session[];
    setPositions((positionResult.data ?? []) as Position[]);
    setApplications(applicationResult.data);
    setSessions(sessionRows);
    if (sessionRows.length) {
      const sessionIds = sessionRows.map((session) => session.id);
      const [assignmentResult, supportResult] = await Promise.all([
        supabase.from("interview_assignments").select("id,session_id,application_id,comment,result,score").in("session_id", sessionIds),
        supabase.from("interview_session_members").select("session_id,member_id,duty").in("session_id", sessionIds),
      ]);
      if (assignmentResult.error || supportResult.error) setError(friendlyError(assignmentResult.error ?? supportResult.error, "Không tải được dữ liệu ca phỏng vấn."));
      const assignmentRows = (assignmentResult.data ?? []) as Assignment[];
      const supportRows = (supportResult.data ?? []) as SupportAssignment[];
      setAssignments(assignmentRows); setSupport(supportRows);
      setDraftNotes((current) => mergeDrafts(keepDrafts ? current : {}, assignmentRows, (row) => row.comment ?? ""));
      setDraftResults((current) => mergeDrafts(keepDrafts ? current : {}, assignmentRows, (row) => row.result));
      setDraftScores((current) => mergeDrafts(keepDrafts ? current : {}, assignmentRows, (row) => row.score == null ? "" : String(row.score)));
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
    const { answers: loaded, error: answerError } = await loadApplicationAnswers(supabase, missing);
    if (answerError) setError(friendlyError(answerError, "Không tải được câu trả lời ứng viên."));
    else {
      const grouped: Record<string, FormAnswer[]> = {};
      for (const answer of loaded) grouped[answer.application_id] = [...(grouped[answer.application_id] ?? []), answer];
      setAnswers((current) => ({ ...current, ...grouped }));
      setAnswersLoaded((current) => [...new Set([...current, ...missing])]);
    }
    setAnswersLoading(false);
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !canWrite) return;
    const values = new FormData(event.currentTarget);
    const start = String(values.get("start_time") ?? "");
    const end = String(values.get("end_time") ?? "");
    if (new Date(end) <= new Date(start)) { setError("Thời gian kết thúc phải sau thời gian bắt đầu."); return; }
    const campaignId = String(values.get("campaign_id"));
    const selectedPositionId = String(values.get("position_id"));
    const targetPositions = selectedPositionId === "__all_positions__"
      ? positions.filter((position) => position.campaign_id === campaignId)
      : positions.filter((position) => position.id === selectedPositionId && position.campaign_id === campaignId);
    if (!targetPositions.length) { setError("Vui lòng chọn vị trí thuộc đợt tuyển đã chọn."); return; }
    const newLink = String(values.get("meeting_link") ?? "").trim();
    if (newLink && !MEETING_LINK_PATTERN.test(newLink)) { setError(meetingLinkError); return; }
    setBusy(true); setError(""); setNotice("");
    const sessionRows = targetPositions.map((position) => ({
      campaign_id: position.campaign_id, position_id: position.id,
      round: Number(values.get("round") || 1), start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(),
      location: String(values.get("location") ?? "").trim() || null, meeting_link: String(values.get("meeting_link") ?? "").trim() || null,
      capacity: values.get("capacity") ? Number(values.get("capacity")) : null, note: String(values.get("note") ?? "").trim() || null,
    }));
    const { error: insertError } = await supabase.from("interview_sessions").insert(sessionRows);
    setBusy(false);
    if (insertError) { setError(friendlyError(insertError, "Không tạo được ca phỏng vấn.")); return; }
    setCreating(false); setCreateCampaignId(""); setNotice(`Đã tạo ca phỏng vấn cho ${targetPositions.length} vị trí.`); await load();
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
      if (addError) { setError(friendlyError(addError, "Không lưu được người hỗ trợ.")); setBusy(false); return; }
    }
    for (const memberId of remove) {
      const { error: deleteError } = await supabase.from("interview_session_members").delete().eq("session_id", session.id).eq("member_id", memberId);
      if (deleteError) { setError(friendlyError(deleteError, "Không lưu được người hỗ trợ.")); setBusy(false); return; }
    }
    setBusy(false); setNotice("Đã cập nhật thành viên hỗ trợ."); await load({ keepDrafts: true });
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
    if (updateError) { setError(friendlyError(updateError, "Không lưu được đánh giá.")); return; }
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
    if (insertError) setError(friendlyError(insertError, "Không thêm được ứng viên vào ca.")); else { setNotice("Đã thêm ứng viên vào ca phỏng vấn."); setCandidateSelection((current) => ({ ...current, [sessionId]: "" })); await load({ keepDrafts: true }); }
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
    if (deleteError) { setError(friendlyError(deleteError, "Không xóa được ca phỏng vấn.")); return; }
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
    const newLink = String(values.get("meeting_link") ?? "").trim();
    if (newLink && !MEETING_LINK_PATTERN.test(newLink)) { setError(meetingLinkError); return; }

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
    if (updateError) { setError(friendlyError(updateError, "Không cập nhật được ca phỏng vấn.")); return; }
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

  const campaignPositions = positions.filter((position) => position.campaign_id === createCampaignId);
  const sessionFormFields = (session?: Session) => <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {session ? null : <Field label="Đợt tuyển"><select required name="campaign_id" className={inputClass} value={createCampaignId} onChange={(event) => setCreateCampaignId(event.target.value)} data-autofocus><option value="" disabled>Chọn đợt tuyển</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></Field>}
    {session ? null : <Field label="Vị trí tuyển"><select required name="position_id" className={inputClass} defaultValue="" key={createCampaignId}><option value="" disabled>Chọn vị trí</option><option value="__all_positions__">Tất cả các vị trí</option>{campaignPositions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select></Field>}
    <Field label="Vòng"><input required={!!session} type="number" name="round" min="1" defaultValue={session?.round ?? 1} className={inputClass} /></Field>
    <Field label="Bắt đầu"><input required type="datetime-local" name="start_time" defaultValue={session ? toDateTimeLocalValue(session.start_time) : undefined} className={inputClass} /></Field>
    <Field label="Kết thúc"><input required type="datetime-local" name="end_time" defaultValue={session ? toDateTimeLocalValue(session.end_time) : undefined} className={inputClass} /></Field>
    <Field label="Sức chứa"><input type="number" name="capacity" min="1" defaultValue={session?.capacity ?? ""} className={inputClass} /></Field>
    <Field label="Địa điểm"><input name="location" defaultValue={session?.location ?? ""} className={inputClass} placeholder="Phòng / địa chỉ" /></Field>
    <Field label="Đường dẫn họp"><input type="url" name="meeting_link" defaultValue={session?.meeting_link ?? ""} className={inputClass} placeholder="https://…" /></Field>
    <Field label="Ghi chú"><input name="note" defaultValue={session?.note ?? ""} className={inputClass} /></Field>
  </div>;

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    {!selectedSession && <PageHeader title="Phỏng vấn" description="Câu trả lời và ghi chú ứng viên được hiển thị khi mở từng ca." actions={<>
      <Button icon="refresh" onClick={() => void load()}>Làm mới</Button>
      {canWrite && <ApplicantImportDialog campaignId={campaignFilter} campaignName={campaignName.get(campaignFilter) ?? ""} disabled={busy || loading} onError={setError} onImported={async (message) => { setError(""); setNotice(message); await load(); }} />}
      {canWrite && <Button variant="primary" icon="plus" disabled={!campaigns.length} aria-expanded={creating} onClick={() => { if (creating) return; setCreateCampaignId(campaignFilter); setCreating(true); }}>Thêm ca</Button>}
    </>} />}
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {!selectedSession && !canWrite && <Notice>Bạn có quyền xem ca phỏng vấn. Ban chủ nhiệm và Ban chủ chốt có thể tạo ca và gán người hỗ trợ.</Notice>}
    {!selectedSession && canWrite && <CreatePanel open={creating} title="Thêm ca phỏng vấn" onClose={() => setCreating(false)}>
      <form onSubmit={(event) => void createSession(event)} className="space-y-4">
        {sessionFormFields()}
        <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4"><Button type="submit" variant="primary" loading={busy} disabled={!campaigns.length}>{busy ? "Đang tạo…" : "Tạo ca"}</Button><Button onClick={() => setCreating(false)} disabled={busy}>Hủy</Button></div>
      </form>
    </CreatePanel>}
    {!selectedSession && <div className="mb-4 grid items-center gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,14rem)_auto]">
      <select aria-label="Lọc đợt tuyển" value={campaignFilter} onChange={(event) => { setCampaignFilter(event.target.value); setPositionFilter("all"); }} className={inputClass}>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select>
      <select aria-label="Lọc vị trí" value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} className={inputClass}><option value="all">Tất cả vị trí</option>{positions.filter((position) => position.campaign_id === campaignFilter).map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select>
      <p className="text-sm text-zinc-500">{visibleSessions.length} ca</p>
    </div>}
    {loading ? <div role="status" aria-label="Đang tải ca phỏng vấn" className="h-56 animate-pulse rounded-xl bg-zinc-100" /> : selectedSession ? (() => {
      const session = sessions.find((item) => item.id === selectedSession);
      if (!session) return <Panel padded={false}><EmptyState title="Không tìm thấy ca phỏng vấn" action={<Button onClick={() => setSelectedSession(null)}>Quay lại danh sách ca</Button>} /></Panel>;
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
      const sessionPositionName = positionById.get(positionId ?? "")?.name ?? "Chưa gắn vị trí";
      return <article key={session.id}>
        <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => { setSelectedSession(null); setEditingSession(false); }}><Icon name="chevron-right" size={14} className="rotate-180" />Quay lại danh sách ca</Button>
        <PageHeader
          title={`${sessionPositionName} · Vòng ${session.round}`}
          description={<>
            <span className="block">{campaignName.get(session.campaign_id) ?? "Đợt tuyển"} · {formatRange(session.start_time, session.end_time)}</span>
            <span className="block">{session.location || "Chưa có địa điểm"}{session.capacity ? ` · Sức chứa ${session.capacity}` : ""} · {sessionAssignments.length} ứng viên · {helpers.length} hỗ trợ</span>
            {session.note && <span className="block">Ghi chú ca: {session.note}</span>}
            {session.meeting_link && MEETING_LINK_PATTERN.test(session.meeting_link) && <a href={session.meeting_link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium text-emerald-800 underline underline-offset-2">Mở đường dẫn họp<Icon name="external" size={14} /></a>}
          </>}
          actions={canWrite && <Button icon="edit" aria-expanded={editingSession} onClick={() => setEditingSession((current) => !current)}>{editingSession ? "Đóng chỉnh sửa" : "Sửa thông tin"}</Button>} />
        <div className="space-y-5">
          {editingSession && canWrite && <Panel title="Sửa thông tin ca">
            <form onSubmit={(event) => void updateSession(event, session)} className="space-y-4">
              {sessionFormFields(session)}
              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
                <Button type="submit" variant="primary" loading={busy}>{busy ? "Đang lưu…" : "Lưu thay đổi"}</Button>
                <Button disabled={busy} onClick={() => setEditingSession(false)}>Hủy</Button>
                <Button variant="danger" icon="trash" className="sm:ml-auto" disabled={!canDelete || busy} title={canDelete ? "Xóa ca phỏng vấn" : "Không thể xóa ca đã có ứng viên hoặc người hỗ trợ"} onClick={() => void deleteSession(session)}>Xóa ca</Button>
              </div>
              {!canDelete && <p className="text-xs text-zinc-500">Chỉ xóa được ca chưa có ứng viên hoặc thành viên hỗ trợ.</p>}
            </form>
          </Panel>}
          <Panel title="Thành viên hỗ trợ phỏng vấn">
            {!teamId ? <Notice tone="warning" className="mb-0!">Vị trí này chưa gắn ban nên không thể chọn thành viên hỗ trợ theo ban.</Notice> : canWrite ? <>
              <input type="search" aria-label="Tìm thành viên hỗ trợ" value={supportSearch} onChange={(event) => setSupportSearch(event.target.value)} placeholder="Tìm thành viên theo họ tên hoặc mã sinh viên" className={`${inputClass} sm:max-w-md`} />
              <div className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">{filteredSupportMembers.map((member) => <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-zinc-50"><input type="checkbox" className="size-4 accent-emerald-700" checked={currentSupport.includes(member.id)} onChange={() => toggleSupport(session.id, member.id)} /><span className="min-w-0 truncate">{member.full_name}</span><span className="ml-auto shrink-0 text-xs text-zinc-500">{roleLabel(member.role)}{member.is_active ? "" : " · đã ngừng"}</span></label>)}</div>
              {!filteredSupportMembers.length && <p className="mt-2 text-sm text-zinc-500">{hasActiveSupportMembers ? "Không tìm thấy thành viên phù hợp." : "Ban này chưa có thành viên đang hoạt động."}</p>}
              <Button className="mt-3" loading={busy} onClick={() => void saveSupport(session)}>Lưu người hỗ trợ</Button>
            </> : <ul className="divide-y divide-zinc-100">{helpers.map((row) => <li key={row.member_id} className="py-2 text-sm">{members.find((member) => member.id === row.member_id)?.full_name ?? "Thành viên CLB"}{row.duty ? ` · ${row.duty}` : ""}</li>)}{!helpers.length && <li className="text-sm text-zinc-500">Chưa gán người hỗ trợ.</li>}</ul>}
          </Panel>
          <Panel title="Ứng viên trong ca">
            {canWrite && candidates.length > 0 && <form onSubmit={(event) => void addCandidate(event, session.id)} className="mb-4 grid gap-3 border-b border-zinc-100 pb-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Tìm ứng viên"><input type="search" value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Họ tên, mã sinh viên hoặc lớp" className={inputClass} /></Field>
              <Field label="Ứng viên"><select required value={candidateSelection[session.id] ?? ""} onChange={(event) => setCandidateSelection((current) => ({ ...current, [session.id]: event.target.value }))} className={inputClass}><option value="" disabled>Chọn ứng viên</option>{filteredCandidates.map((application) => <option key={application.id} value={application.id}>{application.full_name} · {application.student_code || "Chưa có MSSV"} · {application.class_name || "Chưa có lớp"}</option>)}</select></Field>
              <Button type="submit" disabled={busy || !filteredCandidates.length}>Thêm vào ca</Button>
              {candidateSearch && !filteredCandidates.length && <p className="text-sm text-zinc-500 sm:col-span-3">Không tìm thấy ứng viên phù hợp.</p>}
            </form>}
            {sessionAssignments.length ? <>
              <input type="search" aria-label="Tìm ứng viên trong ca" value={sessionApplicantSearch} onChange={(event) => setSessionApplicantSearch(event.target.value)} placeholder="Tìm ứng viên trong ca theo họ tên, mã sinh viên hoặc lớp" className={`${inputClass} sm:max-w-md`} />
              <ul className="mt-2 divide-y divide-zinc-100">{filteredSessionAssignments.map((assignment) => {
                const applicant = applicationById.get(assignment.application_id);
                if (!applicant) return null;
                const otherPosition = applicant.position_id !== positionId ? positionById.get(applicant.position_id)?.name ?? "Vị trí khác" : null;
                const applicantName = applicant.full_name ?? "Ứng viên";
                return <li key={assignment.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0"><p className="font-medium text-zinc-900">{applicant.full_name}</p><p className="break-all text-xs text-zinc-600">{[applicant.email, applicant.phone || "Chưa có số điện thoại", applicant.student_code, otherPosition].filter(Boolean).join(" · ")}</p></div>
                    {answersLoading && !answersLoaded.includes(applicant.id) ? <span className="text-xs text-zinc-500">Đang tải…</span> : <ApplicantAnswersModal applicantName={applicantName} answers={answers[applicant.id] ?? []} />}
                  </div>
                  {canWrite ? <div className="mt-3 grid gap-3 sm:grid-cols-[9rem_6rem_minmax(0,1fr)_auto] sm:items-end">
                    <Field label="Kết quả"><select aria-label={`Kết quả của ${applicantName}`} value={draftResults[assignment.id] ?? assignment.result} onChange={(event) => setDraftResults((current) => ({ ...current, [assignment.id]: event.target.value }))} className={inputClass}>{Object.entries(resultLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                    <Field label="Điểm"><input aria-label={`Điểm của ${applicantName}`} type="number" min="0" max="99.99" step="0.01" inputMode="decimal" value={draftScores[assignment.id] ?? ""} onChange={(event) => setDraftScores((current) => ({ ...current, [assignment.id]: event.target.value }))} className={inputClass} /></Field>
                    <Field label="Ghi chú"><textarea aria-label={`Ghi chú về ${applicantName}`} rows={2} value={draftNotes[assignment.id] ?? ""} onChange={(event) => setDraftNotes((current) => ({ ...current, [assignment.id]: event.target.value }))} className={inputClass} placeholder="Nhận xét sau phỏng vấn" /></Field>
                    <Button loading={busy} onClick={() => void saveNote(assignment)}>{busy ? "Đang lưu…" : "Lưu đánh giá"}</Button>
                  </div> : <div className="mt-2 text-sm"><p className="text-zinc-900">{resultLabel[assignment.result] ?? assignment.result} · Điểm: {assignment.score ?? "—"}</p><p className="mt-1 whitespace-pre-wrap text-zinc-700">{assignment.comment || "—"}</p></div>}
                </li>;
              })}</ul>
              {!filteredSessionAssignments.length && <p className="mt-2 text-sm text-zinc-500">Không tìm thấy ứng viên phù hợp.</p>}
            </> : <p className="text-sm text-zinc-500">Chưa có ứng viên được xếp vào ca.</p>}
          </Panel>
        </div>
      </article>;
    })() : visibleSessions.length ? <Panel padded={false}><ul className="divide-y divide-zinc-100">{visibleSessions.map((session) => {
      const helpers = support.filter((row) => row.session_id === session.id);
      const applicantCount = assignments.filter((assignment) => assignment.session_id === session.id).length;
      return <li key={session.id}>
        <button type="button" onClick={() => void openSession(session.id, applications.filter((application) => application.position_id === session.position_id).map((application) => application.id))} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 sm:px-5">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-zinc-900">{formatRange(session.start_time, session.end_time)}</span>
            <span className="mt-0.5 block truncate text-sm text-zinc-600">{positionById.get(session.position_id ?? "")?.name ?? "Chưa gắn vị trí"} · Vòng {session.round} · {session.location || "Chưa có địa điểm"}</span>
            <span className="mt-0.5 block text-xs text-zinc-500">{applicantCount} ứng viên · {helpers.length} hỗ trợ</span>
          </span>
          <Icon name="chevron-right" className="shrink-0 text-zinc-400" />
        </button>
      </li>;
    })}</ul></Panel> : <Panel padded={false}><EmptyState title="Chưa có ca phỏng vấn phù hợp" description={canWrite ? "Thêm một ca để bắt đầu xếp lịch." : undefined} action={canWrite && campaigns.length > 0 && <Button variant="primary" icon="plus" onClick={() => { setCreateCampaignId(campaignFilter); setCreating(true); }}>Thêm ca</Button>} /></Panel>}
  </section>;
}
