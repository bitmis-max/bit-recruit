"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";

type TaskInfo = { id: string; title: string; description: string | null; due_at: string; status: "open" | "closed" };
type Assignment = { task_id: string; status: "pending" | "done" | "missed"; completed_at: string | null; note: string | null; tasks: TaskInfo | TaskInfo[] | null };
type Item = Omit<Assignment, "tasks"> & { task: TaskInfo };
type Loaded = { key: string; items: Item[]; loadedAt: number; error: string };

const HOUR = 3_600_000;
const formatDateTime = (value: string) => new Date(value).toLocaleString("vi-VN");

function dueLabel(dueAt: string, now: number) {
  const diff = Date.parse(dueAt) - now;
  if (diff < 0) return { text: "Quá hạn", late: true };
  if (diff < 24 * HOUR) return { text: `Còn ${Math.max(1, Math.ceil(diff / HOUR))} giờ`, late: false };
  return { text: `Còn ${Math.floor(diff / (24 * HOUR))} ngày`, late: false };
}

export function MyTasks({ memberId }: { memberId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<Loaded | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const key = `${memberId}|${reloadKey}`;

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    (async () => {
      const { data, error: loadError } = await supabase.from("task_assignees")
        .select("task_id,status,completed_at,note,tasks(id,title,description,due_at,status)").eq("member_id", memberId);
      if (!active) return;
      const items = ((data ?? []) as unknown as Assignment[]).flatMap((row) => {
        const task = Array.isArray(row.tasks) ? row.tasks[0] : row.tasks;
        return task ? [{ task_id: row.task_id, status: row.status, completed_at: row.completed_at, note: row.note, task }] : [];
      });
      setResult({ key: `${memberId}|${reloadKey}`, items, loadedAt: Date.now(), error: loadError ? "Không tải được việc của bạn. Vui lòng thử lại." : "" });
    })();
    return () => { active = false; };
  }, [supabase, memberId, reloadKey]);

  const loaded = result?.key === key ? result : null;
  const groups = useMemo(() => {
    const items = loaded?.items ?? [];
    const byDue = (a: Item, b: Item) => a.task.due_at.localeCompare(b.task.due_at);
    return {
      pending: items.filter((item) => item.status === "pending" && item.task.status === "open").sort(byDue),
      missed: items.filter((item) => item.status === "missed").sort(byDue),
      done: items.filter((item) => item.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")),
      closed: items.filter((item) => item.status === "pending" && item.task.status === "closed").sort(byDue),
    };
  }, [loaded]);

  async function setDone(item: Item, done: boolean) {
    if (!supabase) return;
    setBusyId(item.task_id); setError(""); setNotice("");
    const { error: rpcError } = await supabase.rpc("set_my_task_done", { p_task_id: item.task_id, p_done: done });
    setBusyId("");
    if (rpcError) { setError(rpcError.message); return; }
    setNotice(done ? "Đã đánh dấu xong." : "Đã bỏ đánh dấu.");
    setReloadKey((value) => value + 1);
  }

  function renderItem(item: Item, withAction: boolean) {
    const due = dueLabel(item.task.due_at, loaded?.loadedAt ?? 0);
    const busy = busyId === item.task_id;
    return <li key={item.task_id} className="rounded-xl border border-zinc-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 break-words font-semibold text-zinc-900">{item.task.title}</p>
        {item.status === "pending" && item.task.status === "open" && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${due.late ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}>{due.text}</span>}
      </div>
      {item.task.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-600">{item.task.description}</p>}
      <p className="mt-2 text-xs text-zinc-500">Hạn {formatDateTime(item.task.due_at)}{item.status === "done" && item.completed_at ? ` · Xong lúc ${formatDateTime(item.completed_at)}` : ""}</p>
      {item.note && <p className="mt-2 break-words rounded-lg bg-[#f7f8f6] px-3 py-2 text-xs text-zinc-700">Ghi chú của Ban chủ chốt: {item.note}</p>}
      {item.status === "missed" && <p className="mt-2 text-xs text-rose-700">Việc này bị đánh dấu chưa hoàn thành. Hãy liên hệ Ban chủ chốt nếu có nhầm lẫn.</p>}
      {withAction && item.task.status === "open" && item.status !== "missed" && <button type="button" disabled={busy} onClick={() => void setDone(item, item.status === "pending")} className={`mt-3 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${item.status === "pending" ? "bg-emerald-700 text-white" : "border border-zinc-300 text-zinc-700"}`}>{busy ? "Đang lưu…" : item.status === "pending" ? "Đánh dấu đã xong" : "Bỏ đánh dấu"}</button>}
    </li>;
  }

  const total = loaded ? groups.pending.length + groups.missed.length + groups.done.length + groups.closed.length : 0;
  const folded = [
    { label: "Đã xong", items: groups.done, action: true },
    { label: "Việc đã đóng, chưa đánh dấu", items: groups.closed, action: false },
  ];

  return <section aria-labelledby={`my-tasks-${memberId}`} className="mt-8 border-t border-zinc-100 pt-6">
    <h3 id={`my-tasks-${memberId}`} className="font-semibold text-zinc-900">Việc của tôi</h3>
    {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!supabase ? <p role="alert" className="mt-3 text-sm text-amber-900">Hệ thống chưa được cấu hình Supabase.</p>
      : !loaded ? <p role="status" className="mt-3 text-sm text-zinc-500">Đang tải việc…</p>
      : loaded.error ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{loaded.error}</p>
      : !total ? <p className="mt-3 text-sm text-zinc-500">Chưa có việc nào.</p>
      : <div className="mt-3 space-y-4">
        <div><h4 className="text-sm font-medium text-zinc-700">Đang chờ ({groups.pending.length})</h4>{groups.pending.length ? <ul className="mt-2 space-y-3">{groups.pending.map((item) => renderItem(item, true))}</ul> : <p className="mt-2 text-sm text-zinc-500">Bạn không còn việc nào đang chờ.</p>}</div>
        {groups.missed.length > 0 && <div><h4 className="text-sm font-medium text-rose-800">Chưa hoàn thành ({groups.missed.length})</h4><ul className="mt-2 space-y-3">{groups.missed.map((item) => renderItem(item, false))}</ul></div>}
        {folded.filter((group) => group.items.length).map((group) => <details key={group.label}><summary className="cursor-pointer text-sm font-medium text-zinc-700">{group.label} ({group.items.length})</summary><ul className="mt-2 space-y-3">{group.items.map((item) => renderItem(item, group.action))}</ul></details>)}
      </div>}
  </section>;
}
