"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { friendlyError } from "../../../lib/ui/friendly-error";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { Panel } from "../ui/Panel";
import { QuestionList, type EditableQuestion } from "./QuestionFields";

export type { QuestionType } from "./QuestionFields";
export type Question = EditableQuestion;
type TemplateOption = { id: string; name: string; is_default: boolean };
export const interviewAvailabilityQuestion = "Thời gian có thể tham gia phỏng vấn";
type Props = { positionId: string; form: { id: string; name: string; description: string | null; source_template_id: string | null } | null; questions: Question[]; canWrite: boolean; onFormChange: (form: Props["form"]) => void; onQuestionsChange: (questions: Question[]) => void; onError: (message: string) => void; onDirtyChange?: (dirty: boolean) => void };

export function FormBuilder({ positionId, form, questions, canWrite, onFormChange, onQuestionsChange, onError, onDirtyChange }: Props) {
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
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
    setNote("");
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
      setNote(form ? "Đã lưu biểu mẫu." : "Đã tạo biểu mẫu.");
    } catch (error) {
      onError(friendlyError(error, "Không lưu được biểu mẫu."));
    }
    finally { setSaving(false); }
  }

  async function deleteForm() {
    if (!form || !supabase || !confirm("Xóa biểu mẫu và toàn bộ câu hỏi trong biểu mẫu này?")) return;
    setNote("");
    const { data: savedQuestions, error: questionLoadError } = await supabase.from("form_questions").select("id").eq("form_id", form.id);
    if (questionLoadError) { onError(friendlyError(questionLoadError, "Không kiểm tra được câu hỏi của biểu mẫu.")); return; }
    const questionIds = (savedQuestions ?? []).map((question) => question.id);
    if (questionIds.length) {
      const { count, error } = await supabase.from("application_answers").select("id", { count: "exact", head: true }).in("question_id", questionIds);
      if (error) { onError(friendlyError(error, "Không kiểm tra được câu trả lời của biểu mẫu.")); return; }
      if (count) { onError("Biểu mẫu đã có câu trả lời. Không thể xóa để bảo toàn dữ liệu ứng viên."); return; }
    }
    const { error } = await supabase.from("application_forms").delete().eq("id", form.id);
    if (error) onError(friendlyError(error, "Không xóa được biểu mẫu.")); else { onFormChange(null); onQuestionsChange([]); setOpenId(null); setNote("Đã xóa biểu mẫu."); }
  }

  async function addQuestion() {
    if (!form || !supabase) return;
    const { data, error } = await supabase.from("form_questions").insert({ form_id: form.id, question_text: "Câu hỏi mới", question_type: "text", field_key: null, is_required: false, order_index: questions.length }).select("id,question_text,question_type,field_key,options,is_required,order_index").single();
    if (error) onError(friendlyError(error, "Không thêm được câu hỏi.")); else { onQuestionsChange([...questions, data as Question]); setOpenId((data as Question).id); setNote(""); }
  }

  async function saveQuestions() {
    if (!form || !supabase || !canWrite) return;
    setNote("");
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
        onDirtyChange?.(false);
        setNote("Đã lưu các câu hỏi và thứ tự.");
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
    if (openId === id) setOpenId(null);
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
    onDirtyChange?.(true);
  }

  function patchQuestion(id: string, patch: Partial<Question>) {
    onQuestionsChange(questions.map((question) => question.id === id ? { ...question, ...patch } : question));
    onDirtyChange?.(true);
  }

  const editableQuestions = [...questions]
    .filter((question) => question.question_text.trim() !== interviewAvailabilityQuestion)
    .sort((a, b) => a.order_index - b.order_index);

  return <div className="space-y-5">
    {note && <Notice tone="success" className="!mb-0">{note}</Notice>}
    <Panel title="Biểu mẫu ứng tuyển">
      <p className="-mt-1 mb-4 text-sm text-zinc-600">Mỗi vị trí tuyển có một biểu mẫu riêng.</p>
      <form key={form?.id ?? positionId} onSubmit={saveForm} className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên biểu mẫu"><input name="name" required defaultValue={form?.name ?? ""} placeholder="Ví dụ: Đơn ứng tuyển ban Nội dung" disabled={!canWrite} className={inputClass} /></Field>
        <Field label="Mô tả"><textarea name="description" rows={2} defaultValue={form?.description ?? ""} disabled={!canWrite} className={inputClass} /></Field>
        {!form && canWrite && <Field label="Template biểu mẫu" hint="Câu hỏi được sao chép vào biểu mẫu này; thay đổi template sau đó không ảnh hưởng biểu mẫu đã tạo." className="sm:col-span-2"><select required value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className={inputClass}><option value="">Chọn template để khởi tạo</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.is_default ? " (mặc định)" : ""}</option>)}</select></Field>}
        {canWrite && <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button type="submit" variant={form ? "secondary" : "primary"} loading={saving}>{saving ? "Đang lưu…" : form ? "Lưu biểu mẫu" : "Tạo biểu mẫu"}</Button>
          {form && <Button variant="danger" icon="trash" className="sm:ml-auto" onClick={() => void deleteForm()}>Xóa biểu mẫu</Button>}
        </div>}
      </form>
    </Panel>

    {form && <Panel title={`Câu hỏi (${editableQuestions.length})`} padded={false} actions={canWrite && <Button size="sm" icon="plus" onClick={() => void addQuestion()}>Thêm câu hỏi</Button>}>
      <p className="border-b border-zinc-100 px-4 py-2.5 text-xs text-zinc-500 sm:px-5">Các ca phỏng vấn đang mở sẽ tự hiện ở cuối biểu mẫu ứng viên. Bấm một câu để sửa.</p>
      {!editableQuestions.length
        ? <p className="px-4 py-8 text-center text-sm text-zinc-500">Chưa có câu hỏi.{canWrite ? " Bấm “Thêm câu hỏi” để bắt đầu." : ""}</p>
        : <QuestionList questions={editableQuestions} canWrite={canWrite} hideFieldMapping openId={openId} onOpenChange={setOpenId} onPatch={patchQuestion} onDelete={(id) => void deleteQuestion(id)} onMove={(source, target) => void moveQuestion(source, target)} />}
      {canWrite && <div className="flex justify-end border-t border-zinc-100 px-4 py-3 sm:px-5"><Button variant="primary" loading={saving} onClick={() => void saveQuestions()}>{saving ? "Đang lưu câu hỏi…" : "Lưu các câu hỏi"}</Button></div>}
    </Panel>}
  </div>;
}
