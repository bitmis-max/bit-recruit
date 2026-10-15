"use client";

import { useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";

export type QuestionType = "text" | "long_text" | "single_choice" | "multi_choice" | "number" | "date";
export type Question = { id: string; question_text: string; question_type: QuestionType; options: string[] | null; is_required: boolean; order_index: number };
const interviewAvailabilityQuestion = "Thời gian có thể tham gia phỏng vấn";
type Props = { positionId: string; form: { id: string; name: string; description: string | null } | null; questions: Question[]; canWrite: boolean; onFormChange: (form: Props["form"]) => void; onQuestionsChange: (questions: Question[]) => void; onError: (message: string) => void };

const types: { value: QuestionType; label: string }[] = [
  { value: "text", label: "Trả lời ngắn" }, { value: "long_text", label: "Trả lời dài" },
  { value: "single_choice", label: "Chọn một" }, { value: "multi_choice", label: "Chọn nhiều" },
  { value: "number", label: "Số" }, { value: "date", label: "Ngày" },
];

export function FormBuilder({ positionId, form, questions, canWrite, onFormChange, onQuestionsChange, onError }: Props) {
  const [saving, setSaving] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const supabase = getSupabaseClient();

  async function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite || !supabase) return;
    const values = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const payload = { name: String(values.get("name") ?? "").trim(), description: String(values.get("description") ?? "").trim() || null };
      const result = form
        ? await supabase.from("application_forms").update(payload).eq("id", form.id).select("id,name,description").single()
        : await supabase.from("application_forms").insert({ ...payload, position_id: positionId }).select("id,name,description").single();
      if (result.error) throw result.error;
      const { data: savedAvailability, error: availabilityLoadError } = await supabase.from("form_questions").select("id").eq("form_id", result.data.id).eq("question_text", interviewAvailabilityQuestion).maybeSingle();
      if (availabilityLoadError) throw availabilityLoadError;
      if (!savedAvailability) {
        const { data: availabilityQuestion, error: availabilityError } = await supabase.from("form_questions").insert({
          form_id: result.data.id,
          question_text: interviewAvailabilityQuestion,
          question_type: "long_text",
          is_required: true,
          order_index: 0,
        }).select("id,question_text,question_type,options,is_required,order_index").single();
        if (availabilityError) throw availabilityError;
        onQuestionsChange([...questions, availabilityQuestion as Question].sort((a, b) => a.order_index - b.order_index));
      }
      onFormChange(result.data);
    } catch (error) { onError(error instanceof Error ? error.message : "Không lưu được biểu mẫu."); }
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
    const { data, error } = await supabase.from("form_questions").insert({ form_id: form.id, question_text: "Câu hỏi mới", question_type: "text", is_required: false, order_index: questions.length }).select("id,question_text,question_type,options,is_required,order_index").single();
    if (error) onError(error.message); else onQuestionsChange([...questions, data as Question]);
  }

  async function saveQuestion(question: Question) {
    if (!supabase) return;
    const { error } = await supabase.from("form_questions").update({ question_text: question.question_text.trim(), question_type: question.question_type, options: question.question_type === "single_choice" || question.question_type === "multi_choice" ? question.options ?? [] : null, is_required: question.is_required }).eq("id", question.id);
    if (error) onError(error.message);
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
    <div className="mb-4"><h3 className="font-semibold">Biểu mẫu ứng tuyển</h3><p className="text-xs text-zinc-500">Mỗi ban tuyển có một biểu mẫu riêng.</p></div>
    <form key={form?.id ?? positionId} onSubmit={saveForm} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Tên biểu mẫu<input name="name" required defaultValue={form?.name ?? ""} placeholder="Ví dụ: Đơn ứng tuyển ban Nội dung" disabled={!canWrite} className="mt-1 w-full rounded-lg border bg-white px-3 py-2" /></label>
      <label className="text-sm font-medium">Mô tả<textarea name="description" rows={2} defaultValue={form?.description ?? ""} disabled={!canWrite} className="mt-1 w-full rounded-lg border bg-white px-3 py-2" /></label>
      <div className="flex gap-2 sm:col-span-2">{canWrite && <button disabled={saving} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Đang lưu…" : form ? "Lưu biểu mẫu" : "Tạo biểu mẫu"}</button>}{form && canWrite && <button type="button" onClick={() => void deleteForm()} className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-700">Xóa biểu mẫu</button>}</div>
    </form>

    {form && <div className="mt-6 border-t pt-5"><div className="mb-3 flex items-center justify-between"><div><h4 className="font-semibold">Câu hỏi ({questions.length})</h4><p className="mt-1 text-xs text-zinc-500">Các ca phỏng vấn đang mở sẽ tự hiện thành lựa chọn thời gian trong form.</p></div>{canWrite && <button onClick={() => void addQuestion()} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">+ Thêm câu hỏi</button>}</div>
      {!questions.length ? <p className="rounded-lg border border-dashed bg-white p-4 text-sm text-zinc-500">Chưa có câu hỏi.</p> : <ol className="space-y-3">{[...questions].sort((a,b) => a.order_index-b.order_index).map((question, index) => { const isAvailabilityQuestion = question.question_text === interviewAvailabilityQuestion; return <li key={question.id} draggable={canWrite && !isAvailabilityQuestion} onDragStart={() => setDragged(question.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged) void moveQuestion(dragged, question.id); setDragged(null); }} className="rounded-xl border bg-white p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2"><button type="button" title="Kéo để sắp xếp" aria-label={`Kéo để sắp xếp câu ${index + 1}`} className="cursor-grab text-zinc-400" disabled={!canWrite}>⠿</button><span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Câu {index + 1}</span><div className="ml-auto flex gap-1"><button type="button" disabled={!canWrite || index === 0} onClick={() => void moveQuestion(question.id, questions[index - 1]?.id)} className="rounded border px-2 py-1 text-xs disabled:opacity-40" aria-label="Chuyển lên">↑</button><button type="button" disabled={!canWrite || index === questions.length-1} onClick={() => void moveQuestion(question.id, questions[index + 1]?.id)} className="rounded border px-2 py-1 text-xs disabled:opacity-40" aria-label="Chuyển xuống">↓</button></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Nội dung câu hỏi<input value={question.question_text} disabled={!canWrite || isAvailabilityQuestion} onChange={(event) => patchQuestion(question.id, { question_text: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
          <label className="text-sm font-medium">Loại câu hỏi<select value={question.question_type} disabled={!canWrite || isAvailabilityQuestion} onChange={(event) => patchQuestion(question.id, { question_type: event.target.value as QuestionType, options: ["single_choice", "multi_choice"].includes(event.target.value) ? question.options ?? [] : null })} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={question.is_required} disabled={!canWrite || isAvailabilityQuestion} onChange={(event) => patchQuestion(question.id, { is_required: event.target.checked })} />Bắt buộc trả lời{isAvailabilityQuestion && <span className="text-xs text-zinc-500">(trường dùng để xếp ca)</span>}</label>
          {["single_choice", "multi_choice"].includes(question.question_type) && <label className="text-sm font-medium sm:col-span-2">Các lựa chọn<textarea rows={3} disabled={!canWrite} value={(question.options ?? []).join("\n")} onChange={(event) => patchQuestion(question.id, { options: event.target.value.split("\n").map((option) => option.trim()).filter(Boolean) })} placeholder="Mỗi lựa chọn một dòng" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>}
        </div>
        {canWrite && <div className="mt-3 flex justify-end gap-2">{!isAvailabilityQuestion && <button type="button" onClick={() => void deleteQuestion(question.id)} className="rounded-lg px-3 py-2 text-sm text-rose-700">Xóa</button>}{!isAvailabilityQuestion && <button type="button" onClick={() => void saveQuestion(question)} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800">Lưu câu hỏi</button>}</div>}
      </li>; })}</ol>}
    </div>}
  </section>;
}
