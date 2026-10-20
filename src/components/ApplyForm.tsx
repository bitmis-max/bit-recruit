"use client";

import { useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { getSupabaseClient } from "../lib/supabase/client";
import type { FormQuestion } from "../lib/recruitment/types";
import { formatInterviewRange } from "../lib/recruitment/interview-time";

type InterviewSession = { id: string; start_time: string; end_time: string };
type Props = { position: { id: string; name: string }; questions: FormQuestion[]; interviewSessions: InterviewSession[] };
type Applicant = { full_name: string; email: string; phone: string; student_code: string; class_name: string };
type AnswerValue = string | string[];
const interviewAvailabilityQuestion = "Thời gian có thể tham gia phỏng vấn";
const normalizeQuestionText = (text: string) => text.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
const isInterviewAvailabilityQuestion = (text: string) => normalizeQuestionText(text) === normalizeQuestionText(interviewAvailabilityQuestion);

const requiredText = (label: string) => z.string().trim().min(1, `${label} là bắt buộc`);

export default function ApplyForm({ position, questions, interviewSessions }: Props) {
  const activeQuestions = useMemo(() => {
    let availabilityIncluded = false;
    return questions.filter((question) => {
      if (!isInterviewAvailabilityQuestion(question.question_text)) return true;
      if (!interviewSessions.length || availabilityIncluded) return false;
      availabilityIncluded = true;
      return true;
    });
  }, [questions, interviewSessions]);
  const [applicant, setApplicant] = useState<Applicant>({ full_name: "", email: "", phone: "", student_code: "", class_name: "" });
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(
    () => Object.fromEntries(activeQuestions.map((q) => [q.id, q.question_type === "multi_choice" ? [] : ""])),
  );
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const schema = useMemo(() => {
    const answerShape: Record<string, z.ZodType> = {};
    for (const question of activeQuestions) {
      const required = question.is_required;
      if (isInterviewAvailabilityQuestion(question.question_text)) {
        answerShape[question.id] = z.string().min(1, "Vui lòng chọn ca phỏng vấn").refine((value) => interviewSessions.some((session) => session.id === value), "Ca phỏng vấn không hợp lệ");
        continue;
      }
      switch (question.question_type) {
        case "number": {
          const numberSchema = z.preprocess(
            (value) => value === "" || value == null ? undefined : Number(value),
            z.number({ error: "Giá trị phải là một số hợp lệ" }).finite("Giá trị phải là một số hữu hạn"),
          );
          answerShape[question.id] = required ? numberSchema : numberSchema.optional();
          break;
        }
        case "multi_choice": {
          const choiceSchema = z.array(z.string());
          answerShape[question.id] = required
            ? choiceSchema.min(1, "Vui lòng chọn ít nhất một phương án")
            : choiceSchema;
          break;
        }
        default: {
          let textSchema = z.string();
          if (required) textSchema = textSchema.trim().min(1, "Câu trả lời này là bắt buộc");
          if (question.question_type === "date") {
            textSchema = textSchema.refine((value) => {
              if (!value) return true;
              if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
              const date = new Date(`${value}T00:00:00Z`);
              return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
            }, "Ngày không hợp lệ");
          }
          if (question.question_type === "single_choice" && question.options?.length) {
            textSchema = textSchema.refine((value) => !value || question.options!.includes(value), "Vui lòng chọn phương án hợp lệ");
          }
          answerShape[question.id] = textSchema;
        }
      }
    }

    return z.object({
      full_name: requiredText("Họ và tên"),
      email: requiredText("Email").email("Email không đúng định dạng"),
      phone: z.string(),
      student_code: z.string(),
      class_name: z.string(),
      answers: z.object(answerShape),
    });
  }, [activeQuestions, interviewSessions]);

  const updateApplicant = (key: keyof Applicant, value: string) => {
    setApplicant((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  };

  const updateAnswer = (id: string, value: AnswerValue) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setFieldErrors((current) => ({ ...current, [id]: "" }));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setSubmitError(null);
    setToken(null);

    const result = schema.safeParse({ ...applicant, answers });
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] === "answers" ? String(issue.path[1]) : String(issue.path[0]);
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setSubmitError("Chưa cấu hình kết nối Supabase. Vui lòng báo ban quản trị.");
      setLoading(false);
      return;
    }

    const p_answers = activeQuestions.map((question) => {
      const value = result.data.answers[question.id];
      if (isInterviewAvailabilityQuestion(question.question_text)) {
        const selectedSession = interviewSessions.find((session) => session.id === value);
        return { question_id: question.id, text: selectedSession ? formatInterviewRange(selectedSession.start_time, selectedSession.end_time) : null, json: selectedSession ? [selectedSession.id] : [] };
      }
      if (question.question_type === "multi_choice") {
        return { question_id: question.id, text: null, json: value ?? [] };
      }
      return { question_id: question.id, text: value == null || value === "" ? null : String(value), json: null };
    });

    const { data, error } = await supabase.rpc("submit_application", {
      p_position_id: position.id,
      p_full_name: result.data.full_name,
      p_email: result.data.email,
      p_phone: result.data.phone.trim() || null,
      p_student_code: result.data.student_code.trim() || null,
      p_class_name: result.data.class_name.trim() || null,
      p_answers,
    });

    if (error) {
      setSubmitError(error.message.includes("duplicate key")
        ? "Địa chỉ email này đã nộp đơn cho vị trí này."
        : `Chưa gửi được đơn: ${error.message}`);
    } else if (typeof data !== "string" || !data) {
      setSubmitError("Máy chủ chưa trả về mã theo dõi. Vui lòng thử lại hoặc liên hệ ban quản trị.");
    } else {
      setToken(data);
    }
    setLoading(false);
  }

  const inputClass = "recruitment-input mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-3 text-zinc-900 outline-none transition placeholder:text-zinc-400";

  return (
    <form onSubmit={handleSubmit} noValidate className="recruitment-form space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      <section className="space-y-5">
        <h2 className="text-lg font-semibold">Thông tin của bạn</h2>
        <div>
          <label htmlFor="full_name" className="text-sm font-medium">Họ và tên <span className="text-red-600">*</span></label>
          <input id="full_name" autoComplete="name" className={inputClass} value={applicant.full_name} onChange={(event) => updateApplicant("full_name", event.target.value)} aria-invalid={!!fieldErrors.full_name} aria-describedby={fieldErrors.full_name ? "error-full_name" : undefined} />
          <FieldError id="error-full_name" message={fieldErrors.full_name} />
        </div>
        <div>
          <label htmlFor="email" className="text-sm font-medium">Email <span className="text-red-600">*</span></label>
          <input id="email" type="email" autoComplete="email" className={inputClass} value={applicant.email} onChange={(event) => updateApplicant("email", event.target.value)} aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "error-email" : undefined} />
          <FieldError id="error-email" message={fieldErrors.email} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Số điện thoại" id="phone" value={applicant.phone} onChange={(value) => updateApplicant("phone", value)} className={inputClass} />
          <TextField label="Mã số sinh viên" id="student_code" value={applicant.student_code} onChange={(value) => updateApplicant("student_code", value)} className={inputClass} />
        </div>
        <TextField label="Lớp" id="class_name" value={applicant.class_name} onChange={(value) => updateApplicant("class_name", value)} className={inputClass} />
      </section>

      {activeQuestions.length > 0 && <hr className="border-zinc-200" />}
      <section className="space-y-6">
        {questions.some((question) => isInterviewAvailabilityQuestion(question.question_text)) && interviewSessions.length === 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Hiện chưa có ca phỏng vấn để chọn. Ban tuyển sẽ liên hệ lịch với bạn sau.</p>}
        {activeQuestions.map((question) => (
          <div key={question.id}>
            <label htmlFor={`q-${question.id}`} className="text-sm font-medium leading-6">
              {question.question_text}{question.is_required && <span className="ml-1 text-red-600">*</span>}
            </label>
            {isInterviewAvailabilityQuestion(question.question_text) ? (
              <fieldset className="mt-3 space-y-2">
                <legend className="sr-only">Chọn ca phỏng vấn</legend>
                {Array.from(new Map(interviewSessions.map((session) => [`${session.start_time}|${session.end_time}`, session])).values()).map((session) => (
                  <label key={session.id} htmlFor={`q-${question.id}-${session.id}`} className="recruitment-option flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-3 py-3 transition">
                    <input id={`q-${question.id}-${session.id}`} type="radio" name={`q-${question.id}`} value={session.id} checked={answers[question.id] === session.id} onChange={() => updateAnswer(question.id, session.id)} className="size-4 accent-sky-700" />
                    <span className="text-sm font-medium text-zinc-800">{formatInterviewRange(session.start_time, session.end_time)}</span>
                  </label>
                ))}
              </fieldset>
            ) : question.question_type === "long_text" ? (
              <textarea id={`q-${question.id}`} rows={4} className={inputClass} value={String(answers[question.id] ?? "")} onChange={(event) => updateAnswer(question.id, event.target.value)} aria-invalid={!!fieldErrors[question.id]} />
            ) : question.question_type === "single_choice" ? (
              <fieldset className="mt-3 space-y-2">
                <legend className="sr-only">{question.question_text}</legend>
                {(question.options ?? []).map((option) => (
                  <label key={option} className="recruitment-option flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5">
                    <input type="radio" name={`q-${question.id}`} value={option} checked={answers[question.id] === option} onChange={() => updateAnswer(question.id, option)} className="accent-sky-700" />
                    <span className="text-sm">{option}</span>
                  </label>
                ))}
              </fieldset>
            ) : question.question_type === "multi_choice" ? (
              <fieldset className="mt-3 space-y-2">
                <legend className="sr-only">{question.question_text}</legend>
                {(question.options ?? []).map((option) => {
                  const selected = Array.isArray(answers[question.id]) ? answers[question.id] as string[] : [];
                  return (
                    <label key={option} className="recruitment-option flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5">
                      <input type="checkbox" checked={selected.includes(option)} onChange={(event) => updateAnswer(question.id, event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} className="size-4 accent-sky-700" />
                      <span className="text-sm">{option}</span>
                    </label>
                  );
                })}
              </fieldset>
            ) : (
              <input id={`q-${question.id}`} type={question.question_type === "number" ? "number" : question.question_type === "date" ? "date" : "text"} step={question.question_type === "number" ? "any" : undefined} className={inputClass} value={String(answers[question.id] ?? "")} onChange={(event) => updateAnswer(question.id, event.target.value)} aria-invalid={!!fieldErrors[question.id]} />
            )}
            <FieldError id={`error-${question.id}`} message={fieldErrors[question.id]} />
          </div>
        ))}
      </section>

      {submitError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{submitError}</div>}
      {token && (
        <div role="status" className="recruitment-success rounded-xl border p-5">
          <h2 className="font-semibold">Đã nhận đơn ứng tuyển</h2>
          <p className="mt-1 text-sm">Lưu mã theo dõi này để kiểm tra trạng thái đơn:</p>
          <code className="mt-3 block break-all rounded-lg bg-white px-3 py-2 font-mono text-sm">{token}</code>
        </div>
      )}
      <button type="submit" disabled={loading || !!token} className="recruitment-submit inline-flex min-h-12 items-center justify-center rounded-lg px-6 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60">
        {loading && <span aria-hidden="true" className="mr-2 size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {loading ? "Đang gửi đơn…" : token ? "Đã nộp đơn" : "Gửi đơn ứng tuyển"}
      </button>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="mt-1.5 text-sm text-red-700">{message}</p> : null;
}

function TextField({ label, id, value, onChange, className }: { label: string; id: string; value: string; onChange: (value: string) => void; className: string }) {
  return <div><label htmlFor={id} className="text-sm font-medium">{label}</label><input id={id} className={className} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
