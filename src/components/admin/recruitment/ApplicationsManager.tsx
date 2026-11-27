"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { getNearestCampaignId } from "../../../lib/recruitment/campaign-selection";
import { normalizeSearchText } from "../../../lib/recruitment/search";
import { friendlyError } from "../../../lib/ui/friendly-error";
import { useCurrentAdminClub } from "../AdminClubContext";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { inputClass } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { Panel } from "../ui/Panel";
import { ApplicantAnswersModal } from "./ApplicantAnswersModal";
import { ApplicantImportDialog } from "./ApplicantImportDialog";
import { fetchAllPages, loadApplicationAnswers } from "./loadAnswers";

type Campaign = { id: string; name: string; status: string; start_date: string | null; end_date: string | null; created_at: string };
type Team = { id: string; name: string };
type Position = { id: string; name: string; team_id: string | null };
type Application = { id: string; campaign_id: string; position_id: string; full_name: string | null; email: string | null; phone: string | null; student_code: string | null; class_name: string | null; facebook_url: string | null; admitted_member_id: string | null; status: string; submitted_at: string };
type Answer = { application_id: string; question_id: string; question_text: string; answer_text: string | null; answer_json: unknown };
const statusLabel: Record<string, string> = { submitted: "Mới nộp", screening: "Đang xét", interview: "Phỏng vấn", passed: "Đạt", failed: "Không đạt", withdrawn: "Đã rút" };
const checkboxClass = "size-4 accent-emerald-700 disabled:opacity-40";

export function ApplicationsManager() {
  const supabase = getSupabaseClient();
  const { id: clubId, role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
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
      setError(friendlyError(campaignResult.error ?? teamResult.error, "Không tải được dữ liệu CLB.")); setLoading(false); return;
    }
    const campaignRows = (campaignResult.data ?? []) as Campaign[];
    setCampaigns(campaignRows); setTeams((teamResult.data ?? []) as Team[]);
    setCampaignFilter((current) => campaignRows.some((campaign) => campaign.id === current) ? current : getNearestCampaignId(campaignRows));
    if (!campaignRows.length) { setPositions([]); setApplications([]); setAnswers([]); setLoading(false); return; }
    const campaignIds = campaignRows.map((campaign) => campaign.id);
    const [positionResult, applicationResult] = await Promise.all([
      supabase.from("recruitment_positions").select("id,name,team_id").in("campaign_id", campaignIds),
      fetchAllPages<Application>((from, to) => supabase.from("applications").select("id,campaign_id,position_id,full_name,email,phone,student_code,class_name,facebook_url,admitted_member_id,status,submitted_at").in("campaign_id", campaignIds).order("submitted_at", { ascending: false }).order("id").range(from, to)),
    ]);
    if (positionResult.error || applicationResult.error) {
      setError(friendlyError(positionResult.error ?? applicationResult.error, "Không tải được đơn ứng tuyển.")); setLoading(false); return;
    }
    const positionRows = (positionResult.data ?? []) as Position[];
    const applicationRows = applicationResult.data;
    setPositions(positionRows); setApplications(applicationRows);
    if (applicationRows.length) {
      const { answers: answerRows, error: answerError } = await loadApplicationAnswers(supabase, applicationRows.map((application) => application.id));
      if (answerError) setError(`Đã tải đơn nhưng chưa tải được câu trả lời. ${friendlyError(answerError, "Hãy bấm Làm mới để thử lại.")}`);
      else setAnswers(answerRows);
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
  const admittable = filtered.filter((application) => application.status === "passed" && !application.admitted_member_id);
  const selectedAdmittable = admittable.filter((application) => selected.includes(application.id));

  async function changeStatus(application: Application, status: string) {
    if (!supabase || !canWrite || status === application.status) return;
    setBusy(true); setError(""); setNotice("");
    const { data: updated, error: updateError } = await supabase.from("applications").update({ status }).eq("id", application.id).select("id");
    setBusy(false);
    if (updateError) { setError(friendlyError(updateError, "Không đổi được trạng thái đơn.")); return; }
    if (!updated?.length) { setError("Không đổi được trạng thái đơn này. Đơn có thể đã bị xóa hoặc bạn không có quyền."); return; }
    setApplications((current) => current.map((row) => row.id === application.id ? { ...row, status } : row));
    if (status !== "passed") setSelected((current) => current.filter((id) => id !== application.id));
    setNotice(`Đã đổi trạng thái của ${application.full_name || "ứng viên"} thành "${statusLabel[status] ?? status}".`);
  }

  async function admit() {
    if (!supabase || !canWrite || !selectedAdmittable.length) return;
    if (!window.confirm(`Kết nạp ${selectedAdmittable.length} ứng viên đã chọn thành thành viên CLB?`)) return;
    setBusy(true); setError(""); setNotice("");
    const { data, error: admitError } = await supabase.rpc("admit_applications", { p_application_ids: selectedAdmittable.map((application) => application.id) });
    setBusy(false);
    if (admitError) { setError(friendlyError(admitError, "Không kết nạp được. Hãy thử lại.")); return; }
    const result = (data ?? {}) as { admitted?: number; skipped?: number };
    setNotice(`Đã kết nạp ${result.admitted ?? 0}, bỏ qua ${result.skipped ?? 0}.`);
    setSelected([]);
    await load();
  }

  const answersByApplication = useMemo(() => {
    const grouped = new Map<string, Answer[]>();
    for (const answer of answers) grouped.set(answer.application_id, [...(grouped.get(answer.application_id) ?? []), answer]);
    return grouped;
  }, [answers]);

  const columnCount = (canWrite ? 1 : 0) + 5;

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <PageHeader title="Đơn ứng tuyển" description="Lọc hồ sơ theo đợt tuyển và ban tuyển." actions={<>
      {canWrite && <ApplicantImportDialog campaignId={campaignFilter} campaignName={campaignById.get(campaignFilter) ?? ""} disabled={busy || loading} onError={setError} onImported={async (message) => { setError(""); setNotice(message); await load(); }} />}
      <Button icon="refresh" onClick={() => void load()}>Làm mới</Button>
    </>} />
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,18rem)_minmax(0,12rem)_minmax(0,1fr)]">
      <select id="application-campaign-filter" aria-label="Đợt tuyển" value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)} className={inputClass}>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select>
      <select id="application-team-filter" aria-label="Ban tuyển" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className={inputClass}><option value="all">Tất cả các ban</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
      <input type="search" aria-label="Tìm ứng viên" value={applicantSearch} onChange={(event) => setApplicantSearch(event.target.value)} placeholder="Tìm theo họ tên, mã sinh viên hoặc lớp" className={inputClass} />
    </div>
    {loading ? <div role="status" aria-label="Đang tải đơn ứng tuyển" className="h-72 animate-pulse rounded-xl bg-zinc-100" /> : <Panel
      title={`${filtered.length} đơn`}
      padded={false}
      actions={canWrite && selectedAdmittable.length > 0 && <>
        <span className="text-sm text-zinc-600">{selectedAdmittable.length} đơn được chọn</span>
        <Button variant="ghost" size="sm" onClick={() => setSelected([])} disabled={busy}>Bỏ chọn</Button>
        <Button variant="primary" size="sm" icon="check" loading={busy} onClick={() => void admit()}>{busy ? "Đang xử lý…" : "Kết nạp"}</Button>
      </>}>
      {filtered.length ? <div className="overflow-x-auto rounded-b-xl"><table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs text-zinc-500"><tr>
          {canWrite && <th className="w-8 py-2.5 pl-3 pr-0 sm:w-10 sm:pl-4 sm:pr-1"><input type="checkbox" className={checkboxClass} aria-label="Chọn tất cả đơn đã đạt, chưa kết nạp" disabled={!admittable.length} checked={admittable.length > 0 && selectedAdmittable.length === admittable.length} onChange={(event) => setSelected(event.target.checked ? admittable.map((application) => application.id) : [])} /></th>}
          <th className="px-2 py-2.5 font-medium sm:px-3">Ứng viên</th>
          <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Vị trí</th>
          <th className="px-2 py-2.5 font-medium sm:px-3">Trạng thái</th>
          <th className="hidden px-3 py-2.5 font-medium md:table-cell">Nộp lúc</th>
          <th className="py-2.5 pl-1 pr-4 text-right font-medium"><span className="sr-only">Chi tiết</span></th>
        </tr></thead>
        <tbody className="divide-y divide-zinc-100">{filtered.map((application) => {
          const position = positionById.get(application.position_id);
          const teamId = teamByPosition.get(application.position_id);
          const teamName = teamId ? teamById.get(teamId) : null;
          const status = statusLabel[application.status] ?? application.status;
          const applicationAnswers = answersByApplication.get(application.id) ?? [];
          const availabilityAnswer = applicationAnswers.find((answer) => answer.question_text.trim().toLocaleLowerCase("vi") === "thời gian có thể tham gia phỏng vấn".toLocaleLowerCase("vi"));
          const availabilityValue = availabilityAnswer?.answer_text ?? (availabilityAnswer?.answer_json == null ? null : typeof availabilityAnswer.answer_json === "string" ? availabilityAnswer.answer_json : JSON.stringify(availabilityAnswer.answer_json));
          const canAdmit = application.status === "passed" && !application.admitted_member_id;
          const facebookHref = application.facebook_url && /^https:\/\//i.test(application.facebook_url) ? application.facebook_url : null;
          const applicantLabel = application.full_name || "ứng viên";
          const isOpen = openId === application.id;
          const detailId = `application-detail-${application.id}`;
          const submittedAt = new Date(application.submitted_at).toLocaleString("vi-VN");
          return <Fragment key={application.id}>
            <tr className={selected.includes(application.id) ? "bg-emerald-50/50" : isOpen ? "bg-zinc-50" : ""}>
              {canWrite && <td className="py-2 pl-3 pr-0 sm:pl-4 sm:pr-1"><input type="checkbox" className={checkboxClass} aria-label={`Chọn ${applicantLabel} để kết nạp`} title={canAdmit ? undefined : "Chỉ chọn được đơn đã đạt và chưa kết nạp."} disabled={!canAdmit} checked={selected.includes(application.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, application.id] : current.filter((id) => id !== application.id))} /></td>}
              <td className="min-w-32 px-2 py-2 sm:px-3"><p className="break-words font-medium text-zinc-900">{application.full_name || "Chưa cung cấp họ tên"}</p><p className="break-all text-xs text-zinc-600">{application.email || "Chưa cung cấp email"}</p><p className="text-xs text-zinc-500 sm:hidden">{position?.name ?? "Vị trí đã xóa"}</p></td>
              <td className="hidden px-3 py-2 sm:table-cell"><p className="text-zinc-900">{position?.name ?? "Vị trí đã xóa"}</p><p className="text-xs text-zinc-500">{teamName ?? "Chưa gán ban"}</p></td>
              <td className="px-2 py-2 sm:px-3">{canWrite
                ? <select aria-label={`Trạng thái đơn của ${applicantLabel}`} disabled={busy || !!application.admitted_member_id} title={application.admitted_member_id ? "Đơn đã kết nạp thành thành viên nên không đổi trạng thái được." : undefined} value={application.status} onChange={(event) => void changeStatus(application, event.target.value)} className={`${inputClass} min-w-[6.75rem]`}>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">{status}</span>}
                {application.admitted_member_id && <span className="mt-1 block text-xs font-medium text-sky-800">Đã kết nạp</span>}
              </td>
              <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-zinc-600 md:table-cell">{submittedAt}</td>
              <td className="py-2 pl-0 pr-2 text-right sm:pl-1 sm:pr-4"><Button variant="ghost" size="sm" aria-expanded={isOpen} aria-controls={detailId} aria-label={`${isOpen ? "Ẩn" : "Xem"} chi tiết đơn của ${applicantLabel}`} onClick={() => setOpenId(isOpen ? null : application.id)}><span className="hidden sm:inline">Xem</span><Icon name="chevron-down" size={14} className={isOpen ? "rotate-180" : ""} /></Button></td>
            </tr>
            {isOpen && <tr id={detailId} className="bg-zinc-50"><td colSpan={columnCount} className="px-4 py-4 sm:px-5">
              <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div><dt className="text-xs text-zinc-500">Email</dt><dd className="break-all text-zinc-900">{application.email || "Chưa cung cấp email"}</dd></div>
                <div><dt className="text-xs text-zinc-500">Số điện thoại</dt><dd className="text-zinc-900">{application.phone || "Chưa có số điện thoại"}</dd></div>
                <div><dt className="text-xs text-zinc-500">MSSV · Lớp</dt><dd className="text-zinc-900">{application.student_code || "—"} · {application.class_name || "—"}</dd></div>
                <div><dt className="text-xs text-zinc-500">Đợt tuyển</dt><dd className="text-zinc-900">{campaignById.get(application.campaign_id) ?? "Đợt tuyển"}</dd></div>
                <div><dt className="text-xs text-zinc-500">Ban · Vị trí</dt><dd className="text-zinc-900">{teamName ?? "Chưa gán ban"} · {position?.name ?? "Vị trí đã xóa"}</dd></div>
                <div><dt className="text-xs text-zinc-500">Nộp lúc</dt><dd className="text-zinc-900">{submittedAt}</dd></div>
                {facebookHref && <div><dt className="text-xs text-zinc-500">Facebook</dt><dd><a href={facebookHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-emerald-800 underline underline-offset-2">Facebook<Icon name="external" size={14} /></a></dd></div>}
                <div className="sm:col-span-2 lg:col-span-3"><dt className="text-xs text-zinc-500">Thời gian có thể tham gia phỏng vấn</dt><dd className="whitespace-pre-wrap break-words text-zinc-900">{availabilityValue || <span className="text-zinc-500">Chưa có thông tin thời gian</span>}</dd></div>
              </dl>
              {application.admitted_member_id && <p className="mt-3 text-sm text-sky-800">Đơn đã kết nạp thành thành viên. Không đổi trạng thái được nữa.</p>}
              <div className="mt-4"><ApplicantAnswersModal applicantName={application.full_name || "Ứng viên"} answers={applicationAnswers} /></div>
            </td></tr>}
          </Fragment>;
        })}</tbody>
      </table></div> : <EmptyState title="Chưa có đơn ứng tuyển phù hợp" description="Thử đổi đợt tuyển, ban hoặc từ khóa tìm kiếm." />}
    </Panel>}
  </section>;
}
