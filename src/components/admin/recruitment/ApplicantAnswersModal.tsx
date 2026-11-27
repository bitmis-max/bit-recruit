"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { useDialogFocus } from "./useDialogFocus";

export type ApplicantAnswerDisplay = {
  question_text: string;
  answer_text: string | null;
  answer_json: unknown;
};

function formatAnswer(answer: ApplicantAnswerDisplay) {
  if (answer.answer_text !== null && answer.answer_text !== "") return answer.answer_text;
  if (answer.answer_json == null) return "—";
  return typeof answer.answer_json === "string" ? answer.answer_json : JSON.stringify(answer.answer_json);
}

export function ApplicantAnswersModal({ applicantName, answers }: { applicantName: string; answers: ApplicantAnswerDisplay[] }) {
  const [open, setOpen] = useState(false);

  const dialogRef = useDialogFocus<HTMLElement>(open, () => setOpen(false));

  return <>
    <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Xem câu trả lời</Button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="applicant-answers-title" className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl outline-none">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div className="min-w-0"><h2 id="applicant-answers-title" className="text-base font-semibold text-zinc-900">Câu trả lời ứng tuyển</h2><p className="mt-0.5 break-words text-sm text-zinc-600">{applicantName}</p></div>
          <Button variant="ghost" size="sm" icon="close" autoFocus aria-label="Đóng cửa sổ" onClick={() => setOpen(false)} />
        </header>
        <div className="flex-1 overflow-y-auto px-5">
          {answers.length ? <ul className="divide-y divide-zinc-100">{answers.map((answer, index) => <li key={`${answer.question_text}-${index}`} className="py-4">
            <h3 className="text-sm font-semibold text-zinc-900">{answer.question_text || "Câu hỏi"}</h3>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">{formatAnswer(answer)}</p>
          </li>)}</ul> : <p className="py-8 text-center text-sm text-zinc-600">Chưa có câu trả lời cho đơn này.</p>}
        </div>
      </section>
    </div>}
  </>;
}
