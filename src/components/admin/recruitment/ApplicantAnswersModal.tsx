"use client";

import { useState } from "react";
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
    <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">Xem câu trả lời</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="applicant-answers-title" className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl outline-none">
        <header className="flex items-start justify-between gap-4 border-b bg-zinc-50 px-5 py-4">
          <div><h2 id="applicant-answers-title" className="font-semibold">Câu trả lời ứng tuyển</h2><p className="mt-1 text-sm text-zinc-600">{applicantName}</p></div>
          <button type="button" autoFocus onClick={() => setOpen(false)} aria-label="Đóng cửa sổ" className="rounded-md px-2 py-1 text-xl leading-none text-zinc-500 hover:bg-zinc-200">×</button>
        </header>
        <div className="max-h-[calc(85vh-76px)] space-y-3 overflow-y-auto p-5">
          {answers.length ? answers.map((answer, index) => <article key={`${answer.question_text}-${index}`} className="overflow-hidden rounded-lg border border-zinc-200">
            <h3 className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950">{answer.question_text || "Câu hỏi"}</h3>
            <p className="whitespace-pre-wrap break-words px-4 py-3 text-sm leading-6 text-zinc-800">{formatAnswer(answer)}</p>
          </article>) : <p className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">Chưa có câu trả lời cho đơn này.</p>}
        </div>
      </section>
    </div>}
  </>;
}
