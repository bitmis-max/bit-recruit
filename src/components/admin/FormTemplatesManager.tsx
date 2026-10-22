"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";
import { useCurrentAdminClub } from "./AdminClubContext";
import { QuestionFields, type EditableQuestion } from "./recruitment/QuestionFields";

type Template = { id: string; name: string; description: string | null; is_default: boolean };
type TemplateQuestion = EditableQuestion & { template_id: string };
const input = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";

export function FormTemplatesManager() {
  const supabase = getSupabaseClient();
  const { role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [questions, setQuestions] = useState<TemplateQuestion[]>([]);
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = templates.find((item) => item.id === selectedId) ?? null;
  const message = useCallback((value: string, failed = false) => { setError(failed ? value : ""); setNotice(failed ? "" : value); }, []);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error: queryError } = await supabase.from("form_templates").select("id,name,description,is_default").order("is_default", { ascending: false }).order("name");
    if (queryError) { message(queryError.message, true); setLoading(false); return; }
    const rows = (data ?? []) as Template[];
    setTemplates(rows);
    setSelectedId((current) => rows.some((item) => item.id === current) ? current : rows.find((item) => item.is_default)?.id ?? rows[0]?.id ?? "");
    setLoading(false);
  }, [supabase, message]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    let cancelled = false;
    async function loadQuestions() {
      if (!supabase || !selectedId) { setQuestions([]); return; }
      const { data, error: queryError } = await supabase.from("form_template_questions").select("id,template_id,question_text,question_type,field_key,options,is_required,order_index").eq("template_id", selectedId).order("order_index");
      if (cancelled) return;
      if (queryError) message(queryError.message, true); else setQuestions((data ?? []) as TemplateQuestion[]);
    }
    void loadQuestions();
    return () => { cancelled = true; };
  }, [supabase, selectedId, message]);

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !canWrite) return;
    const formElement = event.currentTarget;
    const values = new FormData(formElement); const name = String(values.get("name") ?? "").trim();
    if (!name) return;
    setBusy(true);
    const { data, error: insertError } = await supabase.from("form_templates").insert({ name, is_default: templates.length === 0 }).select("id,name,description,is_default").single();
    setBusy(false);
    if (insertError) message(insertError.message, true); else { setTemplates((rows) => [...rows, data as Template]); setSelectedId(data.id); formElement.reset(); message("Đã tạo mẫu biểu mẫu."); }
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !selected || !canWrite) return;
    const values = new FormData(event.currentTarget); const payload = { name: String(values.get("name") ?? "").trim(), description: String(values.get("description") ?? "").trim() || null };
    if (!payload.name) return;
    setBusy(true); const { error: updateError } = await supabase.from("form_templates").update(payload).eq("id", selected.id); setBusy(false);
    if (updateError) message(updateError.message, true); else { setTemplates((rows) => rows.map((item) => item.id === selected.id ? { ...item, ...payload } : item)); message("Đã lưu thông tin mẫu."); }
  }

  async function setDefault() {
    if (!supabase || !selected || !canWrite || selected.is_default) return;
    setBusy(true);
    const clear = await supabase.from("form_templates").update({ is_default: false }).eq("is_default", true);
    const set = clear.error ? null : await supabase.from("form_templates").update({ is_default: true }).eq("id", selected.id);
    setBusy(false);
    if (clear.error || set?.error) message((clear.error ?? set?.error)?.message ?? "Không đổi được mẫu mặc định.", true);
    else { setTemplates((rows) => rows.map((item) => ({ ...item, is_default: item.id === selected.id }))); message("Đã đặt làm mẫu mặc định."); }
  }

  async function addQuestion() {
    if (!supabase || !selected || !canWrite) return;
    const { data, error: insertError } = await supabase.from("form_template_questions").insert({ template_id: selected.id, question_text: "Câu hỏi mới", question_type: "text", field_key: null, is_required: false, order_index: questions.length }).select("id,template_id,question_text,question_type,field_key,options,is_required,order_index").single();
    if (insertError) message(insertError.message, true); else setQuestions((rows) => [...rows, data as TemplateQuestion]);
  }

  async function saveQuestion(question: TemplateQuestion) {
    if (!supabase || !canWrite) return;
    const isChoice = question.question_type === "single_choice" || question.question_type === "multi_choice";
    const options = isChoice ? (question.options ?? []).map((option) => option.trim()).filter(Boolean) : null;
    if (!question.question_text.trim() || (isChoice && (options?.length ?? 0) < 2)) { message("Câu hỏi cần có nội dung; câu hỏi lựa chọn cần ít nhất hai lựa chọn.", true); return; }
    const { error: updateError } = await supabase.from("form_template_questions").update({ question_text: question.question_text.trim(), question_type: question.question_type, field_key: question.field_key, options, is_required: question.is_required }).eq("id", question.id);
    if (updateError) message(updateError.message, true); else { setQuestions((rows) => rows.map((item) => item.id === question.id ? { ...question, options } : item)); message("Đã lưu câu hỏi mẫu."); }
  }

  async function deleteQuestion(question: TemplateQuestion) {
    if (!supabase || !canWrite || !confirm("Xóa câu hỏi khỏi mẫu? Các biểu mẫu đã tạo từ mẫu không bị ảnh hưởng.")) return;
    const { error: deleteError } = await supabase.from("form_template_questions").delete().eq("id", question.id);
    if (deleteError) message(deleteError.message, true); else { setQuestions((rows) => rows.filter((item) => item.id !== question.id)); message("Đã xóa câu hỏi khỏi mẫu."); }
  }

  function patchQuestion(id: string, patch: Partial<TemplateQuestion>) { setQuestions((rows) => rows.map((item) => item.id === id ? { ...item, ...patch } : item)); }

  async function persistQuestionOrder(rows: TemplateQuestion[]) {
    if (!supabase) return;
    const results = await Promise.all(rows.map((question, index) => supabase.from("form_template_questions").update({ order_index: index }).eq("id", question.id)));
    const failed = results.find((result) => result.error)?.error;
    if (failed) message(failed.message, true);
  }

  async function moveQuestion(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const ordered = [...questions].sort((a, b) => a.order_index - b.order_index);
    const from = ordered.findIndex((question) => question.id === sourceId);
    const to = ordered.findIndex((question) => question.id === targetId);
    if (from < 0 || to < 0) return;
    ordered.splice(to, 0, ordered.splice(from, 1)[0]);
    const next = ordered.map((question, index) => ({ ...question, order_index: index }));
    setQuestions(next);
    await persistQuestionOrder(next);
  }

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <header className="mb-6"><p className="text-sm font-semibold text-emerald-700">Quản trị CLB</p><h1 className="mt-1 text-3xl font-bold">Quản lý biểu mẫu</h1><p className="mt-2 text-sm text-zinc-600">Chỉnh sửa câu hỏi mặc định. Mỗi form mới sẽ nhận bản sao của mẫu mặc định. Nếu mẫu thiếu họ tên hoặc email, hệ thống tự thêm hai trường bắt buộc này vào form.</p></header>
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{notice && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-xl border bg-white p-4">
        {canWrite && <form onSubmit={createTemplate}><label className="text-sm font-semibold">Tạo mẫu mới<input name="name" required placeholder="Tên mẫu" className={input} /></label><button disabled={busy} className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">+ Tạo mẫu</button></form>}
        <div><h2 className="text-sm font-semibold">Các mẫu biểu mẫu</h2>{loading ? <p className="mt-3 text-sm text-zinc-500">Đang tải…</p> : templates.length ? <ul className="mt-2 space-y-1">{templates.map((item) => <li key={item.id}><button onClick={() => setSelectedId(item.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedId === item.id ? "bg-emerald-50 text-emerald-900" : "hover:bg-zinc-50"}`}><span className="block font-medium">{item.name}</span>{item.is_default && <span className="text-xs text-emerald-700">Mặc định</span>}</button></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">Chưa có mẫu biểu mẫu.</p>}</div>
      </aside>
      <div className="space-y-5">
        {selected ? <>
          <form key={selected.id} onSubmit={saveTemplate} className="rounded-xl border bg-white p-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Tên mẫu<input name="name" required defaultValue={selected.name} disabled={!canWrite} className={input} /></label><label className="text-sm font-medium">Mô tả<input name="description" defaultValue={selected.description ?? ""} disabled={!canWrite} className={input} /></label></div><div className="mt-3 flex flex-wrap gap-2">{canWrite && <button disabled={busy} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800">Lưu thông tin</button>}{canWrite && !selected.is_default && <button type="button" disabled={busy} onClick={() => void setDefault()} className="rounded-lg border px-3 py-2 text-sm">Đặt làm mặc định</button>}</div></form>
          <section className="rounded-xl border bg-white p-4"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Câu hỏi mặc định ({questions.length})</h2><p className="mt-1 text-xs text-zinc-500">Thay đổi tại đây chỉ áp dụng cho các form tạo về sau.</p></div>{canWrite && <button type="button" onClick={() => void addQuestion()} className="rounded-lg border px-3 py-2 text-sm font-semibold">+ Thêm câu hỏi</button>}</div>
            {!questions.length ? <p className="rounded-lg border border-dashed p-4 text-sm text-zinc-500">Mẫu chưa có câu hỏi.</p> : <ol className="space-y-3">{[...questions].sort((a, b) => a.order_index - b.order_index).map((question, index) => <li key={question.id} draggable={canWrite} onDragStart={() => setDraggedQuestionId(question.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedQuestionId) void moveQuestion(draggedQuestionId, question.id); setDraggedQuestionId(null); }} className="rounded-xl border bg-zinc-50 p-3">
              <div className="mb-2 flex items-center gap-2"><button type="button" title="Kéo để sắp xếp" aria-label={`Kéo để sắp xếp câu ${index + 1}`} className="cursor-grab text-zinc-400" disabled={!canWrite}>⠿</button><span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Sắp xếp câu {index + 1}</span><div className="ml-auto flex gap-1"><button type="button" disabled={!canWrite || index === 0} onClick={() => void moveQuestion(question.id, questions[index - 1]?.id)} className="rounded border px-2 py-1 text-xs disabled:opacity-40" aria-label="Chuyển lên">↑</button><button type="button" disabled={!canWrite || index === questions.length - 1} onClick={() => void moveQuestion(question.id, questions[index + 1]?.id)} className="rounded border px-2 py-1 text-xs disabled:opacity-40" aria-label="Chuyển xuống">↓</button></div></div>
              <QuestionFields question={question} index={index} canWrite={canWrite} onChange={(updated) => patchQuestion(question.id, updated)} onSave={() => void saveQuestion(question)} onDelete={() => void deleteQuestion(question)} />
            </li>)}</ol>}
          </section>
        </> : <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-zinc-500">Tạo hoặc chọn một mẫu để chỉnh sửa.</div>}
      </div>
    </div>
  </section>;
}
