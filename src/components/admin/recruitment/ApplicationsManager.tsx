"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
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
type ImportRow = Record<string, unknown>;

const statusLabel: Record<string, string> = { submitted: "Mới nộp", screening: "Đang xét", interview: "Phỏng vấn", passed: "Đạt", failed: "Không đạt", withdrawn: "Đã rút" };
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";

const mappingOptions = [
  { value: "full_name", label: "Họ tên" },
  { value: "class_name", label: "Lớp" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Điện thoại" },
  { value: "student_code", label: "Mã sinh viên" },
  { value: "position", label: "Vị trí tuyển" },
  { value: "session", label: "Ca phỏng vấn" },
  { value: "custom", label: "Câu hỏi riêng" },
];

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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  // Import state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<{ headers: string[]; rows: ImportRow[] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [formMeta, setFormMeta] = useState({ name: "", description: "" });

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

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true); setError("");
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<ImportRow>(sheet);
      if (!json.length) throw new Error("File Excel không có dữ liệu.");
      const headers = Object.keys(json[0]);
      setImportData({ headers, rows: json });
      setMapping(Object.fromEntries(headers.map((h) => [h, ""])));
      setImportModalOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được file Excel.");
    } finally {
      setBusy(false);
      input.value = ""; // cho phép chọn lại cùng một file
    }
  }

  async function executeImport() {
    if (!supabase || !campaignFilter) {
      setError("Vui lòng chọn đợt tuyển trước khi import.");
      return;
    }
    if (!importData) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const { data: form, error: formError } = await supabase
        .from("application_forms")
        .insert({
          campaign_id: campaignFilter,
          name: formMeta.name,
          description: formMeta.description,
        })
        .select()
        .single();

      if (formError) throw new Error(`Lỗi tạo biểu mẫu: ${formError.message}`);

      const customCols = importData.headers.filter((h) => mapping[h] === "custom");
      const questionMappings: Record<string, string> = {};

      for (const col of customCols) {
        const { data: q, error: qError } = await supabase
          .from("form_questions")
          .insert({
            form_id: form.id,
            question_text: col,
            question_type: "text",
            order_index: customCols.indexOf(col),
          })
          .select()
          .single();
        if (qError) throw new Error(`Lỗi tạo câu hỏi [${col}]: ${qError.message}`);
        questionMappings[col] = q.id;
      }

      const getVal = (val: unknown) => (val !== undefined && val !== null) ? String(val).trim() : null;

      for (const rowData of importData.rows) {
        const m = (key: string) => {
          const header = importData.headers.find((h) => mapping[h] === key);
          return getVal(header ? rowData[header] : undefined);
        };

        const posName = m("position");
        const sessName = m("session");

        if (!posName) throw new Error("Thiếu thông tin Vị trí tuyển cho một dòng dữ liệu.");

        let positionId = "";
        const { data: existingPos } = await supabase
          .from("recruitment_positions")
          .select("id")
          .eq("campaign_id", campaignFilter)
          .eq("name", posName)
          .maybeSingle();

        if (existingPos) {
          positionId = existingPos.id;
        } else {
          const { data: newPos, error: pErr } = await supabase
            .from("recruitment_positions")
            .insert({ campaign_id: campaignFilter, name: posName })
            .select()
            .single();
          if (pErr) throw new Error(`Lỗi tạo vị trí [${posName}]: ${pErr.message}`);
          positionId = newPos.id;
        }

        let sessionId = "";
        if (sessName) {
          const { data: existingSess } = await supabase
            .from("interview_sessions")
            .select("id")
            .eq("campaign_id", campaignFilter)
            .eq("position_id", positionId)
            .eq("note", sessName)
            .maybeSingle();

          if (existingSess) {
            sessionId = existingSess.id;
          } else {
            const { data: newSess, error: sErr } = await supabase
              .from("interview_sessions")
              .insert({
                campaign_id: campaignFilter,
                position_id: positionId,
                round: 1,
                start_time: new Date().toISOString(),
                end_time: new Date(Date.now() + 3600000).toISOString(),
                note: sessName,
              })
              .select()
              .single();
            if (sErr) throw new Error(`Lỗi tạo ca [${sessName}]: ${sErr.message}`);
            sessionId = newSess.id;
          }
        }

        const { data: app, error: appErr } = await supabase
          .from("applications")
          .insert({
            campaign_id: campaignFilter,
            position_id: positionId,
            full_name: m("full_name"),
            email: m("email"),
            phone: m("phone"),
            student_code: m("student_code"),
            class_name: m("class_name"),
          })
          .select()
          .single();
        if (appErr) throw new Error(`Lỗi tạo đơn ứng viên: ${appErr.message}`);

        const answersToInsert = customCols.map((col) => ({
          application_id: app.id,
          question_id: questionMappings[col],
          answer_text: getVal(rowData[col]),
        }));
        if (answersToInsert.length) {
          const { error: ansErr } = await supabase.from("application_answers").insert(answersToInsert);
          if (ansErr) throw new Error(`Lỗi lưu câu trả lời: ${ansErr.message}`);
        }

        if (sessionId) {
          const { error: assErr } = await supabase
            .from("interview_assignments")
            .insert({
              application_id: app.id,
              session_id: sessionId,
            });
          if (assErr) throw new Error(`Lỗi gán ca: ${assErr.message}`);
        }
      }

      setNotice(`Import thành công ${importData.rows.length} ứng viên!`);
      setImportModalOpen(false);
      setFormMeta({ name: "", description: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import thất bại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl p-5 sm:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Hồ sơ tuyển thành viên</p>
          <h1 className="mt-1 text-3xl font-bold">Quản lý đơn ứng tuyển</h1>
          <p className="mt-2 text-sm text-zinc-600">Lọc hồ sơ theo đợt tuyển và ban tuyển.</p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Import Excel
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileImport} />
          </label>
          <button type="button" onClick={() => void load()} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Làm mới</button>
        </div>
      </header>
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <label htmlFor="application-campaign-filter" className="text-sm font-semibold">Đợt tuyển
          <select id="application-campaign-filter" value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)} className="mt-1 block min-w-52 rounded-lg border bg-white px-3 py-2 text-sm">
            {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">Tìm ứng viên
          <input type="search" value={applicantSearch} onChange={(event) => setApplicantSearch(event.target.value)} placeholder="Họ tên, mã sinh viên hoặc lớp" className="mt-1 block min-w-64 rounded-lg border bg-white px-3 py-2 text-sm" />
        </label>
        <label htmlFor="application-team-filter" className="text-sm font-semibold">Ban tuyển
          <select id="application-team-filter" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="mt-1 block min-w-52 rounded-lg border bg-white px-3 py-2 text-sm">
            <option value="all">Tất cả các ban</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <span className="pb-2 text-sm text-zinc-500">{filtered.length} đơn</span>
      </div>
      {loading ? <p className="rounded-xl border bg-white p-8 text-sm text-zinc-500">Đang tải đơn ứng tuyển…</p> : filtered.length ? (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Ứng viên</th>
                <th className="px-4 py-3">Đợt tuyển / ban / vị trí</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Thời gian tham gia phỏng vấn</th>
                <th className="px-4 py-3">Câu trả lời trong form</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((application) => {
                const position = positionById.get(application.position_id);
                const teamId = teamByPosition.get(application.position_id);
                const status = statusLabel[application.status] ?? application.status;
                const applicationAnswers = answersByApplication.get(application.id) ?? [];
                const availabilityAnswer = applicationAnswers.find((answer) => answer.question_text.trim().toLocaleLowerCase("vi") === "thời gian có thể tham gia phỏng vấn".toLocaleLowerCase("vi"));
                const availabilityValue = availabilityAnswer?.answer_text ?? (availabilityAnswer?.answer_json == null ? null : typeof availabilityAnswer.answer_json === "string" ? availabilityAnswer.answer_json : JSON.stringify(availabilityAnswer.answer_json));
                return (
                  <tr key={application.id} className="align-top">
                    <td className="px-3 py-2">
                      <p className="font-semibold">{application.full_name || "Chưa cung cấp họ tên"}</p>
                      <p className="mt-1 text-xs text-zinc-600">{application.email || "Chưa cung cấp email"}</p>
                      <p className="mt-1 text-xs text-zinc-600">{application.phone || "Chưa có số điện thoại"}</p>
                      <p className="mt-1 text-xs text-zinc-500">MSSV: {application.student_code || "—"} · Lớp: {application.class_name || "—"}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{campaignById.get(application.campaign_id) ?? "Đợt tuyển"}</p>
                      <p className="mt-1 text-sm text-zinc-600">{teamId ? teamById.get(teamId) : "Chưa gán ban"}</p>
                      <p className="mt-1 text-sm text-zinc-700">{position?.name ?? "Vị trí đã xóa"}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{status}</span>
                      <p className="mt-2 text-xs text-zinc-500">Nộp lúc {new Date(application.submitted_at).toLocaleString("vi-VN")}</p>
                    </td>
                    <td className="max-w-xs px-3 py-2">
                      <p title={availabilityValue ?? "Chưa có thông tin thời gian"} className="line-clamp-2 min-w-[180px] whitespace-pre-wrap break-words text-xs leading-4 text-zinc-700">{availabilityValue || <span className="text-zinc-500">Chưa có thông tin thời gian</span>}</p>
                    </td>
                    <td className="px-3 py-2">
                      <ApplicantAnswersModal applicantName={application.full_name || "Ứng viên"} answers={applicationAnswers} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-zinc-500">
          Chưa có đơn ứng tuyển phù hợp.
        </div>
      )}

      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-6">
              <h2 className="text-xl font-bold">Mapping dữ liệu Excel</h2>
              <button type="button" onClick={() => setImportModalOpen(false)} className="text-2xl text-zinc-400 hover:text-zinc-600">&times;</button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Tên biểu mẫu
                  <input
                    type="text"
                    className={inputClass}
                    value={formMeta.name}
                    onChange={(e) => setFormMeta({ ...formMeta, name: e.target.value })}
                    placeholder="Ví dụ: Đơn nhập từ Excel Gen 17"
                  />
                </label>
                <label className="text-sm font-medium">
                  Mô tả biểu mẫu
                  <input
                    type="text"
                    className={inputClass}
                    value={formMeta.description}
                    onChange={(e) => setFormMeta({ ...formMeta, description: e.target.value })}
                    placeholder="Nhập mô tả ngắn gọn..."
                  />
                </label>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-semibold text-zinc-600">Ánh xạ cột dữ liệu</p>
                <div className="grid grid-cols-[1fr_1fr] items-center gap-3">
                  <div className="text-xs font-bold uppercase text-zinc-400">Cột Excel</div>
                  <div className="text-xs font-bold uppercase text-zinc-400">Thuộc tính Mapping</div>
                </div>
                {importData?.headers.map((header) => (
                  <div key={header} className="grid grid-cols-[1fr_1fr] items-center gap-3 border-t pt-3">
                    <div className="truncate text-sm" title={header}>{header}</div>
                    <select
                      className={inputClass}
                      value={mapping[header] || ""}
                      onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}
                    >
                      <option value="">-- Bỏ qua --</option>
                      {mappingOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t p-6">
              <button type="button" onClick={() => setImportModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-zinc-50">Hủy</button>
              <button
                type="button"
                disabled={!formMeta.name || !importData || busy}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void executeImport()}
              >
                {busy ? "Đang xử lý..." : "Xác nhận Import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}