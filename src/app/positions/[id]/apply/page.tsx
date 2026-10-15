import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ApplyForm from "../../../../components/ApplyForm";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import type { ApplicationForm, FormQuestion } from "../../../../lib/recruitment/types";

const interviewAvailabilityQuestion = "Thời gian có thể tham gia phỏng vấn";
type InterviewSession = { id: string; team_id: string | null; start_time: string; end_time: string };

export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <main className="mx-auto max-w-3xl p-8">Chưa cấu hình kết nối Supabase. Vui lòng thử lại sau.</main>;
  }

  const { data: position } = await supabase
    .from("recruitment_positions")
    .select("id,name,description,campaign_id,team_id,recruitment_campaigns!inner(status,start_date,end_date,club_id)")
    .eq("id", id)
    .eq("recruitment_campaigns.status", "open")
    .maybeSingle();

  if (!position) notFound();
  const campaign = Array.isArray(position.recruitment_campaigns)
    ? position.recruitment_campaigns[0]
    : position.recruitment_campaigns;
  const now = Date.now();
  if ((campaign?.start_date && new Date(campaign.start_date).getTime() > now) ||
      (campaign?.end_date && new Date(campaign.end_date).getTime() < now)) notFound();

  let form: ApplicationForm | null = null;
  let questions: FormQuestion[] = [];
  let interviewSessions: InterviewSession[] = [];
  const { data: formData } = await supabase.from("application_forms")
    .select("id,name,description")
    .eq("position_id", position.id)
    .maybeSingle();
  form = formData as ApplicationForm | null;
  if (form) {
    const { data: questionData } = await supabase.from("form_questions")
      .select("id,question_text,question_type,options,is_required,order_index")
      .eq("form_id", form.id)
      .order("order_index");
    questions = (questionData ?? []) as FormQuestion[];
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceRoleKey) {
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    if (form && !questions.some((question) => question.question_text.trim().toLocaleLowerCase("vi") === interviewAvailabilityQuestion.toLocaleLowerCase("vi"))) {
      const { data: existingQuestions } = await admin.from("form_questions").select("id,question_text,question_type,options,is_required,order_index").eq("form_id", form.id).order("order_index");
      const existingQuestion = (existingQuestions ?? []).find((question) => question.question_text.trim().toLocaleLowerCase("vi") === interviewAvailabilityQuestion.toLocaleLowerCase("vi"));
      if (existingQuestion) questions = [...questions, existingQuestion as FormQuestion];
      else {
        const nextOrder = questions.reduce((max, question) => Math.max(max, question.order_index), -1) + 1;
        const { data: createdQuestion } = await admin.from("form_questions").insert({ form_id: form.id, question_text: interviewAvailabilityQuestion, question_type: "long_text", is_required: true, order_index: nextOrder }).select("id,question_text,question_type,options,is_required,order_index").single();
        if (createdQuestion) questions = [...questions, createdQuestion as FormQuestion];
      }
    }

    let sessionsQuery = admin.from("interview_sessions").select("id,team_id,start_time,end_time").eq("campaign_id", position.campaign_id).gte("end_time", new Date().toISOString()).order("start_time");
    sessionsQuery = position.team_id ? sessionsQuery.eq("team_id", position.team_id) : sessionsQuery.is("team_id", null);
    const { data: sessionRows } = await sessionsQuery;
    interviewSessions = (sessionRows ?? []) as InterviewSession[];
  }

  return (
    <main className="min-h-screen bg-[#f7f8f6] px-5 py-10 text-zinc-900 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href={`/clubs/${campaign?.club_id ?? ""}`} className="text-sm font-medium text-emerald-800 hover:underline">← Quay lại các ban đang tuyển</Link>
        <div className="mb-8 mt-8 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">Đơn ứng tuyển</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{position.name}</h1>
          {position.description && <p className="mt-4 whitespace-pre-wrap leading-7 text-zinc-600">{position.description}</p>}
          {form?.description && <p className="mt-3 whitespace-pre-wrap text-zinc-600">{form.description}</p>}
        </div>
        {!form ? (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Ban này chưa được liên kết với biểu mẫu ứng tuyển. Vui lòng liên hệ ban tuyển thành viên.</div>
        ) : (
          <ApplyForm position={{ id: position.id, name: position.name }} questions={questions} interviewSessions={interviewSessions} />
        )}
      </div>
    </main>
  );
}
