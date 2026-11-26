"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { friendlyError } from "../../../lib/ui/friendly-error";
import { QuestionFields, type EditableQuestion } from "./QuestionFields";

export type { QuestionType } from "./QuestionFields";
export type Question = EditableQuestion;
type TemplateOption = { id: string; name: string; is_default: boolean };
const interviewAvailabilityQuestion = "Thời gian có thể tham gia phỏng vấn";
type Props = { positionId: string; form: { id: string; name: string; description: string | null; source_template_id: string | null } | null; questions: Question[]; canWrite: boolean; onFormChange: (form: Props["form"]) => void; onQuestionsChange: (questions: Question[]) => void; onError: (message: string) => void };

export function FormBuilder({ positionId, form, questions, canWrite, onFormChange, onQuestionsChange, onError }: Props) {
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [dragged, setDragged] = useState<string | null>(null);
  const supabase = getSupabaseClient();

  useEffect(() => {
    let cancelled = false;
    async function loadTemplates() {
      if (!supabase) return;
      const { data, error } = await supabase.from("form_templates").select("id,name,is_default").order("name");
      if (cancelled) return;
      if (error) onError(friendlyError(error, "Không tải được danh sách template biểu mẫu."));
      else {
        const rows = (data ?? []) as TemplateOption[];
        setTemplates(rows);
        setSelectedTemplateId((current) => rows.some((row) => row.id === current) ? current : rows.find((row) => row.id === form?.source_template_id)?.id ?? rows.find((row) => row.is_default)?.id ?? rows[0]?.id ?? "");
      }
    }
    void loadTemplates();
    return () => { cancelled = true; };
  }, [supabase, onError, form?.source_template_id]);

  async function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite || !supabase) return;
    const values = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const payload = { name: String(values.get("name") ?? "").trim(), description: String(values.get("description") ?? "").trim() || null };
      let savedForm: NonNullable<Props["form"]>;
      if (!form) {
        const templateId = selectedTemplateId;
        if (!templateId || !templates.some((template) => template.id === templateId)) throw new Error("Hãy chọn template cho biểu mẫu.");
        const { data, error } = await supabase.rpc("create_application_form_from_template", {
          p_position_id: positionId,
          p_template_id: templateId,
          p_name: payload.name,
          p_description: payload.description,
        });
        if (error) throw error;
        const created = data as unknown as { form: NonNullable<Props["form"]>; questions: Question[] };
        if (!created?.form?.id || !Array.isArray(created.questions)) throw new Error("Máy chủ không trả đủ dữ liệu biểu mẫu vừa tạo.");
        savedForm = created.form;
        onQuestionsChange(created.questions);
      } else {
        const { data, error } = await supabase.from("application_forms").update(payload).eq("id", form.id).select("id,name,description,source_template_id").single();
        if (error) throw error;
        savedForm = data;
      }
      onFormChange(savedForm);
    } catch (error) {
      onError(friendlyError(error, "Không lưu được biểu mẫu."));
    }
    finally { setSaving(false); }
  }

  async function deleteForm() {
    if (!form || !supabase || !confirm("Xóa biểu mẫu và toàn bộ câu hỏi trong biểu mẫu này?")) return;
    const { data: savedQuestions, error: questionLoadError } = await supabase.from("form_questions").select("id").eq("form_id", form.id);
    if (questionLoadError) { onError(friendlyError(questionLoadError, "Không kiểm tra được câu hỏi của biểu mẫu.")); return; }
    const questionIds = (savedQuestions ?? []).map((question) => question.id);
    if (questionIds.length) {
      const { count, error } = await supabase.from("application_answers").select("id", { count: "exact", head: true }).in("question_id", questionIds);
      if (error) { onError(friendlyError(error, "Không kiểm tra được câu trả lời của biểu mẫu.")); return; }
      if (count) { onError("Biểu mẫu đã có câu trả lời. Không thể xóa để bảo toàn dữ liệu ứng viên."); return; }
    }
    const { error } = await supabase.from("application_forms").delete().eq("id", form.id);
    if (error) onError(friendlyError(error, "Không xóa được biểu mẫu.")); else { onFormChange(null); onQuestionsChange([]); }
  }

  async function addQuestion() {
    if (!form || !supabase) return;
    const { data, error } = await supabase.from("form_questions").insert({ form_id: form.id, question_text: "Câu hỏi mới", question_type: "text", field_key: null, is_required: false, order_index: questions.length }).select("id,question_text,question_type,field_key,options,is_required,order_index").single();
    if (error) onError(friendlyError(error, "Không thêm được câu hỏi.")); else onQuestionsChange([...questions, data as Question]);
  }

  async function saveQuestions() {
    if (!form || !supabase || !canWrite) return;
    const rows = [...questions].sort((a, b) => {
      const aIsAvailability = a.question_text.trim() === interviewAvailabilityQuestion;
      const bIsAvailability = b.question_text.trim() === interviewAvailabilityQuestion;
      return Number(aIsAvailability) - Number(bIsAvailability) || a.order_index - b.order_index;
    });
    const payload = rows.map((question, index) => {
      const isChoice = question.question_type === "single_choice" || question.question_type === "multi_choice";
      const options = isChoice ? (question.options ?? []).map((option) => option.trim()).filter(Boolean) : null;
      return { question, index, options, isChoice };
    });
    const invalidQuestion = payload.find(({ question, options, isChoice }) => !question.question_text.trim() || (isChoice && (options?.length ?? 0) < 2));
    if (invalidQuestion) {
      onError("Mỗi câu hỏi cần có nội dung; câu hỏi lựa chọn cần ít nhất hai lựa chọn có nội dung.");
      return;
    }
    setSaving(true);
    try {
      const { error: failed } = await supabase.rpc("save_application_form_questions", {
        p_form_id: form.id,
        p_questions: payload.map(({ question, index, options }) => ({
          id: question.id,
          question_text: question.question_text.trim(),
          question_type: question.question_type,
          options,
          is_required: question.is_required,
          order_index: index,
        })),
      });
      if (failed) onError(friendlyError(failed, "Không lưu được câu hỏi."));
      else {
    onQuestionsChange(payload.map(({ question, index, options }) => ({ ...question, question_text: question.question_text.trim(), options, order_index: index })));
        onError("");
      }
    } catch (error) {
      onError(friendlyError(error, "Không lưu được câu hỏi."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuestion(id: string) {
    if (!supabase || !confirm("Xóa câu hỏi này?")) return;
    const { count, error: answerError } = await supabase.from("application_answers").select("id", { count: "exact", head: true }).eq("question_id", id);
    if (answerError) { onError(friendlyError(answerError, "Không kiểm tra được câu trả lời của câu hỏi.")); return; }
    if (count) { onError("Câu hỏi đã có câu trả lời. Không thể xóa để bảo toàn dữ liệu ứng viên."); return; }
    const { error } = await supabase.from("form_questions").delete().eq("id", id);
    if (error) { onError(friendlyError(error, "Không xóa được câu hỏi.")); return; }
    const next = questions.filter((question) => question.id !== id).map((question, index) => ({ ...question, order_index: index }));
    onQuestionsChange(next);
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
  }

  function patchQuestion(id: string, patch: Partial<Question>) {
    onQuestionsChange(questions.map((question) => question.id === id ? { ...question, ...patch } : question));
  }

  const editableQuestions = [...questions]
    .filter((question) => question.question_text.trim() !== interviewAvailabilityQuestion)
    .sort((a, b) => a.order_index - b.order_index);

  return <section className="mt-5 rounded-xl border bg-zinc-50 p-4 sm:p-5">
    <div className="mb-4"><h3 className="font-semibold">Biểu mẫu ứng tuyển</h3><p className="text-xs text-zinc-500">Mỗi vị trí tuyển có một biểu mẫu riêng.</p></div>
    <form key={form?.id ?? positionId} onSubmit={saveForm} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Tên biểu mẫu<input name="name" required defaultValue={form?.name ?? ""} placeholder="Ví dụ: Đơn ứng tuyển ban Nội dung" disabled={!canWrite} className="mt-1 w-full rounded-lg border bg-white px-3 py-2" /></label>
      <label className="text-sm font-medium">Mô tả<textarea name="description" rows={2} defaultValue={form?.description ?? ""} disabled={!canWrite} className="mt-1 w-full rounded-lg border bg-white px-3 py-2" /></label>
      {!form && canWrite && <label className="text-sm font-medium sm:col-span-2">Template biểu mẫu<select required value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2"><option value="">Chọn template để khởi tạo</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.is_default ? " (mặc định)" : ""}</option>)}</select><span className="mt-1 block text-xs font-normal text-zinc-500">Câu hỏi được sao chép vào biểu mẫu này; thay đổi template sau đó không ảnh hưởng biểu mẫu đã tạo.</span></label>}
      <div className="flex gap-2 sm:col-span-2">{canWrite && <button disabled={saving} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Đang lưu…" : form ? "Lưu biểu mẫu" : "Tạo biểu mẫu"}</button>}{form && canWrite && <button type="button" onClick={() => void deleteForm()} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100">Xóa biểu mẫu</button>}</div>
    </form>

    {form && <div className="mt-6 border-t pt-5"><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h4 className="font-semibold">Câu hỏi ({editableQuestions.length})</h4><p className="mt-1 text-xs text-zinc-500">Các ca phỏng vấn đang mở sẽ tự hiện ở cuối biểu mẫu ứng viên.</p></div>{canWrite && <button type="button" onClick={() => void addQuestion()} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">+ Thêm câu hỏi</button>}</div>
      {!editableQuestions.length ? <p className="rounded-lg border border-dashed bg-white p-4 text-sm text-zinc-500">Chưa có câu hỏi.</p> : <ol className="space-y-3">{editableQuestions.map((question, index) => <li key={question.id} draggable={canWrite} onDragStart={() => setDragged(question.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged) void moveQuestion(dragged, question.id); setDragged(null); }} className="rounded-xl border bg-white p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2"><button type="button" title="Kéo để sắp xếp" aria-label={`Kéo để sắp xếp câu ${index + 1}`} className="cursor-grab text-zinc-400" disabled={!canWrite}>⠿</button><div className="ml-auto flex gap-1"><button type="button" disabled={!canWrite || index === 0} onClick={() => void moveQuestion(question.id, editableQuestions[index - 1]?.id)} className="rounded border px-2 py-1 text-xs disabled:opacity-40" aria-label="Chuyển lên">↑</button><button type="button" disabled={!canWrite || index === editableQuestions.length-1} onClick={() => void moveQuestion(question.id, editableQuestions[index + 1]?.id)} className="rounded border px-2 py-1 text-xs disabled:opacity-40" aria-label="Chuyển xuống">↓</button></div></div>
        <QuestionFields question={question} index={index} canWrite={canWrite} hideFieldMapping onChange={(updated) => patchQuestion(question.id, updated)} onDelete={() => void deleteQuestion(question.id)} />
      </li>)}</ol>}
      {canWrite && <div className="mt-4 flex justify-end"><button type="button" disabled={saving} onClick={() => void saveQuestions()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Đang lưu câu hỏi…" : "Lưu các câu hỏi"}</button></div>}
    </div>}
  </section>;
}
