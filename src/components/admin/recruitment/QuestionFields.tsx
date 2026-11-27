"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Icon } from "../ui/Icon";

export type QuestionType = "text" | "long_text" | "single_choice" | "multi_choice" | "number" | "date";
export type ApplicantFieldKey = "full_name" | "email" | "phone" | "student_code" | "class_name" | "facebook_url";
export type EditableQuestion = { id: string; question_text: string; question_type: QuestionType; field_key: ApplicantFieldKey | null; options: string[] | null; is_required: boolean; order_index: number };
import { OTHER_OPTION } from "./otherOption";
export { OTHER_OPTION };

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
const typeLabel = (type: QuestionType) => types.find((item) => item.value === type)?.label ?? type;

/** Phần sửa của một câu hỏi (hiện khi dòng câu hỏi được mở). Nút Xóa nằm ở cuối. */
export function QuestionFields({ question, index, canWrite, locked = false, hideFieldMapping = false, onChange, onDelete }: Props) {
  const disabled = !canWrite || locked;
  const isChoice = question.question_type === "single_choice" || question.question_type === "multi_choice";
  const options = question.options ?? [];
  const realOptionCount = options.filter((option) => option !== OTHER_OPTION).length;

  return <>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nội dung câu hỏi" className="sm:col-span-2"><input value={question.question_text} disabled={disabled} onChange={(event) => onChange({ ...question, question_text: event.target.value })} className={inputClass} /></Field>
      {!hideFieldMapping && <Field label="Lưu câu trả lời"><select value={question.field_key ?? ""} disabled={disabled} onChange={(event) => { const field_key = (event.target.value || null) as ApplicantFieldKey | null; onChange({ ...question, field_key }); }} className={inputClass}><option value="">Câu trả lời riêng</option><option value="full_name">Họ và tên → hồ sơ ứng viên</option><option value="email">Email → hồ sơ ứng viên</option><option value="phone">Số điện thoại → hồ sơ ứng viên</option><option value="student_code">Mã sinh viên → hồ sơ ứng viên</option><option value="class_name">Lớp → hồ sơ ứng viên</option><option value="facebook_url">Link Facebook → hồ sơ ứng viên</option></select></Field>}
      <Field label="Loại câu hỏi"><select value={question.question_type} disabled={disabled} onChange={(event) => { const question_type = event.target.value as QuestionType; onChange({ ...question, question_type, options: ["single_choice", "multi_choice"].includes(question_type) ? question.options?.length ? question.options : ["", ""] : null }); }} className={inputClass}>{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-zinc-800"><input type="checkbox" checked={question.is_required} disabled={disabled} onChange={(event) => onChange({ ...question, is_required: event.target.checked })} className="size-4 accent-emerald-700" />Bắt buộc trả lời</label>
      {isChoice && <div className="sm:col-span-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-zinc-800">Các lựa chọn</span>{!disabled && <div className="flex flex-wrap gap-2"><Button size="sm" icon="plus" onClick={() => onChange({ ...question, options: [...options, ""] })}>Thêm lựa chọn</Button>{!options.includes(OTHER_OPTION) && <Button size="sm" icon="plus" onClick={() => onChange({ ...question, options: [...options, OTHER_OPTION] })}>Mục khác</Button>}</div>}</div>
        <ul className="space-y-2">{options.map((option, optionIndex) => option === OTHER_OPTION
          ? <li key={option} className="flex items-center gap-2 text-sm"><span className="w-5 text-right text-xs tabular-nums text-zinc-500">{optionIndex + 1}</span><span className="font-medium text-zinc-800">Mục khác</span><span className="min-w-0 text-xs text-zinc-500">Cho phép nhập câu trả lời ngắn</span>{!disabled && <Button variant="danger" size="sm" className="ml-auto" onClick={() => onChange({ ...question, options: options.filter((item) => item !== OTHER_OPTION) })}>Xóa</Button>}</li>
          : <li key={optionIndex} className="flex items-center gap-2"><span className="w-5 text-right text-xs tabular-nums text-zinc-500">{optionIndex + 1}</span><input aria-label={`Lựa chọn ${optionIndex + 1}`} placeholder={`Nhập lựa chọn ${optionIndex + 1}`} value={option} disabled={disabled} onChange={(event) => onChange({ ...question, options: options.map((item, itemIndex) => itemIndex === optionIndex ? event.target.value : item) })} className={`${inputClass} min-w-0 flex-1`} />{!disabled && <Button variant="danger" size="sm" icon="close" aria-label={`Xóa lựa chọn ${optionIndex + 1}`} disabled={realOptionCount <= 2} onClick={() => onChange({ ...question, options: options.filter((_, itemIndex) => itemIndex !== optionIndex) })} />}</li>)}</ul>
        {options.filter((option) => option.trim() && option !== OTHER_OPTION).length < 2 && <p className="mt-2 text-xs text-zinc-500">Thêm ít nhất hai lựa chọn có nội dung.</p>}
      </div>}
    </div>
    {canWrite && !locked && <div className="mt-4 flex justify-end border-t border-zinc-100 pt-3"><Button variant="danger" icon="trash" aria-label={`Xóa câu hỏi số ${index + 1}`} onClick={onDelete}>Xóa câu hỏi</Button></div>}
  </>;
}

type ListProps = {
  /** Đã sắp theo thứ tự hiển thị. */
  questions: EditableQuestion[];
  canWrite: boolean;
  hideFieldMapping?: boolean;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  onPatch: (id: string, question: EditableQuestion) => void;
  onDelete: (id: string) => void;
  onMove: (sourceId: string, targetId: string) => void;
};

/** Danh sách câu hỏi thu gọn: bấm một dòng để mở sửa (Xóa chỉ nằm trong dòng đang mở), nút icon lên/xuống hoặc kéo thả để đổi thứ tự. */
export function QuestionList({ questions, canWrite, hideFieldMapping = false, openId, onOpenChange, onPatch, onDelete, onMove }: ListProps) {
  const [dragged, setDragged] = useState<string | null>(null);
  return <ol className="divide-y divide-zinc-100">{questions.map((question, index) => {
    const open = openId === question.id;
    const panelId = `question-${question.id}`;
    return <li key={question.id} draggable={canWrite && !open} onDragStart={() => setDragged(question.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged) onMove(dragged, question.id); setDragged(null); }} className={open ? "bg-zinc-50/70" : undefined}>
      <div className="flex items-center gap-1 px-2 py-1.5 sm:px-3">
        {canWrite && <span aria-hidden="true" title="Kéo để sắp xếp" className={`hidden shrink-0 text-zinc-400 sm:block ${open ? "opacity-30" : "cursor-grab"}`}><Icon name="grip" /></span>}
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => onOpenChange(open ? null : question.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600">
          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-zinc-500">{index + 1}</span>
          <span className={`min-w-0 flex-1 truncate text-sm font-medium ${question.question_text.trim() ? "text-zinc-900" : "text-zinc-500"}`}>{question.question_text.trim() || "Chưa có nội dung"}</span>
          <span className="hidden shrink-0 text-xs text-zinc-500 sm:inline">{typeLabel(question.question_type)}</span>
          {question.is_required && <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-800">Bắt buộc</span>}
          <Icon name="chevron-down" className={`shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {canWrite && <>
          <Button variant="ghost" size="sm" icon="arrow-up" aria-label={`Chuyển câu ${index + 1} lên`} disabled={index === 0} onClick={() => onMove(question.id, questions[index - 1].id)} />
          <Button variant="ghost" size="sm" icon="arrow-down" aria-label={`Chuyển câu ${index + 1} xuống`} disabled={index === questions.length - 1} onClick={() => onMove(question.id, questions[index + 1].id)} />
        </>}
      </div>
      {open && <div id={panelId} className="border-t border-zinc-100 px-4 py-4 sm:px-5">
        <QuestionFields question={question} index={index} canWrite={canWrite} hideFieldMapping={hideFieldMapping} onChange={(updated) => onPatch(question.id, updated)} onDelete={() => onDelete(question.id)} />
      </div>}
    </li>;
  })}</ol>;
}
