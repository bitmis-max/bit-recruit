"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { useCurrentAdminClub } from "../AdminShell";
import { ApplicantAnswersModal } from "./ApplicantAnswersModal";

type Campaign = { id: string; name: string };
type Team = { id: string; name: string };
type Position = { id: string; name: string; team_id: string | null };
type Application = { id: string; campaign_id: string; position_id: string; full_name: string; email: string; phone: string | null; student_code: string | null };
type Session = { id: string; campaign_id: string; team_id: string | null; round: number; start_time: string; end_time: string; location: string | null; meeting_link: string | null; capacity: number | null; note: string | null };
type Assignment = { id: string; session_id: string; application_id: string; comment: string | null };
type SupportAssignment = { session_id: string; member_id: string; duty: string | null };
type Member = { id: string; full_name: string; role: string; is_active: boolean; team_id: string | null };
type FormAnswer = { application_id: string; question_id: string; question_text: string; answer_text: string | null; answer_json: unknown };
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";
const availabilityQuestionLabel = "Thời gian có thể tham gia phỏng vấn";

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
  const [teams, setTeams] = useState<Team[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [support, setSupport] = useState<SupportAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teamFilter, setTeamFilter] = useState("all");
  const [supportSelection, setSupportSelection] = useState<Record<string, string[]>>({});
  const [candidateSelection, setCandidateSelection] = useState<Record<string, string>>({});
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, FormAnswer[]>>({});
  const [answersLoaded, setAnswersLoaded] = useState<string[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !clubId) { setLoading(false); return; }
    setLoading(true); setError("");
    const [campaignResult, teamResult, memberResponse] = await Promise.all([
      supabase.from("recruitment_campaigns").select("id,name").eq("club_id", clubId),
      supabase.from("teams").select("id,name").eq("club_id", clubId).order("name"),
      fetch(`/api/admin/club-members?clubId=${encodeURIComponent(clubId)}`),
    ]);
    const memberJson = await memberResponse.json();
    if (campaignResult.error || teamResult.error || !memberResponse.ok) {
      setError(campaignResult.error?.message ?? teamResult.error?.message ?? memberJson.error ?? "Không tải được dữ liệu CLB."); setLoading(false); return;
    }
    const campaignRows = (campaignResult.data ?? []) as Campaign[];
    const teamRows = (teamResult.data ?? []) as Team[];
    setCampaigns(campaignRows); setTeams(teamRows); setMembers((memberJson.members ?? []) as Member[]);
    if (!campaignRows.length) {
      setPositions([]); setApplications([]); setSessions([]); setAssignments([]); setSupport([]); setSupportSelection({}); setLoading(false); return;
    }
    const campaignIds = campaignRows.map((campaign) => campaign.id);
    const [positionResult, applicationResult, sessionResult] = await Promise.all([
      supabase.from("recruitment_positions").select("id,name,team_id").in("campaign_id", campaignIds),
      supabase.from("applications").select("id,campaign_id,position_id,full_name,email,phone,student_code").in("campaign_id", campaignIds).order("full_name"),
      supabase.from("interview_sessions").select("id,campaign_id,team_id,round,start_time,end_time,location,meeting_link,capacity,note").in("campaign_id", campaignIds).order("start_time"),
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
        supabase.from("interview_assignments").select("id,session_id,application_id,comment").in("session_id", sessionIds),
        supabase.from("interview_session_members").select("session_id,member_id,duty").in("session_id", sessionIds),
      ]);
      if (assignmentResult.error || supportResult.error) setError(assignmentResult.error?.message ?? supportResult.error?.message ?? "Không tải được dữ liệu ca phỏng vấn.");
      const assignmentRows = (assignmentResult.data ?? []) as Assignment[];
      const supportRows = (supportResult.data ?? []) as SupportAssignment[];
      setAssignments(assignmentRows); setSupport(supportRows);
      setDraftNotes(Object.fromEntries(assignmentRows.map((row) => [row.id, row.comment ?? ""])));
      const selected: Record<string, string[]> = {};
      for (const row of supportRows) selected[row.session_id] = [...(selected[row.session_id] ?? []), row.member_id];
      setSupportSelection(selected);
    } else { setAssignments([]); setSupport([]); setSupportSelection({}); }
    setLoading(false);
  }, [supabase, clubId]);

  useEffect(() => { void load(); }, [load]);

  const campaignName = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])), [campaigns]);
  const teamName = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams]);
  const positionById = useMemo(() => new Map(positions.map((position) => [position.id, position])), [positions]);
  const applicationById = useMemo(() => new Map(applications.map((application) => [application.id, application])), [applications]);
  const visibleSessions = sessions.filter((session) => teamFilter === "all" || (teamFilter === "unassigned" ? !session.team_id : session.team_id === teamFilter));
  const availabilityByApplication = useMemo(() => new Map(Object.entries(answers).map(([applicationId, rows]) => {
    const answer = rows.find((row) => row.question_text.trim().toLocaleLowerCase("vi") === availabilityQuestionLabel.toLocaleLowerCase("vi"));
    return [applicationId, answer ? answerValue(answer) : "Chưa trả lời thời gian"];
  })), [answers]);

  async function openSession(sessionId: string, applicationIds: string[]) {
    setSelectedSession(sessionId);
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
    setBusy(true); setError(""); setNotice("");
    const { error: insertError } = await supabase.from("interview_sessions").insert({
      campaign_id: String(values.get("campaign_id")), team_id: String(values.get("team_id") ?? "") || null,
      round: Number(values.get("round") || 1), start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(),
      location: String(values.get("location") ?? "").trim() || null, meeting_link: String(values.get("meeting_link") ?? "").trim() || null,
      capacity: values.get("capacity") ? Number(values.get("capacity")) : null, note: String(values.get("note") ?? "").trim() || null,
    });
    setBusy(false);
    if (insertError) { setError(insertError.message); return; }
    form.reset(); setNotice("Đã tạo ca phỏng vấn."); await load();
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
    if (wanted.some((id) => members.find((member) => member.id === id)?.team_id !== session.team_id)) { setError("Chỉ có thể chọn thành viên thuộc ban của ca phỏng vấn."); return; }
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
    setBusy(true); setError(""); setNotice("");
    const { error: updateError } = await supabase.from("interview_assignments").update({ comment: comment.trim() || null }).eq("id", assignment.id);
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    setAssignments((current) => current.map((row) => row.id === assignment.id ? { ...row, comment: comment.trim() || null } : row));
    setNotice("Đã lưu ghi chú ứng viên.");
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

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    {!selectedSession && <header className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-700">Lịch phỏng vấn</p><h1 className="mt-1 text-3xl font-bold">Quản lý phỏng vấn</h1><p className="mt-2 text-sm text-zinc-600">Câu trả lời và ghi chú ứng viên được hiển thị khi mở từng ca.</p></div><button onClick={() => void load()} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium">Làm mới</button></header>}
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!selectedSession && canWrite && <form onSubmit={(event) => void createSession(event)} className="mb-6 rounded-xl border bg-white p-5">
      <h2 className="mb-4 font-semibold">Tạo ca phỏng vấn</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">Đợt tuyển<select required name="campaign_id" className={inputClass} defaultValue=""><option value="" disabled>Chọn đợt tuyển</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
        <label className="text-sm">Ban<select name="team_id" className={inputClass} defaultValue=""><option value="">Ca chung</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
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
    {!selectedSession && !canWrite && <p className="mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Bạn có quyền xem ca phỏng vấn. Owner/Admin có thể tạo ca và gán người hỗ trợ.</p>}
    {!selectedSession && <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4"><label htmlFor="interview-team-filter" className="text-sm font-semibold">Lọc theo ban</label><select id="interview-team-filter" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="min-w-52 rounded-lg border bg-white px-3 py-2 text-sm"><option value="all">Tất cả các ban</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}<option value="unassigned">Ca chung</option></select><span className="text-sm text-zinc-500">{visibleSessions.length} ca</span></div>}
    {loading ? <p className="rounded-xl border bg-white p-8 text-sm text-zinc-500">Đang tải ca phỏng vấn…</p> : selectedSession ? (() => {
      const session = sessions.find((item) => item.id === selectedSession);
      if (!session) return <div className="rounded-xl border bg-white p-8 text-sm text-zinc-500">Không tìm thấy ca phỏng vấn.</div>;
      const teamId = session.team_id;
      const sessionAssignments = assignments.filter((assignment) => assignment.session_id === session.id);
      const assignedIds = sessionAssignments.map((assignment) => assignment.application_id);
      const candidates = applications.filter((application) => {
        if (assignedIds.includes(application.id) || application.campaign_id !== session.campaign_id || (teamId && positionById.get(application.position_id)?.team_id !== teamId)) return false;
        const preference = preferredInterviewSessionId(answers[application.id]);
        return !preference || preference === session.id;
      });
      const currentSupport = supportSelection[session.id] ?? [];
      const helpers = support.filter((row) => row.session_id === session.id);
      return <article key={session.id} className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b bg-zinc-50 p-5">
          <button type="button" onClick={() => setSelectedSession(null)} className="mb-4 rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-100">← Quay lại danh sách ca</button>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{teamId ? teamName.get(teamId) ?? "Ban" : "Ca chung"} · Vòng {session.round}</p><h2 className="mt-1 text-xl font-semibold">{campaignName.get(session.campaign_id) ?? "Đợt tuyển"}</h2><p className="mt-2 text-sm text-zinc-600">{new Date(session.start_time).toLocaleString("vi-VN")} – {new Date(session.end_time).toLocaleString("vi-VN")}</p><p className="mt-1 text-sm text-zinc-600">{session.location || "Chưa có địa điểm"}{session.capacity ? ` · Sức chứa ${session.capacity}` : ""} · {sessionAssignments.length} ứng viên · {helpers.length} hỗ trợ</p>
        </div>
        <div className="flex flex-col gap-6 border-t p-5">
          <section className="order-2"><h3 className="font-semibold">Ứng viên trong ca</h3>
            {session.meeting_link && <a href={session.meeting_link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-emerald-800 underline">Mở đường dẫn họp</a>}{session.note && <p className="mt-2 text-sm text-zinc-600">Ghi chú ca: {session.note}</p>}
            {sessionAssignments.length ? <div className="mt-3 overflow-x-auto rounded-lg border"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Ứng viên</th><th className="w-28 px-2 py-3">Vị trí</th><th className="px-4 py-3">Câu trả lời trong form</th><th className="px-4 py-3">Ghi chú</th></tr></thead><tbody className="divide-y">{sessionAssignments.map((assignment) => {
              const applicant = applicationById.get(assignment.application_id);
              if (!applicant) return null;
              const position = positionById.get(applicant.position_id);
              return <tr key={assignment.id} className="align-top">
                <td className="px-4 py-2"><p className="font-medium">{applicant.full_name}</p><p className="text-xs text-zinc-600">{applicant.email}</p><p className="text-xs text-zinc-600">{applicant.phone || "Chưa có số điện thoại"}</p><p className="text-xs text-zinc-500">{applicant.student_code || ""}</p></td>
                <td className="w-28 max-w-28 px-2 py-2"><span className="block truncate" title={position?.name ?? "Vị trí"}>{position?.name ?? "Vị trí"}</span></td>
                <td className="px-4 py-2">{answersLoading && !answersLoaded.includes(applicant.id) ? <span className="text-xs text-zinc-500">Đang tải…</span> : <ApplicantAnswersModal applicantName={applicant.full_name} answers={answers[applicant.id] ?? []} />}</td>
                <td className="min-w-[260px] px-4 py-2">{canWrite ? <><label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">Ghi chú<textarea rows={2} value={draftNotes[assignment.id] ?? ""} onChange={(event) => setDraftNotes((current) => ({ ...current, [assignment.id]: event.target.value }))} className={inputClass} placeholder="Nhận xét sau phỏng vấn" /></label><button disabled={busy} onClick={() => void saveNote(assignment)} className="mt-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50">Lưu ghi chú</button></> : <p className="whitespace-pre-wrap text-zinc-700">{assignment.comment || "—"}</p>}</td>
              </tr>;
            })}</tbody></table></div> : <p className="mt-2 text-sm text-zinc-500">Chưa có ứng viên được xếp vào ca.</p>}
          </section>
          <section className="order-1"><h3 className="font-semibold">Thành viên hỗ trợ phỏng vấn</h3>
            {!teamId ? <p className="mt-2 text-sm text-amber-800">Ca chung chưa gắn ban nên không thể chọn thành viên hỗ trợ theo ban.</p> : canWrite ? <><div className="mt-3 grid gap-2 sm:grid-cols-2">{members.filter((member) => member.team_id === teamId && (member.is_active || currentSupport.includes(member.id))).map((member) => <label key={member.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={currentSupport.includes(member.id)} onChange={() => toggleSupport(session.id, member.id)} /><span>{member.full_name}</span><span className="ml-auto text-xs text-zinc-400">{member.role}{member.is_active ? "" : " · đã ngừng"}</span></label>)}</div>{!members.some((member) => member.team_id === teamId && member.is_active) && <p className="mt-2 text-sm text-zinc-500">Ban này chưa có thành viên đang hoạt động.</p>}<button disabled={busy} onClick={() => void saveSupport(session)} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Lưu người hỗ trợ</button></> : <ul className="mt-3 space-y-2">{helpers.map((row) => <li key={row.member_id} className="rounded-lg border p-3 text-sm">{members.find((member) => member.id === row.member_id)?.full_name ?? "Thành viên CLB"}{row.duty ? ` · ${row.duty}` : ""}</li>)}{!helpers.length && <li className="text-sm text-zinc-500">Chưa gán người hỗ trợ.</li>}</ul>}
          </section>
        </div>
      </article>;
    })() : visibleSessions.length ? <div className="space-y-3">{visibleSessions.map((session) => {
      const helpers = support.filter((row) => row.session_id === session.id);
      const applicantCount = assignments.filter((assignment) => assignment.session_id === session.id).length;
      return <button key={session.id} type="button" onClick={() => void openSession(session.id, applications.filter((application) => application.campaign_id === session.campaign_id && (!session.team_id || positionById.get(application.position_id)?.team_id === session.team_id)).map((application) => application.id))} className="flex w-full flex-col gap-3 rounded-xl border bg-white p-5 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/30 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{session.team_id ? teamName.get(session.team_id) ?? "Ban" : "Ca chung"} · Vòng {session.round}</p><h2 className="mt-1 text-lg font-semibold">{campaignName.get(session.campaign_id) ?? "Đợt tuyển"}</h2><p className="mt-2 text-sm text-zinc-600">{new Date(session.start_time).toLocaleString("vi-VN")} – {new Date(session.end_time).toLocaleString("vi-VN")}</p><p className="mt-1 text-sm text-zinc-600">{session.location || "Chưa có địa điểm"}</p></div>
        <span className="flex items-center gap-2 self-start rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">{applicantCount} ứng viên · {helpers.length} hỗ trợ <span aria-hidden="true">→</span></span>
      </button>;
    })}</div> : <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-zinc-500">Chưa có ca phỏng vấn phù hợp. {canWrite && "Tạo một ca ở biểu mẫu phía trên."}</div>}
  </section>;
}
