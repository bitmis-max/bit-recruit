"use client";

import { useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { QuestionFields, type EditableQuestion } from "./QuestionFields";

export type { QuestionType } from "./QuestionFields";
export type Question = EditableQuestion;
const interviewAvailabilityQuestion = "Thời gian có thể tham gia phỏng vấn";
type Props = { positionId: string; form: { id: string; name: string; description: string | null } | null; questions: Question[]; canWrite: boolean; onFormChange: (form: Props["form"]) => void; onQuestionsChange: (questions: Question[]) => void; onError: (message: string) => void };

export function FormBuilder({ positionId, form, questions, canWrite, onFormChange, onQuestionsChange, onError }: Props) {
  const [saving, setSaving] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const supabase = getSupabaseClient();

  async function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite || !supabase) return;
    const values = new FormData(event.currentTarget);
    setSaving(true);
    let createdFormId: string | null = null;
    try {
      const payload = { name: String(values.get("name") ?? "").trim(), description: String(values.get("description") ?? "").trim() || null };
      let templateQuestions: Omit<Question, "id">[] = [];
      let templateId: string | null = null;
      if (!form) {
        const { data: template, error: templateError } = await supabase.from("form_templates").select("id").eq("is_default", true).maybeSingle();
        if (templateError) throw new Error(`Không tải được mẫu biểu mẫu mặc định. Hãy chạy migration supabase/migration/migrate_form_templates.sql. ${templateError.message}`);
        templateId = template?.id ?? null;
        if (templateId) {
          const { data, error: questionsError } = await supabase.from("form_template_questions").select("question_text,question_type,field_key,options,is_required,order_index").eq("template_id", templateId).order("order_index");
          if (questionsError) throw questionsError;
          templateQuestions = (data ?? []) as Omit<Question, "id">[];
        }
      }
      const result = form
        ? await supabase.from("application_forms").update(payload).eq("id", form.id).select("id,name,description").single()
        : await supabase.from("application_forms").insert({ ...payload, position_id: positionId, source_template_id: templateId }).select("id,name,description").single();
      if (result.error) throw result.error;
      if (!form) createdFormId = result.data.id;
      let nextQuestions = questions;
      if (!form) {
        const copies = templateQuestions.map((question) => ({ ...question, form_id: result.data.id }));
        const { data: copied, error: copyError } = await supabase.from("form_questions").insert(copies).select("id,question_text,question_type,field_key,options,is_required,order_index");
        if (copyError) throw copyError;
        nextQuestions = (copied ?? []) as Question[];
        onQuestionsChange(nextQuestions);
      }
      const { data: savedAvailability, error: availabilityLoadError } = await supabase.from("form_questions").select("id").eq("form_id", result.data.id).eq("question_text", interviewAvailabilityQuestion).maybeSingle();
      if (availabilityLoadError) throw availabilityLoadError;
      if (!savedAvailability) {
        const { data: availabilityQuestion, error: availabilityError } = await supabase.from("form_questions").insert({
          form_id: result.data.id,
          question_text: interviewAvailabilityQuestion,
          question_type: "long_text",
          is_required: true,
          order_index: Math.max(-1, ...nextQuestions.map((question) => question.order_index)) + 1,
        }).select("id,question_text,question_type,field_key,options,is_required,order_index").single();
        if (availabilityError) throw availabilityError;
        nextQuestions = [...nextQuestions, availabilityQuestion as Question].sort((a, b) => a.order_index - b.order_index);
      }
      if (!form || !savedAvailability) onQuestionsChange(nextQuestions);
      onFormChange(result.data);
    } catch (error) {
      if (createdFormId) await supabase.from("application_forms").delete().eq("id", createdFormId);
      onError(error instanceof Error ? error.message : "Không lưu được biểu mẫu.");
    }
    finally { setSaving(false); }
  }

  async function deleteForm() {
    if (!form || !supabase || !confirm("Xóa biểu mẫu và toàn bộ câu hỏi trong biểu mẫu này?")) return;
    const { data: savedQuestions, error: questionLoadError } = await supabase.from("form_questions").select("id").eq("form_id", form.id);
    if (questionLoadError) { onError(questionLoadError.message); return; }
    const questionIds = (savedQuestions ?? []).map((question) => question.id);
    if (questionIds.length) {
      const { count, error } = await supabase.from("application_answers").select("id", { count: "exact", head: true }).in("question_id", questionIds);
      if (error) { onError(error.message); return; }
      if (count) { onError("Biểu mẫu đã có câu trả lời. Không thể xóa để bảo toàn dữ liệu ứng viên."); return; }
    }
    const { error } = await supabase.from("application_forms").delete().eq("id", form.id);
    if (error) onError(error.message); else { onFormChange(null); onQuestionsChange([]); }
  }

  async function addQuestion() {
    if (!form || !supabase) return;
    const { data, error } = await supabase.from("form_questions").insert({ form_id: form.id, question_text: "Câu hỏi mới", question_type: "text", field_key: null, is_required: false, order_index: questions.length }).select("id,question_text,question_type,field_key,options,is_required,order_index").single();
    if (error) onError(error.message); else onQuestionsChange([...questions, data as Question]);
  }

  async function saveQuestion(question: Question) {
    if (!supabase) return;
    const isChoice = question.question_type === "single_choice" || question.question_type === "multi_choice";
    const options = isChoice ? (question.options ?? []).map((option) => option.trim()).filter(Boolean) : null;
    if (isChoice && (options?.length ?? 0) < 2) {
      onError("Câu hỏi chọn một/chọn nhiều cần ít nhất hai lựa chọn có nội dung.");
      return;
    }
    const { error } = await supabase.from("form_questions").update({ question_text: question.question_text.trim(), question_type: question.question_type, field_key: question.field_key, options, is_required: question.is_required }).eq("id", question.id);
    if (error) onError(error.message);
    else if (isChoice) patchQuestion(question.id, { options });
  }

  async function deleteQuestion(id: string) {
    if (!supabase || !confirm("Xóa câu hỏi này?")) return;
    const { count, error: answerError } = await supabase.from("application_answers").select("id", { count: "exact", head: true }).eq("question_id", id);
    if (answerError) { onError(answerError.message); return; }
    if (count) { onError("Câu hỏi đã có câu trả lời. Không thể xóa để bảo toàn dữ liệu ứng viên."); return; }
    const { error } = await supabase.from("form_questions").delete().eq("id", id);
    if (error) { onError(error.message); return; }
    const next = questions.filter((question) => question.id !== id).map((question, index) => ({ ...question, order_index: index }));
    onQuestionsChange(next);
    await persistOrder(next);
  }

  async function persistOrder(items: Question[]) {
    if (!supabase) return;
    const results = await Promise.all(items.map((question, index) => supabase.from("form_questions").update({ order_index: index }).eq("id", question.id)));
    const failed = results.find((result) => result.error)?.error;
    if (failed) onError(failed.message);
  }

  async function moveQuestion(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const next = [...questions];
    const from = next.findIndex((question) => question.id === sourceId);
    const to = next.findIndex((question) => question.id === targetId);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    const ordered = next.map((question, index) => ({ ...question, order_index: index }));
    onQuestionsChange(ordered);
    await persistOrder(ordered);
  }

  function patchQuestion(id: string, patch: Partial<Question>) {
    onQuestionsChange(questions.map((question) => question.id === id ? { ...question, ...patch } : question));
  }

  return <section className="mt-5 rounded-xl border bg-zinc-50 p-4 sm:p-5">
    <div className="mb-4"><h3 className="font-semibold">Biểu mẫu ứng tuyển</h3><p className="text-xs text-zinc-500">Mỗi vị trí tuyển có một biểu mẫu riêng.</p></div>
    <form key={form?.id ?? positionId} onSubmit={saveForm} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Tên biểu mẫu<input name="name" required defaultValue={form?.name ?? ""} placeholder="Ví dụ: Đơn ứng tuyển ban Nội dung" disabled={!canWrite} className="mt-1 w-full rounded-lg border bg-white px-3 py-2" /></label>
      <label className="text-sm font-medium">Mô tả<textarea name="description" rows={2} defaultValue={form?.description ?? ""} disabled={!canWrite} className="mt-1 w-full rounded-lg border bg-white px-3 py-2" /></label>
      <div className="flex gap-2 sm:col-span-2">{canWrite && <button disabled={saving} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Đang lưu…" : form ? "Lưu biểu mẫu" : "Tạo biểu mẫu"}</button>}{form && canWrite && <button type="button" onClick={() => void deleteForm()} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100">Xóa biểu mẫu</button>}</div>
    </form>

    {form && <div className="mt-6 border-t pt-5"><div className="mb-3 flex items-center justify-between"><div><h4 className="font-semibold">Câu hỏi ({questions.length})</h4><p className="mt-1 text-xs text-zinc-500">Các ca phỏng vấn đang mở sẽ tự hiện thành lựa chọn thời gian trong form.</p></div>{canWrite && <button onClick={() => void addQuestion()} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">+ Thêm câu hỏi</button>}</div>
      {!questions.length ? <p className="rounded-lg border border-dashed bg-white p-4 text-sm text-zinc-500">Chưa có câu hỏi.</p> : <ol className="space-y-3">{[...questions].sort((a,b) => a.order_index-b.order_index).map((question, index) => { const isAvailabilityQuestion = question.question_text === interviewAvailabilityQuestion; return <li key={question.id} draggable={canWrite && !isAvailabilityQuestion} onDragStart={() => setDragged(question.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged) void moveQuestion(dragged, question.id); setDragged(null); }} className="rounded-xl border bg-white p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2"><button type="button" title="Kéo để sắp xếp" aria-label={`Kéo để sắp xếp câu ${index + 1}`} className="cursor-grab text-zinc-400" disabled={!canWrite || isAvailabilityQuestion}>⠿</button><div className="ml-auto flex gap-1"><button type="button" disabled={!canWrite || index === 0 || isAvailabilityQuestion} onClick={() => void moveQuestion(question.id, questions[index - 1]?.id)} className="rounded border px-2 py-1 text-xs disabled:opacity-40" aria-label="Chuyển lên">↑</button><button type="button" disabled={!canWrite || index === questions.length-1 || isAvailabilityQuestion} onClick={() => void moveQuestion(question.id, questions[index + 1]?.id)} className="rounded border px-2 py-1 text-xs disabled:opacity-40" aria-label="Chuyển xuống">↓</button></div></div>
        <QuestionFields question={question} index={index} canWrite={canWrite} locked={isAvailabilityQuestion} hideFieldMapping onChange={(updated) => patchQuestion(question.id, updated)} onSave={() => void saveQuestion(question)} onDelete={() => void deleteQuestion(question.id)} />
      </li>; })}</ol>}
    </div>}
  </section>;
}
