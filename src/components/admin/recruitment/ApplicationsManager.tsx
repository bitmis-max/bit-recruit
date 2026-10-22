"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { getNearestCampaignId } from "../../../lib/recruitment/campaign-selection";
import { normalizeSearchText } from "../../../lib/recruitment/search";
import { useCurrentAdminClub } from "../AdminClubContext";
import { ApplicantAnswersModal } from "./ApplicantAnswersModal";

type Campaign = { id: string; name: string; status: string; start_date: string | null; end_date: string | null; created_at: string };
type Team = { id: string; name: string };
type Position = { id: string; name: string; team_id: string | null };
type Application = { id: string; campaign_id: string; position_id: string; full_name: string | null; email: string | null; phone: string | null; student_code: string | null; class_name: string | null; status: string; submitted_at: string };
type Answer = { application_id: string; question_id: string; question_text: string; answer_text: string | null; answer_json: unknown };
const statusLabel: Record<string, string> = { submitted: "Mới nộp", screening: "Đang xét", interview: "Phỏng vấn", passed: "Đạt", failed: "Không đạt", withdrawn: "Đã rút" };

export function ApplicationsManager() {
  const supabase = getSupabaseClient();
  const { id: clubId } = useCurrentAdminClub();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [campaignFilter, setCampaignFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [applicantSearch, setApplicantSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !clubId) { setLoading(false); return; }
    setLoading(true); setError("");
    const [campaignResult, teamResult] = await Promise.all([
      supabase.from("recruitment_campaigns").select("id,name,status,start_date,end_date,created_at").eq("club_id", clubId),
      supabase.from("teams").select("id,name").eq("club_id", clubId).order("name"),
    ]);
    if (campaignResult.error || teamResult.error) {
      setError(campaignResult.error?.message ?? teamResult.error?.message ?? "Không tải được dữ liệu CLB."); setLoading(false); return;
    }
    const campaignRows = (campaignResult.data ?? []) as Campaign[];
    setCampaigns(campaignRows); setTeams((teamResult.data ?? []) as Team[]);
    setCampaignFilter((current) => campaignRows.some((campaign) => campaign.id === current) ? current : getNearestCampaignId(campaignRows));
    if (!campaignRows.length) { setPositions([]); setApplications([]); setAnswers([]); setLoading(false); return; }
    const campaignIds = campaignRows.map((campaign) => campaign.id);
    const [positionResult, applicationResult] = await Promise.all([
      supabase.from("recruitment_positions").select("id,name,team_id").in("campaign_id", campaignIds),
      supabase.from("applications").select("id,campaign_id,position_id,full_name,email,phone,student_code,class_name,status,submitted_at").in("campaign_id", campaignIds).order("submitted_at", { ascending: false }),
    ]);
    if (positionResult.error || applicationResult.error) {
      setError(positionResult.error?.message ?? applicationResult.error?.message ?? "Không tải được đơn ứng tuyển."); setLoading(false); return;
    }
    const positionRows = (positionResult.data ?? []) as Position[];
    const applicationRows = (applicationResult.data ?? []) as Application[];
    setPositions(positionRows); setApplications(applicationRows);
    if (applicationRows.length) {
      const { data: answerRows, error: answerError } = await supabase.from("application_answers")
        .select("application_id,question_id,answer_text,answer_json")
        .in("application_id", applicationRows.map((application) => application.id));
      if (answerError) setError(`Đã tải đơn nhưng không tải được câu trả lời: ${answerError.message}`);
      else {
        const rows = (answerRows ?? []) as Omit<Answer, "question_text">[];
        const questionIds = [...new Set(rows.map((answer) => answer.question_id))];
        const { data: questionRows, error: questionError } = questionIds.length
          ? await supabase.from("form_questions").select("id,question_text").in("id", questionIds)
          : { data: [], error: null };
        if (questionError) setError(`Đã tải đơn nhưng không tải được nội dung câu hỏi: ${questionError.message}`);
        else {
          const questionById = new Map((questionRows ?? []).map((question) => [question.id, question.question_text]));
          setAnswers(rows.map((answer) => ({ ...answer, question_text: questionById.get(answer.question_id) ?? "Câu hỏi" })));
        }
      }
    } else setAnswers([]);
    setLoading(false);
  }, [supabase, clubId]);

  useEffect(() => { void load(); }, [load]);

  const teamByPosition = useMemo(() => new Map(positions.map((position) => [position.id, position.team_id])), [positions]);
  const positionById = useMemo(() => new Map(positions.map((position) => [position.id, position])), [positions]);
  const campaignById = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])), [campaigns]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams]);
  const normalizedApplicantSearch = normalizeSearchText(applicantSearch);
  const filtered = applications.filter((application) => application.campaign_id === campaignFilter
    && (!normalizedApplicantSearch || [application.full_name ?? "", application.student_code ?? "", application.class_name ?? ""].some((value) => normalizeSearchText(value).includes(normalizedApplicantSearch)))
    && (teamFilter === "all" || teamByPosition.get(application.position_id) === teamFilter));
  const answersByApplication = useMemo(() => {
    const grouped = new Map<string, Answer[]>();
    for (const answer of answers) grouped.set(answer.application_id, [...(grouped.get(answer.application_id) ?? []), answer]);
    return grouped;
  }, [answers]);

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-700">Hồ sơ tuyển thành viên</p><h1 className="mt-1 text-3xl font-bold">Quản lý đơn ứng tuyển</h1><p className="mt-2 text-sm text-zinc-600">Lọc hồ sơ theo đợt tuyển và ban tuyển.</p></div><button type="button" onClick={() => void load()} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Làm mới</button></header>
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"><label htmlFor="application-campaign-filter" className="text-sm font-semibold">Đợt tuyển<select id="application-campaign-filter" value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)} className="mt-1 block min-w-52 rounded-lg border bg-white px-3 py-2 text-sm">{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label><label className="text-sm font-semibold">Tìm ứng viên<input type="search" value={applicantSearch} onChange={(event) => setApplicantSearch(event.target.value)} placeholder="Họ tên, mã sinh viên hoặc lớp" className="mt-1 block min-w-64 rounded-lg border bg-white px-3 py-2 text-sm" /></label><label htmlFor="application-team-filter" className="text-sm font-semibold">Ban tuyển<select id="application-team-filter" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="mt-1 block min-w-52 rounded-lg border bg-white px-3 py-2 text-sm"><option value="all">Tất cả các ban</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><span className="pb-2 text-sm text-zinc-500">{filtered.length} đơn</span></div>
    {loading ? <p className="rounded-xl border bg-white p-8 text-sm text-zinc-500">Đang tải đơn ứng tuyển…</p> : filtered.length ? <div className="overflow-x-auto rounded-xl border bg-white shadow-sm"><table className="w-full min-w-[1250px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Ứng viên</th><th className="px-4 py-3">Đợt tuyển / ban / vị trí</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Thời gian tham gia phỏng vấn</th><th className="px-4 py-3">Câu trả lời trong form</th></tr></thead><tbody className="divide-y">{filtered.map((application) => {
      const position = positionById.get(application.position_id);
      const teamId = teamByPosition.get(application.position_id);
      const status = statusLabel[application.status] ?? application.status;
      const applicationAnswers = answersByApplication.get(application.id) ?? [];
      const availabilityAnswer = applicationAnswers.find((answer) => answer.question_text.trim().toLocaleLowerCase("vi") === "thời gian có thể tham gia phỏng vấn".toLocaleLowerCase("vi"));
      const availabilityValue = availabilityAnswer?.answer_text ?? (availabilityAnswer?.answer_json == null ? null : typeof availabilityAnswer.answer_json === "string" ? availabilityAnswer.answer_json : JSON.stringify(availabilityAnswer.answer_json));
      return <tr key={application.id} className="align-top"><td className="px-3 py-2"><p className="font-semibold">{application.full_name || "Chưa cung cấp họ tên"}</p><p className="mt-1 text-xs text-zinc-600">{application.email || "Chưa cung cấp email"}</p><p className="mt-1 text-xs text-zinc-600">{application.phone || "Chưa có số điện thoại"}</p><p className="mt-1 text-xs text-zinc-500">MSSV: {application.student_code || "—"} · Lớp: {application.class_name || "—"}</p></td><td className="px-3 py-2"><p className="font-medium">{campaignById.get(application.campaign_id) ?? "Đợt tuyển"}</p><p className="mt-1 text-sm text-zinc-600">{teamId ? teamById.get(teamId) : "Chưa gán ban"}</p><p className="mt-1 text-sm text-zinc-700">{position?.name ?? "Vị trí đã xóa"}</p></td><td className="px-3 py-2"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{status}</span><p className="mt-2 text-xs text-zinc-500">Nộp lúc {new Date(application.submitted_at).toLocaleString("vi-VN")}</p></td><td className="max-w-xs px-3 py-2"><p title={availabilityValue ?? "Chưa có thông tin thời gian"} className="line-clamp-2 min-w-[180px] whitespace-pre-wrap break-words text-xs leading-4 text-zinc-700">{availabilityValue || <span className="text-zinc-500">Chưa có thông tin thời gian</span>}</p></td><td className="px-3 py-2"><ApplicantAnswersModal applicantName={application.full_name || "Ứng viên"} answers={applicationAnswers} /></td></tr>;
    })}</tbody></table></div> : <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-zinc-500">Chưa có đơn ứng tuyển phù hợp.</div>}
  </section>;
}
