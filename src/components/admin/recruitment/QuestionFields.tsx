"use client";

export type QuestionType = "text" | "long_text" | "single_choice" | "multi_choice" | "number" | "date";
export type ApplicantFieldKey = "full_name" | "email" | "phone" | "student_code" | "class_name";
export type EditableQuestion = { id: string; question_text: string; question_type: QuestionType; field_key: ApplicantFieldKey | null; options: string[] | null; is_required: boolean; order_index: number };
export const OTHER_OPTION = "__other__";

type Props = {
  question: EditableQuestion;
  index: number;
  canWrite: boolean;
  locked?: boolean;
  hideFieldMapping?: boolean;
  onChange: (question: EditableQuestion) => void;
  onDelete: () => void;
};

const types: { value: QuestionType; label: string }[] = [
  { value: "text", label: "Trả lời ngắn" }, { value: "long_text", label: "Trả lời dài" },
  { value: "single_choice", label: "Chọn một" }, { value: "multi_choice", label: "Chọn nhiều" },
  { value: "number", label: "Số" }, { value: "date", label: "Ngày" },
];

export function QuestionFields({ question, index, canWrite, locked = false, hideFieldMapping = false, onChange, onDelete }: Props) {
  const disabled = !canWrite || locked;
  const isChoice = question.question_type === "single_choice" || question.question_type === "multi_choice";
  const fieldClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100";

  return <>
    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Câu {index + 1}</div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium sm:col-span-2">Nội dung câu hỏi<input value={question.question_text} disabled={disabled} onChange={(event) => onChange({ ...question, question_text: event.target.value })} className={fieldClass} /></label>
      {!hideFieldMapping && <label className="text-sm font-medium">Lưu câu trả lời<select value={question.field_key ?? ""} disabled={disabled} onChange={(event) => { const field_key = (event.target.value || null) as ApplicantFieldKey | null; onChange({ ...question, field_key }); }} className={fieldClass}><option value="">Câu trả lời riêng</option><option value="full_name">Họ và tên → hồ sơ ứng viên</option><option value="email">Email → hồ sơ ứng viên</option><option value="phone">Số điện thoại → hồ sơ ứng viên</option><option value="student_code">Mã sinh viên → hồ sơ ứng viên</option><option value="class_name">Lớp → hồ sơ ứng viên</option></select></label>}
      <label className="text-sm font-medium">Loại câu hỏi<select value={question.question_type} disabled={disabled} onChange={(event) => { const question_type = event.target.value as QuestionType; onChange({ ...question, question_type, options: ["single_choice", "multi_choice"].includes(question_type) ? question.options?.length ? question.options : ["", ""] : null }); }} className={fieldClass}>{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={question.is_required} disabled={disabled} onChange={(event) => onChange({ ...question, is_required: event.target.checked })} />Bắt buộc trả lời</label>
      {isChoice && <div className="sm:col-span-2"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-sm font-medium">Các lựa chọn</span>{!disabled && <div className="flex gap-2"><button type="button" onClick={() => onChange({ ...question, options: [...(question.options ?? []), ""] })} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-medium">+ Thêm lựa chọn</button>{!(question.options ?? []).includes(OTHER_OPTION) && <button type="button" onClick={() => onChange({ ...question, options: [...(question.options ?? []), OTHER_OPTION] })} className="rounded-lg border px-3 py-1.5 text-sm">+ Mục khác</button>}</div>}</div><div className="space-y-2">{(question.options ?? []).map((option, optionIndex) => option === OTHER_OPTION ? <div key={option} className="flex items-center gap-2 rounded-lg border border-dashed bg-zinc-50 p-3"><span className="text-sm font-medium">Mục khác</span><span className="text-xs text-zinc-500">Cho phép nhập câu trả lời ngắn</span>{!disabled && <button type="button" onClick={() => onChange({ ...question, options: (question.options ?? []).filter((item) => item !== OTHER_OPTION) })} className="ml-auto text-sm text-rose-700">Xóa</button>}</div> : <div key={optionIndex} className="flex items-center gap-2 rounded-lg border bg-white p-2"><span className="text-xs text-zinc-500">{optionIndex + 1}</span><input aria-label={`Lựa chọn ${optionIndex + 1}`} placeholder={`Nhập lựa chọn ${optionIndex + 1}`} value={option} disabled={disabled} onChange={(event) => onChange({ ...question, options: (question.options ?? []).map((item, index) => index === optionIndex ? event.target.value : item) })} className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm" />{!disabled && <button type="button" aria-label={`Xóa lựa chọn ${optionIndex + 1}`} disabled={(question.options ?? []).filter((item) => item !== OTHER_OPTION).length <= 2} onClick={() => onChange({ ...question, options: (question.options ?? []).filter((_, index) => index !== optionIndex) })} className="px-2 text-lg text-rose-700 disabled:opacity-30">×</button>}</div>)}</div>{(question.options ?? []).filter((option) => option.trim() && option !== OTHER_OPTION).length < 2 && <span className="mt-1 block text-xs text-zinc-500">Thêm ít nhất hai lựa chọn có nội dung.</span>}</div>}
    </div>
    {canWrite && !locked && <div className="mt-3 flex justify-end"><button type="button" onClick={onDelete} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100">Xóa câu hỏi</button></div>}
  </>;
}
