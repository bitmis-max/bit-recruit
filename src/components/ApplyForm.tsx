"use client";

import { useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { getSupabaseClient } from "../lib/supabase/client";
import type { FormQuestion } from "../lib/recruitment/types";
import { friendlyError } from "../lib/ui/friendly-error";
import { formatInterviewRange } from "../lib/recruitment/interview-time";
import { OTHER_OPTION } from "./admin/recruitment/QuestionFields";

type InterviewSession = { id: string; start_time: string; end_time: string };
type Props = { position: { id: string; name: string }; questions: FormQuestion[]; interviewSessions: InterviewSession[] };
type AnswerValue = string | string[];
const interviewAvailabilityQuestion = "Thời gian có thể tham gia phỏng vấn";
const normalizeQuestionText = (text: string) => text.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
const isInterviewAvailabilityQuestion = (text: string) => normalizeQuestionText(text) === normalizeQuestionText(interviewAvailabilityQuestion);

export default function ApplyForm({ position, questions, interviewSessions }: Props) {
  const activeQuestions = useMemo(() => {
    const availabilityIndex = questions.findIndex((question) => isInterviewAvailabilityQuestion(question.question_text));
    return questions.filter((question, index) => {
      if (!isInterviewAvailabilityQuestion(question.question_text)) return true;
      return interviewSessions.length > 0 && index === availabilityIndex;
    }).sort((a, b) => Number(isInterviewAvailabilityQuestion(a.question_text)) - Number(isInterviewAvailabilityQuestion(b.question_text)) || a.order_index - b.order_index);
  }, [questions, interviewSessions]);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(
    () => Object.fromEntries(activeQuestions.map((q) => [q.id, q.question_type === "multi_choice" ? [] : ""])),
  );
  const [otherAnswers, setOtherAnswers] = useState<Record<string, string>>({});
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
      if (question.field_key) {
        let fieldSchema = z.string();
        if (required) fieldSchema = fieldSchema.trim().min(1, `${question.question_text} là bắt buộc`);
        if (question.field_key === "email") fieldSchema = fieldSchema.refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Email không đúng định dạng");
        if (question.field_key === "facebook_url") fieldSchema = fieldSchema.refine((value) => !value.trim() || /^https:\/\/(www\.|m\.|web\.)?(facebook|fb)\.com\/.+/.test(value.trim()), "Link Facebook phải bắt đầu bằng https://facebook.com/ hoặc https://fb.com/");
        answerShape[question.id] = fieldSchema;
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

    return z.object({ answers: z.object(answerShape) });
  }, [activeQuestions, interviewSessions]);

  const updateAnswer = (id: string, value: AnswerValue) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setFieldErrors((current) => ({ ...current, [id]: "" }));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setSubmitError(null);
    setToken(null);

    const result = schema.safeParse({ answers });
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[1] ?? issue.path[0]);
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      setLoading(false);
      return;
    }

    const missingOther = activeQuestions.find((question) => {
      if (!(question.options ?? []).includes(OTHER_OPTION)) return false;
      const value = result.data.answers[question.id];
      const selected = Array.isArray(value) ? value.includes(OTHER_OPTION) : value === OTHER_OPTION;
      return selected && !otherAnswers[question.id]?.trim();
    });
    if (missingOther) {
      setFieldErrors((current) => ({ ...current, [missingOther.id]: "Vui lòng nhập câu trả lời cho mục khác" }));
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
        const selected = (value ?? []) as string[];
        const json = selected.map((item) => item === OTHER_OPTION ? (otherAnswers[question.id] ?? "").trim() : item);
        return { question_id: question.id, text: null, json };
      }
      const text = value === OTHER_OPTION ? (otherAnswers[question.id] ?? "").trim() : value == null || value === "" ? null : String(value);
      return { question_id: question.id, text, json: null };
    });

    const { data, error } = await supabase.rpc("submit_application", {
      p_position_id: position.id,
      p_answers,
    });

    if (error) {
      setSubmitError(error.code === "23505" || /duplicate key/i.test(error.message)
        ? "Địa chỉ email này đã nộp đơn cho vị trí này."
        : `Chưa gửi được đơn: ${friendlyError(error, "Có lỗi xảy ra. Vui lòng thử lại sau ít phút.")}`);
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
            ) : question.field_key ? (
              <input id={`q-${question.id}`} type={question.field_key === "email" ? "email" : question.field_key === "phone" ? "tel" : question.field_key === "facebook_url" ? "url" : "text"} autoComplete={question.field_key === "full_name" ? "name" : question.field_key === "email" ? "email" : question.field_key === "phone" ? "tel" : undefined} className={inputClass} value={String(answers[question.id] ?? "")} onChange={(event) => updateAnswer(question.id, event.target.value)} aria-invalid={!!fieldErrors[question.id]} />
            ) : question.question_type === "long_text" ? (
              <textarea id={`q-${question.id}`} rows={4} className={inputClass} value={String(answers[question.id] ?? "")} onChange={(event) => updateAnswer(question.id, event.target.value)} aria-invalid={!!fieldErrors[question.id]} />
            ) : question.question_type === "single_choice" ? (
              <fieldset className="mt-3 space-y-2">
                <legend className="sr-only">{question.question_text}</legend>
                {(question.options ?? []).map((option) => (
                  <div key={option}>
                    <label className="recruitment-option flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5">
                      <input type="radio" name={`q-${question.id}`} value={option} checked={answers[question.id] === option} onChange={() => updateAnswer(question.id, option)} className="accent-sky-700" />
                      <span className="text-sm">{option === OTHER_OPTION ? "Mục khác:" : option}</span>
                    </label>
                    {option === OTHER_OPTION && answers[question.id] === OTHER_OPTION && <input type="text" aria-label="Câu trả lời khác" placeholder="Nhập câu trả lời của bạn" value={otherAnswers[question.id] ?? ""} onChange={(event) => { setOtherAnswers((current) => ({ ...current, [question.id]: event.target.value })); setFieldErrors((current) => ({ ...current, [question.id]: "" })); }} className={inputClass} />}
                  </div>
                ))}
              </fieldset>
            ) : question.question_type === "multi_choice" ? (
              <fieldset className="mt-3 space-y-2">
                <legend className="sr-only">{question.question_text}</legend>
                {(question.options ?? []).map((option) => {
                  const selected = Array.isArray(answers[question.id]) ? answers[question.id] as string[] : [];
                  return (
                    <div key={option}><label className="recruitment-option flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5">
                      <input type="checkbox" checked={selected.includes(option)} onChange={(event) => updateAnswer(question.id, event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} className="size-4 accent-sky-700" />
                      <span className="text-sm">{option === OTHER_OPTION ? "Mục khác:" : option}</span>
                    </label>
                    {option === OTHER_OPTION && selected.includes(OTHER_OPTION) && <input type="text" aria-label="Câu trả lời khác" placeholder="Nhập câu trả lời của bạn" value={otherAnswers[question.id] ?? ""} onChange={(event) => { setOtherAnswers((current) => ({ ...current, [question.id]: event.target.value })); setFieldErrors((current) => ({ ...current, [question.id]: "" })); }} className={inputClass} />}</div>);
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
          <h2 className="font-semibold">Cảm ơn bạn đã điền đơn đăng ký {position.name}</h2>
          <p className="mt-1 text-sm">Kết quả sẽ được gửi qua mail trong thời gian sớm nhất.</p>
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

