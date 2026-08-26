"use client";

export type SendControlsProps = {
  canSendBulk: boolean;
  progress: number;
  sending: boolean;
  errorMessage?: string | null;
  onSendBulk: () => void;
  onSendSelf: () => void;
};

export function SendControls({
  canSendBulk,
  progress,
  sending,
  errorMessage,
  onSendBulk,
  onSendSelf,
}: SendControlsProps) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Gửi email
        </h3>
      </div>
      
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200"
          onClick={onSendSelf}
          disabled={sending}
        >
          Gửi thử cho bản thân
        </button>
        <button
          type="button"
          className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onSendBulk}
          disabled={sending || !canSendBulk}
        >
          {sending ? "Đang gửi..." : "Gửi hàng loạt"}
        </button>
      </div>

      {errorMessage ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
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
