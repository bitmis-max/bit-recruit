"use client";


export type SendControlsProps = {
  subject: string;
  onSubjectChange: (value: string) => void;
  canSendBulk: boolean;
  progress: number;
  sending: boolean;
  errorMessage?: string | null;
  onSendBulk: () => void;
};

export function SendControls({
  subject,
  onSubjectChange,
  canSendBulk,
  progress,
  sending,
  errorMessage,
  onSendBulk,
}: SendControlsProps) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Gửi email
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Thiết lập tiêu đề và gửi thử.
        </p>
      </div>
      <label className="flex flex-col gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
        Tiêu đề email
        <input
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          value={subject}
          onChange={(event) => onSubjectChange(event.target.value)}
          placeholder="Ví dụ: Thư mời tham dự sự kiện"
        />
      </label>
      <button
        type="button"
        className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onSendBulk}
        disabled={sending || !canSendBulk}
      >
        Gửi hàng loạt
      </button>
      {errorMessage ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {errorMessage}
        </p>
      ) : null}
      <div className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center justify-between">
          <span>Tiến độ</span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    </section>
  );
}
