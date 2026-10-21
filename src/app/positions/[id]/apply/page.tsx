import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ApplyForm from "../../../../components/ApplyForm";
import { RecruitmentHero } from "../../../../components/recruitment/RecruitmentHero";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import type { ApplicationForm, FormQuestion } from "../../../../lib/recruitment/types";

const interviewAvailabilityQuestion = "Thời gian có thể tham gia phỏng vấn";
type InterviewSession = { id: string; position_id: string; start_time: string; end_time: string };

async function ApplyContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className="mx-auto max-w-3xl p-8">Chưa cấu hình kết nối Supabase. Vui lòng thử lại sau.</div>;
  }

  const { data: position } = await supabase
    .from("recruitment_positions")
    .select("id,name,description,campaign_id,recruitment_campaigns!inner(status,start_date,end_date,club_id)")
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

    const sessionsQuery = admin.from("interview_sessions").select("id,position_id,start_time,end_time").eq("position_id", position.id).gte("end_time", new Date().toISOString()).order("start_time");
    const { data: sessionRows } = await sessionsQuery;
    interviewSessions = (sessionRows ?? []) as InterviewSession[];
  }

  return (
    <div>
      <div className="recruitment-form-content">
        <Link href={`/clubs/${campaign?.club_id ?? ""}`} className="recruitment-back-link">← Quay lại các ban đang tuyển</Link>
        <div className="recruitment-form-heading">
          <p className="recruitment-eyebrow">VỊ TRÍ ỨNG TUYỂN</p>
          <h2>{position.name}</h2>
          {form?.description && <p>{form.description}</p>}
        </div>
        {!form ? (
          <div role="alert" className="recruitment-alert recruitment-alert-warm">Ban này chưa được liên kết với biểu mẫu ứng tuyển. Vui lòng liên hệ ban tuyển thành viên.</div>
        ) : (
          <ApplyForm position={{ id: position.id, name: position.name }} questions={questions} interviewSessions={interviewSessions} />
        )}
      </div>
    </div>
  );
}

export default function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="recruitment-page">
      <RecruitmentHero title="Đơn ứng tuyển" subtitle="Hãy cho chúng mình biết thêm về bạn qua biểu mẫu bên dưới nhé." />
      <Suspense fallback={null}><ApplyContent params={params} /></Suspense>
    </main>
  );
}
