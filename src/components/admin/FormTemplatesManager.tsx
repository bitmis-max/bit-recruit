"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";
import { friendlyError } from "../../lib/ui/friendly-error";
import { useCurrentAdminClub } from "./AdminClubContext";
import { Button } from "./ui/Button";
import { CreatePanel } from "./ui/CreatePanel";
import { EmptyState } from "./ui/EmptyState";
import { Field, inputClass } from "./ui/Field";
import { Notice } from "./ui/Notice";
import { PageHeader } from "./ui/PageHeader";
import { Panel } from "./ui/Panel";
import { QuestionList, type EditableQuestion } from "./recruitment/QuestionFields";

type Template = { id: string; name: string; description: string | null; is_default: boolean };
type TemplateQuestion = EditableQuestion & { template_id: string };

export function FormTemplatesManager() {
  const supabase = getSupabaseClient();
  const { role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [questions, setQuestions] = useState<TemplateQuestion[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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
    if (queryError) { message(friendlyError(queryError, "Không tải được mẫu biểu mẫu."), true); setLoading(false); return; }
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
      if (queryError) message(friendlyError(queryError, "Không tải được câu hỏi của mẫu."), true); else setQuestions((data ?? []) as TemplateQuestion[]);
    }
    void loadQuestions();
    return () => { cancelled = true; };
  }, [supabase, selectedId, message]);

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !canWrite) return;
    const values = new FormData(event.currentTarget); const name = String(values.get("name") ?? "").trim();
    if (!name) return;
    setBusy(true);
    const { data, error: insertError } = await supabase.from("form_templates").insert({ name, is_default: templates.length === 0 }).select("id,name,description,is_default").single();
    setBusy(false);
    if (insertError) message(friendlyError(insertError, "Không tạo được mẫu biểu mẫu."), true); else { setTemplates((rows) => [...rows, data as Template]); setSelectedId(data.id); setCreating(false); message("Đã tạo mẫu biểu mẫu."); }
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !selected || !canWrite) return;
    const values = new FormData(event.currentTarget); const payload = { name: String(values.get("name") ?? "").trim(), description: String(values.get("description") ?? "").trim() || null };
    if (!payload.name) return;
    setBusy(true); const { error: updateError } = await supabase.from("form_templates").update(payload).eq("id", selected.id); setBusy(false);
    if (updateError) message(friendlyError(updateError, "Không lưu được thông tin mẫu."), true); else { setTemplates((rows) => rows.map((item) => item.id === selected.id ? { ...item, ...payload } : item)); message("Đã lưu thông tin mẫu."); }
  }

  async function setDefault() {
    if (!supabase || !selected || !canWrite || selected.is_default) return;
    setBusy(true);
    const clear = await supabase.from("form_templates").update({ is_default: false }).eq("is_default", true);
    const set = clear.error ? null : await supabase.from("form_templates").update({ is_default: true }).eq("id", selected.id);
    setBusy(false);
    if (clear.error || set?.error) message(friendlyError(clear.error ?? set?.error, "Không đổi được mẫu mặc định."), true);
    else { setTemplates((rows) => rows.map((item) => ({ ...item, is_default: item.id === selected.id }))); message("Đã đặt làm mẫu mặc định."); }
  }

  async function addQuestion() {
    if (!supabase || !selected || !canWrite) return;
    const { data, error: insertError } = await supabase.from("form_template_questions").insert({ template_id: selected.id, question_text: "Câu hỏi mới", question_type: "text", field_key: null, is_required: false, order_index: questions.length }).select("id,template_id,question_text,question_type,field_key,options,is_required,order_index").single();
    if (insertError) message(friendlyError(insertError, "Không thêm được câu hỏi."), true); else { setQuestions((rows) => [...rows, data as TemplateQuestion]); setOpenId(data.id); }
  }

  async function saveQuestions() {
    if (!supabase || !selected || !canWrite) return;
    const rows = [...questions].sort((a, b) => a.order_index - b.order_index);
    const payload = rows.map((question, index) => {
      const isChoice = question.question_type === "single_choice" || question.question_type === "multi_choice";
      const options = isChoice ? (question.options ?? []).map((option) => option.trim()).filter(Boolean) : null;
      return { question, index, options, isChoice };
    });
    if (payload.some(({ question, options, isChoice }) => !question.question_text.trim() || (isChoice && (options?.length ?? 0) < 2))) {
      message("Mỗi câu hỏi cần có nội dung; câu hỏi lựa chọn cần ít nhất hai lựa chọn.", true);
      return;
    }
    setBusy(true);
    const results = await Promise.all(payload.map(({ question, index, options }) => supabase.from("form_template_questions").update({
      question_text: question.question_text.trim(),
      question_type: question.question_type,
      field_key: question.field_key,
      options,
      is_required: question.is_required,
      order_index: index,
    }).eq("id", question.id)));
    const failed = results.find((result) => result.error)?.error;
    setBusy(false);
    if (failed) message(friendlyError(failed, "Không lưu được các câu hỏi."), true);
    else {
      setQuestions(payload.map(({ question, index, options }) => ({ ...question, question_text: question.question_text.trim(), options, order_index: index })));
      message("Đã lưu các câu hỏi và thứ tự.");
    }
  }

  async function deleteQuestion(question: TemplateQuestion) {
    if (!supabase || !canWrite || !confirm("Xóa câu hỏi khỏi mẫu? Các biểu mẫu đã tạo từ mẫu không bị ảnh hưởng.")) return;
    const { error: deleteError } = await supabase.from("form_template_questions").delete().eq("id", question.id);
    if (deleteError) message(friendlyError(deleteError, "Không xóa được câu hỏi."), true); else { setQuestions((rows) => rows.filter((item) => item.id !== question.id).map((item, index) => ({ ...item, order_index: index }))); setOpenId(null); message("Đã xóa câu hỏi khỏi mẫu."); }
  }

  function patchQuestion(id: string, patch: Partial<TemplateQuestion>) { setQuestions((rows) => rows.map((item) => item.id === id ? { ...item, ...patch } : item)); }

  async function moveQuestion(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const ordered = [...questions].sort((a, b) => a.order_index - b.order_index);
    const from = ordered.findIndex((question) => question.id === sourceId);
    const to = ordered.findIndex((question) => question.id === targetId);
    if (from < 0 || to < 0) return;
    ordered.splice(to, 0, ordered.splice(from, 1)[0]);
    const next = ordered.map((question, index) => ({ ...question, order_index: index }));
    setQuestions(next);
  }

  const sortedQuestions = [...questions].sort((a, b) => a.order_index - b.order_index);

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <PageHeader title="Biểu mẫu" description="Chỉnh sửa câu hỏi mặc định. Mỗi form mới sẽ nhận bản sao của mẫu mặc định. Nếu mẫu thiếu họ tên hoặc email, hệ thống tự thêm hai trường bắt buộc này vào form." actions={canWrite && <Button variant="primary" icon="plus" onClick={() => setCreating(true)} aria-expanded={creating}>Mẫu mới</Button>} />
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    <CreatePanel open={creating} title="Tạo mẫu mới" onClose={() => setCreating(false)}>
      <form onSubmit={createTemplate} className="space-y-4">
        <Field label="Tên mẫu"><input name="name" required placeholder="Tên mẫu" className={inputClass} data-autofocus /></Field>
        <div className="flex gap-2"><Button type="submit" variant="primary" loading={busy}>{busy ? "Đang tạo…" : "Tạo mẫu"}</Button><Button onClick={() => setCreating(false)}>Hủy</Button></div>
      </form>
    </CreatePanel>
    {loading ? <div role="status" aria-label="Đang tải mẫu biểu mẫu" className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]"><div className="h-48 animate-pulse rounded-xl bg-zinc-100" /><div className="h-72 animate-pulse rounded-xl bg-zinc-100" /></div>
    : !templates.length ? <Panel padded={false}><EmptyState title="Chưa có mẫu biểu mẫu" description={canWrite ? "Tạo mẫu đầu tiên để dùng cho các vị trí tuyển." : undefined} action={canWrite && !creating && <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Mẫu mới</Button>} /></Panel>
    : <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
      <Panel title="Các mẫu biểu mẫu" padded={false}>
        <ul className="space-y-0.5 p-2">{templates.map((item) => <li key={item.id}><button type="button" aria-current={selectedId === item.id ? "true" : undefined} onClick={() => { setSelectedId(item.id); setOpenId(null); }} className={`w-full rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600 ${selectedId === item.id ? "bg-emerald-50 text-emerald-900" : "text-zinc-700 hover:bg-zinc-100"}`}><span className="block font-medium">{item.name}</span>{item.is_default && <span className="text-xs text-emerald-700">Mặc định</span>}</button></li>)}</ul>
      </Panel>
      {selected ? <div className="space-y-5">
        <Panel title="Thông tin mẫu">
          <form key={selected.id} onSubmit={saveTemplate} className="grid gap-4 sm:grid-cols-2">
            <Field label="Tên mẫu"><input name="name" required defaultValue={selected.name} disabled={!canWrite} className={inputClass} /></Field>
            <Field label="Mô tả"><input name="description" defaultValue={selected.description ?? ""} disabled={!canWrite} className={inputClass} /></Field>
            {canWrite && <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" variant="primary" loading={busy}>Lưu thông tin</Button>{!selected.is_default && <Button disabled={busy} onClick={() => void setDefault()}>Đặt làm mặc định</Button>}</div>}
          </form>
        </Panel>
        <Panel title={`Câu hỏi mặc định (${questions.length})`} padded={false} actions={canWrite && <Button size="sm" icon="plus" onClick={() => void addQuestion()}>Thêm câu hỏi</Button>}>
          <p className="border-b border-zinc-100 px-4 py-2.5 text-xs text-zinc-500 sm:px-5">Thay đổi tại đây chỉ áp dụng cho các form tạo về sau. Bấm một câu để sửa.</p>
          {!questions.length
            ? <p className="px-4 py-8 text-center text-sm text-zinc-500">Mẫu chưa có câu hỏi.{canWrite ? " Bấm “Thêm câu hỏi” để bắt đầu." : ""}</p>
            : <QuestionList questions={sortedQuestions} canWrite={canWrite} openId={openId} onOpenChange={setOpenId} onPatch={patchQuestion} onDelete={(id) => { const target = questions.find((item) => item.id === id); if (target) void deleteQuestion(target); }} onMove={(source, target) => void moveQuestion(source, target)} />}
          {canWrite && <div className="flex justify-end border-t border-zinc-100 px-4 py-3 sm:px-5"><Button variant="primary" loading={busy} onClick={() => void saveQuestions()}>{busy ? "Đang lưu câu hỏi…" : "Lưu các câu hỏi"}</Button></div>}
        </Panel>
      </div> : <Panel padded={false}><EmptyState title="Chọn một mẫu để chỉnh sửa" /></Panel>}
    </div>}
  </section>;
}
