"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { useCurrentAdminClub } from "../AdminClubContext";

type AssigneeStatus = "pending" | "done" | "missed";
type Assignee = { member_id: string; status: AssigneeStatus; note: string | null; completed_at: string | null };
type Task = { id: string; title: string; description: string | null; due_at: string; status: "open" | "closed"; task_assignees: Assignee[] };
type Member = { id: string; full_name: string; team_id: string | null; is_active: boolean };
type Team = { id: string; name: string };
type LoadedData = { clubId: string; tasks: Task[]; members: Member[]; teams: Team[]; loadedAt: number; error: string };
type Sender = { clubId: string; configured: boolean; isMe: boolean; senderName: string | null; error: string };
type Draft = { status: AssigneeStatus; note: string };

const statusLabel: Record<AssigneeStatus, string> = { pending: "Chờ", done: "Xong", missed: "Chưa hoàn thành" };
const statusClass: Record<AssigneeStatus, string> = { pending: "bg-amber-50 text-amber-800", done: "bg-emerald-50 text-emerald-800", missed: "bg-rose-50 text-rose-800" };
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100";
const emptyForm = { title: "", description: "", due: "", teamId: "" };

async function callApi<T>(url: string, init?: RequestInit): Promise<{ data?: T; error?: string }> {
  try {
    const response = await fetch(url, init);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) return { error: result.error ?? "Yêu cầu không thành công." };
    return { data: result.data as T };
  } catch {
    return { error: "Không kết nối được máy chủ." };
  }
}

const formatDateTime = (value: string) => new Date(value).toLocaleString("vi-VN");

export function TasksManager() {
  const supabase = getSupabaseClient();
  const { id: clubId, role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const [data, setData] = useState<LoadedData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sender, setSender] = useState<Sender | null>(null);
  const [senderKey, setSenderKey] = useState(0);
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState("");
  const [confirmTask, setConfirmTask] = useState<Task | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!supabase || !clubId || !canWrite) return;
    let active = true;
    (async () => {
      const [taskResult, memberResult, teamResult] = await Promise.all([
        supabase.from("tasks").select("id,title,description,due_at,status,task_assignees(member_id,status,note,completed_at)").eq("club_id", clubId).order("due_at", { ascending: true }),
        supabase.from("club_members").select("id,full_name,team_id,is_active").eq("club_id", clubId).order("full_name"),
        supabase.from("teams").select("id,name").eq("club_id", clubId).order("name"),
      ]);
      if (!active) return;
      const failure = taskResult.error ?? memberResult.error ?? teamResult.error;
      setData({
        clubId, loadedAt: Date.now(), error: failure?.message ?? "",
        tasks: (taskResult.data ?? []) as unknown as Task[], members: (memberResult.data ?? []) as Member[], teams: (teamResult.data ?? []) as Team[],
      });
    })();
    return () => { active = false; };
  }, [supabase, clubId, canWrite, reloadKey]);

  useEffect(() => {
    if (!clubId || !canWrite) return;
    let active = true;
    (async () => {
      const result = await callApi<{ configured: boolean; isMe: boolean; senderName: string | null }>(`/api/admin/mail-sender?clubId=${encodeURIComponent(clubId)}`);
      if (!active) return;
      setSender({ clubId, configured: result.data?.configured ?? false, isMe: result.data?.isMe ?? false, senderName: result.data?.senderName ?? null, error: result.error ?? "" });
    })();
    return () => { active = false; };
  }, [clubId, canWrite, senderKey]);

  useEffect(() => { if (confirmTask) cancelRef.current?.focus(); }, [confirmTask]);

  const loaded = data && data.clubId === clubId ? data : null;
  const senderState = sender && sender.clubId === clubId ? sender : null;
  const tasks = useMemo(() => loaded?.tasks ?? [], [loaded]);
  const members = useMemo(() => loaded?.members ?? [], [loaded]);
  const teams = useMemo(() => loaded?.teams ?? [], [loaded]);
  const loadedAt = loaded?.loadedAt ?? 0;
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const openCount = tasks.filter((task) => task.status === "open").length;
  const closedCount = tasks.length - openCount;
  const visible = useMemo(() => tasks.filter((task) => task.status === filter).sort((a, b) => filter === "open" ? a.due_at.localeCompare(b.due_at) : b.due_at.localeCompare(a.due_at)), [tasks, filter]);
  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  const activeMembers = members.filter((member) => member.is_active);
  const query = memberQuery.trim().toLowerCase();
  const shownMembers = query ? activeMembers.filter((member) => member.full_name.toLowerCase().includes(query)) : activeMembers;
  const isOverdue = (task: Task) => task.status === "open" && Date.parse(task.due_at) < loadedAt;
  const reload = () => setReloadKey((key) => key + 1);
  const resetMessages = () => { setError(""); setNotice(""); };

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !canWrite) return;
    const due = new Date(form.due);
    if (Number.isNaN(due.getTime())) { setError("Hãy chọn hạn chót hợp lệ."); return; }
    if (!memberIds.length && !form.teamId) { setError("Hãy chọn ít nhất một người nhận hoặc một ban."); return; }
    setBusy("create"); resetMessages();
    const { data: newId, error: rpcError } = await supabase.rpc("create_task", {
      p_club_id: clubId, p_title: form.title.trim(), p_description: form.description.trim() || null,
      p_due_at: due.toISOString(), p_member_ids: memberIds, p_team_id: form.teamId || null,
    });
    setBusy("");
    if (rpcError) { setError(rpcError.message); return; }
    setForm(emptyForm); setMemberIds([]); setMemberQuery(""); setFilter("open");
    if (typeof newId === "string") setSelectedId(newId);
    setNotice("Đã giao việc. Người nhận sẽ thấy việc này ở trang cá nhân của họ.");
    reload();
  }

  function toggleMember(id: string) {
    setMemberIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function saveAssignee(task: Task, row: Assignee) {
    const draft = drafts[`${task.id}:${row.member_id}`];
    if (!supabase || !draft) return;
    setBusy(`assignee:${row.member_id}`); resetMessages();
    const { data: updated, error: updateError } = await supabase.from("task_assignees").update({ status: draft.status, note: draft.note.trim() || null }).eq("task_id", task.id).eq("member_id", row.member_id).select("member_id");
    setBusy("");
    if (updateError) { setError(updateError.message); return; }
    if (!updated?.length) { setError("Không cập nhật được: bạn không có quyền hoặc người nhận không còn trong việc này."); return; }
    setDrafts((current) => { const next = { ...current }; delete next[`${task.id}:${row.member_id}`]; return next; });
    setNotice("Đã cập nhật trạng thái người nhận.");
    reload();
  }

  async function setTaskStatus(task: Task, status: "open" | "closed") {
    if (!supabase) return;
    setBusy("status"); resetMessages();
    const { data: updated, error: updateError } = await supabase.from("tasks").update({ status }).eq("id", task.id).select("id");
    setBusy("");
    if (updateError) { setError(updateError.message); return; }
    if (!updated?.length) { setError("Không cập nhật được: bạn không có quyền hoặc việc không còn tồn tại."); return; }
    setNotice(status === "closed" ? "Đã đóng việc." : "Đã mở lại việc.");
    reload();
  }

  async function deleteTask() {
    if (!supabase || !confirmTask) return;
    setBusy("delete"); resetMessages();
    const { data: deleted, error: deleteError } = await supabase.from("tasks").delete().eq("id", confirmTask.id).select("id");
    setBusy(""); setConfirmTask(null);
    if (deleteError) { setError(deleteError.message); return; }
    if (!deleted?.length) { setError("Không xóa được: bạn không có quyền hoặc việc không còn tồn tại."); return; }
    setSelectedId(""); setNotice("Đã xóa việc.");
    reload();
  }

  async function remindNow(task: Task) {
    setBusy("remind"); resetMessages();
    const result = await callApi<{ sent: number; failed: number; noEmail: number }>("/api/admin/tasks/remind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubId, taskId: task.id }) });
    setBusy("");
    if (result.error || !result.data) { setError(result.error ?? "Không gửi được mail nhắc."); return; }
    const { sent, failed, noEmail } = result.data;
    setNotice(`Đã gửi nhắc ${sent} người${failed ? `, ${failed} người gửi lỗi` : ""}${noEmail ? `, ${noEmail} người chưa có email` : ""}.`);
    reload();
  }

  async function connectMyGmail() {
    setBusy("sender"); resetMessages();
    const result = await callApi<unknown>("/api/admin/mail-sender", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubId }) });
    setBusy("");
    if (result.error) { setError(result.error); return; }
    setNotice("Đã dùng Gmail của bạn để gửi nhắc việc.");
    setSenderKey((key) => key + 1);
  }

  const loading = !loaded;
  const canRemind = senderState?.configured !== false;

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <header className="mb-6"><p className="text-sm font-semibold text-emerald-700">Không gian CLB</p><h1 className="mt-1 text-3xl font-bold">Giao việc</h1><p className="mt-2 text-sm text-zinc-600">Giao việc có hạn chót cho thành viên hoặc cả ban. Thành viên tự đánh dấu xong ở trang cá nhân, hệ thống gửi mail nhắc khi sắp hoặc đã quá hạn.</p></header>
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!supabase && <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Thiếu cấu hình Supabase.</p>}
    {!canWrite && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Chỉ Ban chủ nhiệm và Ban chủ chốt được giao việc.</p>}
    {loaded?.error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{loaded.error}</p>}

    {canWrite && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
      <div className="min-w-0 flex-1"><h2 className="font-semibold">Gmail gửi nhắc việc</h2>
        <p className="mt-1 break-words text-xs text-zinc-500">{!senderState ? "Đang kiểm tra…" : senderState.error ? `Không đọc được trạng thái: ${senderState.error}` : senderState.configured ? `Mail nhắc được gửi từ Gmail của ${senderState.isMe ? "bạn" : senderState.senderName ?? "một thành viên quản trị"}.` : "Chưa chọn Gmail gửi nhắc nên hệ thống chưa gửi mail nhắc."} <Link href="/manage-clubs/mail" className="font-medium text-emerald-800 underline">Kết nối Gmail ở mục Gửi mail</Link></p></div>
      {!senderState?.isMe && <button type="button" disabled={busy === "sender" || !senderState} onClick={() => void connectMyGmail()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "sender" ? "Đang lưu…" : "Dùng Gmail của tôi để gửi nhắc"}</button>}
    </div>}

    <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-6">
        {canWrite && <form onSubmit={(event) => void createTask(event)} className="space-y-4 rounded-xl border bg-white p-5">
          <div><h2 className="font-semibold">Giao việc mới</h2><p className="mt-1 text-xs text-zinc-500">Chọn người nhận và/hoặc cả ban (chỉ tính thành viên đang hoạt động).</p></div>
          <label className="block text-sm">Tiêu đề<input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} placeholder="Ví dụ: Nộp bản thiết kế poster" /></label>
          <label className="block text-sm">Mô tả<textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} placeholder="Yêu cầu chi tiết (không bắt buộc)" /></label>
          <label className="block text-sm">Hạn chót<input required type="datetime-local" value={form.due} onChange={(event) => setForm({ ...form, due: event.target.value })} className={inputClass} /></label>
          <label className="block text-sm">Giao cho cả ban<select value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value })} className={inputClass}><option value="">Không giao theo ban</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
          <fieldset className="text-sm"><legend className="font-medium">Giao cho từng người ({memberIds.length} đã chọn)</legend>
            <label className="mt-1 block text-xs text-zinc-600">Tìm thành viên<input type="search" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} className={inputClass} placeholder="Gõ tên để lọc" /></label>
            <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border">{shownMembers.length ? <ul className="divide-y divide-zinc-100">{shownMembers.map((member) => <li key={member.id}><label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-zinc-50"><input type="checkbox" checked={memberIds.includes(member.id)} onChange={() => toggleMember(member.id)} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{member.full_name}</span></label></li>)}</ul> : <p className="p-3 text-xs text-zinc-500">{loading ? "Đang tải thành viên…" : "Không có thành viên phù hợp."}</p>}</div>
          </fieldset>
          <button disabled={busy === "create" || !supabase} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "create" ? "Đang giao…" : "Giao việc"}</button>
        </form>}

        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="flex items-center justify-between gap-2 border-b p-4"><h2 className="font-semibold">Danh sách việc</h2><button type="button" onClick={reload} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Làm mới</button></div>
          <div role="group" aria-label="Lọc việc" className="flex gap-2 border-b p-3">{([["open", `Đang mở (${openCount})`], ["closed", `Đã đóng (${closedCount})`]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === value ? "bg-emerald-50 text-emerald-800" : "text-zinc-600 hover:bg-zinc-100"}`}>{label}</button>)}</div>
          {loading ? <p className="p-6 text-sm text-zinc-500">Đang tải việc…</p> : visible.length ? <ul className="divide-y divide-zinc-100">{visible.map((task) => {
            const done = task.task_assignees.filter((row) => row.status === "done").length;
            return <li key={task.id}><button type="button" aria-current={task.id === selectedId} onClick={() => setSelectedId(task.id)} className={`block w-full p-4 text-left hover:bg-zinc-50 ${task.id === selectedId ? "bg-emerald-50/60" : ""}`}>
              <span className="flex items-start justify-between gap-2"><span className="min-w-0 break-words font-medium">{task.title}</span>{isOverdue(task) && <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800">Quá hạn</span>}</span>
              <span className="mt-1 block text-xs text-zinc-500">Hạn {formatDateTime(task.due_at)} · {done}/{task.task_assignees.length} người xong</span>
            </button></li>;
          })}</ul> : <p className="p-6 text-sm text-zinc-500">{filter === "open" ? "Chưa có việc nào đang mở." : "Chưa có việc nào đã đóng."}</p>}
        </div>
      </div>

      <div className="min-w-0 rounded-xl border bg-white">
        {!selected ? <p className="p-6 text-sm text-zinc-500">{loading ? "Đang tải việc…" : tasks.length ? "Chọn một việc để xem người nhận và cập nhật trạng thái." : "Chưa có việc nào. Hãy giao việc đầu tiên ở khung bên trái."}</p> : <>
          <div className="border-b p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-xl font-semibold">{selected.title}</h2><p className="mt-1 text-sm text-zinc-600">Hạn {formatDateTime(selected.due_at)}</p></div>
              <div className="flex flex-wrap gap-2">{isOverdue(selected) && <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800">Quá hạn</span>}<span className={`rounded-full px-3 py-1 text-xs font-semibold ${selected.status === "open" ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>{selected.status === "open" ? "Đang mở" : "Đã đóng"}</span></div></div>
            {selected.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-700">{selected.description}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy === "remind" || selected.status !== "open" || !canRemind || !selected.task_assignees.some((row) => row.status === "pending")} onClick={() => void remindNow(selected)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "remind" ? "Đang gửi…" : "Gửi nhắc ngay"}</button>
              <button type="button" disabled={busy === "status"} onClick={() => void setTaskStatus(selected, selected.status === "open" ? "closed" : "open")} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{selected.status === "open" ? "Đóng việc" : "Mở lại việc"}</button>
              <button type="button" disabled={busy === "delete"} onClick={() => setConfirmTask(selected)} className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 disabled:opacity-50">Xóa việc</button>
            </div>
            {!canRemind && <p className="mt-2 text-xs text-amber-800">Hãy chọn Gmail gửi nhắc ở khung phía trên trước khi gửi nhắc.</p>}
          </div>
          <div className="p-5">
            <h3 className="font-semibold">Người nhận ({selected.task_assignees.length})</h3>
            {selected.task_assignees.length ? <ul className="mt-4 space-y-3">{[...selected.task_assignees].sort((a, b) => (memberById.get(a.member_id)?.full_name ?? "").localeCompare(memberById.get(b.member_id)?.full_name ?? "", "vi")).map((row) => {
              const key = `${selected.id}:${row.member_id}`;
              const draft = drafts[key] ?? { status: row.status, note: row.note ?? "" };
              const member = memberById.get(row.member_id);
              const dirty = !!drafts[key] && (draft.status !== row.status || draft.note.trim() !== (row.note ?? ""));
              return <li key={row.member_id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 break-words text-sm font-semibold">{member?.full_name ?? "Thành viên đã xóa"}{member && !member.is_active && <span className="ml-2 text-xs font-normal text-zinc-500">Ngừng hoạt động</span>}</p><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass[row.status]}`}>{statusLabel[row.status]}</span></div>
                {row.completed_at && <p className="mt-1 text-xs text-zinc-500">Hoàn thành lúc {formatDateTime(row.completed_at)}{Date.parse(row.completed_at) > Date.parse(selected.due_at) ? " (trễ hạn)" : ""}</p>}
                <div className="mt-2 grid gap-3 sm:grid-cols-[170px_minmax(0,1fr)_auto] sm:items-end">
                  <label className="block text-xs font-medium text-zinc-600">Trạng thái<select value={draft.status} onChange={(event) => setDrafts({ ...drafts, [key]: { ...draft, status: event.target.value as AssigneeStatus } })} className={inputClass}>{(Object.keys(statusLabel) as AssigneeStatus[]).map((value) => <option key={value} value={value}>{statusLabel[value]}</option>)}</select></label>
                  <label className="block text-xs font-medium text-zinc-600">Ghi chú của Ban chủ chốt<input value={draft.note} onChange={(event) => setDrafts({ ...drafts, [key]: { ...draft, note: event.target.value } })} className={inputClass} placeholder="Không bắt buộc" /></label>
                  <button type="button" disabled={!dirty || busy === `assignee:${row.member_id}`} onClick={() => void saveAssignee(selected, row)} className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">{busy === `assignee:${row.member_id}` ? "Đang lưu…" : "Lưu"}</button>
                </div>
              </li>;
            })}</ul> : <p className="mt-4 text-sm text-zinc-500">Việc này chưa có người nhận.</p>}
          </div>
        </>}
      </div>
    </div>

    {confirmTask && <div role="presentation" onKeyDown={(event) => { if (event.key === "Escape" && busy !== "delete") setConfirmTask(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-task-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="delete-task-title" className="break-words text-lg font-bold">Xóa việc “{confirmTask.title}”?</h2>
        <p className="mt-3 text-sm text-zinc-700">Việc và trạng thái của {confirmTask.task_assignees.length} người nhận sẽ bị xóa, bảng đóng góp cũng không còn tính việc này. Nếu chỉ muốn ngừng nhắc, hãy chọn “Đóng việc” thay vì xóa.</p>
        <div className="mt-5 flex justify-end gap-2"><button ref={cancelRef} type="button" disabled={busy === "delete"} onClick={() => setConfirmTask(null)} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">Hủy</button><button type="button" disabled={busy === "delete"} onClick={() => void deleteTask()} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "delete" ? "Đang xóa…" : "Xóa việc"}</button></div>
      </div>
    </div>}
  </section>;
}
