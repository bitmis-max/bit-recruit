"use client";

export type QuestionType = "text" | "long_text" | "single_choice" | "multi_choice" | "number" | "date";
export type EditableQuestion = { id: string; question_text: string; question_type: QuestionType; options: string[] | null; is_required: boolean; order_index: number };

type Props = {
  question: EditableQuestion;
  index: number;
  canWrite: boolean;
  locked?: boolean;
  lockNote?: string;
  onChange: (question: EditableQuestion) => void;
  onSave: () => void;
  onDelete: () => void;
};

const types: { value: QuestionType; label: string }[] = [
  { value: "text", label: "Trả lời ngắn" }, { value: "long_text", label: "Trả lời dài" },
  { value: "single_choice", label: "Chọn một" }, { value: "multi_choice", label: "Chọn nhiều" },
  { value: "number", label: "Số" }, { value: "date", label: "Ngày" },
];

export function QuestionFields({ question, index, canWrite, locked = false, lockNote, onChange, onSave, onDelete }: Props) {
  const disabled = !canWrite || locked;
  const isChoice = question.question_type === "single_choice" || question.question_type === "multi_choice";
  const fieldClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100";

  return <>
    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Câu {index + 1}</div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium sm:col-span-2">Nội dung câu hỏi<input value={question.question_text} disabled={disabled} onChange={(event) => onChange({ ...question, question_text: event.target.value })} className={fieldClass} /></label>
      <label className="text-sm font-medium">Loại câu hỏi<select value={question.question_type} disabled={disabled} onChange={(event) => { const question_type = event.target.value as QuestionType; onChange({ ...question, question_type, options: ["single_choice", "multi_choice"].includes(question_type) ? question.options?.length ? question.options : ["", ""] : null }); }} className={fieldClass}>{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={question.is_required} disabled={disabled} onChange={(event) => onChange({ ...question, is_required: event.target.checked })} />Bắt buộc trả lời{lockNote && <span className="text-xs text-zinc-500">({lockNote})</span>}</label>
      {isChoice && <label className="text-sm font-medium sm:col-span-2">Các lựa chọn (mỗi lựa chọn một dòng)<textarea rows={3} value={(question.options ?? []).join("\n")} disabled={disabled} onChange={(event) => onChange({ ...question, options: event.target.value.split("\n") })} className={fieldClass} />{(question.options ?? []).filter((option) => option.trim()).length < 2 && <span className="mt-1 block text-xs font-normal text-zinc-500">Thêm ít nhất hai lựa chọn có nội dung.</span>}</label>}
    </div>
    {canWrite && !locked && <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={onDelete} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100">Xóa câu hỏi</button><button type="button" onClick={onSave} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800">Lưu câu hỏi</button></div>}
  </>;
}
