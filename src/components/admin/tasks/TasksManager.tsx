"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { friendlyError } from "../../../lib/ui/friendly-error";
import { useCurrentAdminClub } from "../AdminClubContext";
import { facebookUrlPattern } from "../roles";
import { useReloadOnAdminChange } from "../adminClient";
import { useDialog } from "../useDialog";
import { Button, ButtonLink } from "../ui/Button";
import { CreatePanel } from "../ui/CreatePanel";
import { EmptyState } from "../ui/EmptyState";
import { Field, inputClass } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { Panel } from "../ui/Panel";

type AssigneeStatus = "pending" | "done" | "missed";
type Assignee = { member_id: string; status: AssigneeStatus; note: string | null; completed_at: string | null };
type TaskKind = "general" | "engagement" | "avatar";
type Task = { id: string; title: string; description: string | null; due_at: string; status: "open" | "closed"; kind: TaskKind; post_url: string | null; frame_id: string | null; task_assignees: Assignee[] };
type Member = { id: string; full_name: string; team_id: string | null; is_active: boolean };
type Team = { id: string; name: string };
type Frame = { id: string; name: string };
type LoadedData = { clubId: string; tasks: Task[]; members: Member[]; memberTeams: Map<string, Set<string>>; teams: Team[]; frames: Frame[]; loadedAt: number; error: string };
type Sender = { clubId: string; configured: boolean; isMe: boolean; senderName: string | null; error: string };
type Draft = { status: AssigneeStatus; note: string };

const statusLabel: Record<AssigneeStatus, string> = { pending: "Chờ", done: "Xong", missed: "Chưa hoàn thành" };
const statusClass: Record<AssigneeStatus, string> = { pending: "bg-amber-50 text-amber-800", done: "bg-emerald-50 text-emerald-800", missed: "bg-rose-50 text-rose-800" };
const kindLabel: Record<TaskKind, string> = { general: "Việc thường", engagement: "Tương tác bài viết", avatar: "Thay avatar" };
const emptyForm = { title: "", description: "", due: "", teamId: "", kind: "general" as TaskKind, postUrl: "", frameId: "", allMembers: false };

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
  const { id: clubId, role, teamId, can } = useCurrentAdminClub();
  const isOwner = role === "owner";
  const canWrite = isOwner || role === "admin";
  const canMail = can("mail");
  const [data, setData] = useState<LoadedData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sender, setSender] = useState<Sender | null>(null);
  const [senderKey, setSenderKey] = useState(0);
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState("");
  const [confirmTask, setConfirmTask] = useState<Task | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialogRef = useDialog<HTMLDivElement>(() => { if (busy !== "delete") setConfirmTask(null); }, !!confirmTask);

  useEffect(() => {
    if (!supabase || !clubId || !canWrite) return;
    let active = true;
    (async () => {
      const [taskResult, memberResult, teamResult, frameResult] = await Promise.all([
        supabase.from("tasks").select("id,title,description,due_at,status,kind,post_url,frame_id,task_assignees(member_id,status,note,completed_at)").eq("club_id", clubId).order("due_at", { ascending: true }),
        // Nhúng club_member_teams để biết đủ các ban của từng người (không chỉ ban chính).
        supabase.from("club_members").select("id,full_name,team_id,is_active,club_member_teams(team_id)").eq("club_id", clubId).order("full_name"),
        supabase.from("teams").select("id,name").eq("club_id", clubId).order("name"),
        supabase.from("avatar_frames").select("id,name").eq("club_id", clubId).order("name"),
      ]);
      if (!active) return;
      const failure = taskResult.error ?? memberResult.error ?? teamResult.error ?? frameResult.error;
      const memberRows = (memberResult.data ?? []) as unknown as (Member & { club_member_teams: { team_id: string }[] | null })[];
      // Tập ban luôn gồm ban chính, kể cả khi bảng tập chưa trả dòng nào.
      const memberTeams = new Map(memberRows.map((row) => [row.id, new Set([...(row.team_id ? [row.team_id] : []), ...(row.club_member_teams ?? []).map((item) => item.team_id)])]));
      setData({
        clubId, loadedAt: Date.now(), error: failure ? friendlyError(failure, "Không tải được danh sách việc. Vui lòng thử lại.") : "",
        tasks: (taskResult.data ?? []) as unknown as Task[], members: memberRows, memberTeams, teams: (teamResult.data ?? []) as Team[], frames: (frameResult.data ?? []) as Frame[],
      });
    })();
    return () => { active = false; };
  }, [supabase, clubId, canWrite, reloadKey]);

  useEffect(() => {
    if (!clubId || !canWrite || !canMail) return;
    let active = true;
    (async () => {
      const result = await callApi<{ configured: boolean; isMe: boolean; senderName: string | null }>(`/api/admin/mail-sender?clubId=${encodeURIComponent(clubId)}`);
      if (!active) return;
      setSender({ clubId, configured: result.data?.configured ?? false, isMe: result.data?.isMe ?? false, senderName: result.data?.senderName ?? null, error: result.error ?? "" });
    })();
    return () => { active = false; };
  }, [clubId, canWrite, canMail, senderKey]);

  // Ban hoặc thành viên đổi ở tab khác: tải lại để danh sách người nhận/ban không bị cũ.
  useReloadOnAdminChange(() => setReloadKey((key) => key + 1));

  const loaded = data && data.clubId === clubId ? data : null;
  const senderState = sender && sender.clubId === clubId ? sender : null;
  const tasks = useMemo(() => loaded?.tasks ?? [], [loaded]);
  const members = useMemo(() => loaded?.members ?? [], [loaded]);
  const teams = useMemo(() => loaded?.teams ?? [], [loaded]);
  const memberTeams = useMemo(() => loaded?.memberTeams ?? new Map<string, Set<string>>(), [loaded]);
  const frames = useMemo(() => loaded?.frames ?? [], [loaded]);
  const loadedAt = loaded?.loadedAt ?? 0;
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const openCount = tasks.filter((task) => task.status === "open").length;
  const closedCount = tasks.length - openCount;
  const visible = useMemo(() => tasks.filter((task) => task.status === filter).sort((a, b) => filter === "open" ? a.due_at.localeCompare(b.due_at) : b.due_at.localeCompare(a.due_at)), [tasks, filter]);
  // Ban chủ chốt chỉ giao việc trong ban của mình; Ban chủ nhiệm giao cho mọi ban.
  const canAssign = isOwner || !!teamId;
  const assignableTeams = isOwner ? teams : teams.filter((team) => team.id === teamId);
  const canAllMembers = isOwner || (can("facebook") && form.kind !== "general");
  const activeMembers = members.filter((member) => member.is_active && (isOwner || (!!teamId && !!memberTeams.get(member.id)?.has(teamId))));
  const query = memberQuery.trim().toLowerCase();
  const shownMembers = query ? activeMembers.filter((member) => member.full_name.toLowerCase().includes(query)) : activeMembers;
  const isOverdue = (task: Task) => task.status === "open" && Date.parse(task.due_at) < loadedAt;
  const reload = () => setReloadKey((key) => key + 1);
  const resetMessages = () => { setError(""); setNotice(""); };

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !canWrite || !canAssign) return;
    const due = new Date(form.due);
    if (Number.isNaN(due.getTime())) { setError("Hãy chọn hạn chót hợp lệ."); return; }
    const allMembers = form.allMembers && canAllMembers;
    if (!allMembers && !memberIds.length && !form.teamId) { setError("Hãy chọn ít nhất một người nhận hoặc một ban."); return; }
    const postUrl = form.postUrl.trim();
    if (form.kind === "engagement" && !facebookUrlPattern.test(postUrl)) { setError("Việc tương tác cần link bài viết Facebook, bắt đầu bằng https://facebook.com/ hoặc https://fb.com/."); return; }
    setBusy("create"); resetMessages();
    const { data: newId, error: rpcError } = await supabase.rpc("create_task", {
      p_club_id: clubId, p_title: form.title.trim(), p_description: form.description.trim() || null,
      p_due_at: due.toISOString(), p_member_ids: memberIds, p_team_id: form.teamId || null,
      p_kind: form.kind, p_post_url: form.kind === "engagement" ? postUrl : null, p_frame_id: form.kind === "avatar" ? form.frameId || null : null, p_all_members: allMembers,
    });
    setBusy("");
    if (rpcError) { setError(friendlyError(rpcError, "Không giao được việc. Vui lòng thử lại.")); return; }
    setForm(emptyForm); setMemberIds([]); setMemberQuery(""); setFilter("open"); setCreating(false);
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
    if (updateError) { setError(friendlyError(updateError, "Không cập nhật được trạng thái người nhận.")); return; }
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
    if (updateError) { setError(friendlyError(updateError, "Không cập nhật được việc.")); return; }
    if (!updated?.length) { setError("Không cập nhật được: bạn không có quyền hoặc việc không còn tồn tại."); return; }
    setNotice(status === "closed" ? "Đã đóng việc." : "Đã mở lại việc.");
    reload();
  }

  async function deleteTask() {
    if (!supabase || !confirmTask) return;
    setBusy("delete"); resetMessages();
    const { data: deleted, error: deleteError } = await supabase.from("tasks").delete().eq("id", confirmTask.id).select("id");
    setBusy(""); setConfirmTask(null);
    if (deleteError) { setError(friendlyError(deleteError, "Không xóa được việc.")); return; }
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
  // Không có quyền Gửi mail thì không biết trạng thái Gmail; để máy chủ quyết định khi gửi.
  const canRemind = !canMail || senderState?.configured !== false;
  const showCreate = canWrite && canAssign;

  const createForm = <form onSubmit={(event) => void createTask(event)} className="space-y-5">
    <p className="text-xs text-zinc-500">Chọn người nhận và/hoặc cả ban (chỉ tính thành viên đang hoạt động).{!isOwner && " Bạn chỉ giao được cho thành viên trong ban của mình."}</p>
    <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Field label="Tiêu đề"><input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} placeholder="Ví dụ: Nộp bản thiết kế poster" data-autofocus /></Field>
        <Field label="Mô tả"><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} placeholder="Yêu cầu chi tiết (không bắt buộc)" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Loại việc"><select value={form.kind} onChange={(event) => { const kind = event.target.value as TaskKind; setForm({ ...form, kind, allMembers: form.allMembers && (isOwner || (can("facebook") && kind !== "general")) }); }} className={inputClass}>{(Object.keys(kindLabel) as TaskKind[]).map((value) => <option key={value} value={value}>{kindLabel[value]}</option>)}</select></Field>
          <Field label="Hạn chót"><input required type="datetime-local" value={form.due} onChange={(event) => setForm({ ...form, due: event.target.value })} className={inputClass} /></Field>
        </div>
        {form.kind === "engagement" && <Field label="Link bài viết Facebook" hint="Thành viên react hoặc bình luận bài này. Sau đó dùng bookmarklet để đối chiếu."><input required type="url" value={form.postUrl} onChange={(event) => setForm({ ...form, postUrl: event.target.value })} className={inputClass} placeholder="https://facebook.com/..." /></Field>}
        {form.kind === "avatar" && <Field label="Khung avatar" hint={frames.length ? "Khung được chọn sẽ hiện nút “Tạo avatar khung” ở trang cá nhân của người nhận." : <>CLB chưa có khung nào. <Link href="/manage-clubs/frames" className="font-medium text-emerald-800 underline">Tải khung lên ở mục Khung avatar</Link>.</>}><select value={form.frameId} onChange={(event) => setForm({ ...form, frameId: event.target.value })} className={inputClass}><option value="">Chưa chọn khung</option>{frames.map((frame) => <option key={frame.id} value={frame.id}>{frame.name}</option>)}</select></Field>}
        <Field label="Giao cho cả ban"><select value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value })} className={inputClass}><option value="">Không giao theo ban</option>{assignableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></Field>
        {canAllMembers && <label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" checked={form.allMembers} onChange={(event) => setForm({ ...form, allMembers: event.target.checked })} className="mt-0.5 shrink-0" /><span>Giao cho tất cả thành viên đang hoạt động<span className="block text-xs text-zinc-500">Gộp thêm với người và ban đã chọn.</span></span></label>}
      </div>
      <fieldset className="min-w-0 text-sm"><legend className="font-medium text-zinc-800">Giao cho từng người ({memberIds.length} đã chọn)</legend>
        <input type="search" aria-label="Tìm thành viên" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} className={`${inputClass} mt-1`} placeholder="Gõ tên để lọc" />
        <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-zinc-300">{shownMembers.length ? <ul className="divide-y divide-zinc-100">{shownMembers.map((member) => <li key={member.id}><label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-zinc-50"><input type="checkbox" checked={memberIds.includes(member.id)} onChange={() => toggleMember(member.id)} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{member.full_name}</span></label></li>)}</ul> : <p className="p-3 text-xs text-zinc-500">{loading ? "Đang tải thành viên…" : isOwner || teamId ? "Không có thành viên phù hợp." : "Chưa có thành viên."}</p>}</div>
      </fieldset>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
      <Button type="submit" variant="primary" loading={busy === "create"} disabled={!supabase}>{busy === "create" ? "Đang giao…" : "Giao việc"}</Button>
      <Button onClick={() => setCreating(false)} disabled={busy === "create"}>Hủy</Button>
    </div>
  </form>;

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <PageHeader title="Giao việc" description="Giao việc có hạn chót cho thành viên hoặc cả ban. Thành viên tự đánh dấu xong ở trang cá nhân, hệ thống gửi mail nhắc khi sắp hoặc đã quá hạn." actions={showCreate && <Button variant="primary" icon="plus" onClick={() => { if (creating) return; setCreating(true); resetMessages(); }} aria-expanded={creating}>Giao việc</Button>} />
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {!supabase && <Notice tone="warning">Thiếu cấu hình Supabase.</Notice>}
    {!canWrite && <Notice tone="warning">Chỉ Ban chủ nhiệm và Ban chủ chốt được giao việc.</Notice>}
    {loaded?.error && <Notice tone="error">{loaded.error}</Notice>}

    {canWrite && !canMail && <Notice tone="warning">Bạn chưa được cấp quyền Gửi mail nên không chọn được Gmail gửi nhắc việc. Nếu CLB đã chọn Gmail, bạn vẫn gửi nhắc được cho việc của mình.</Notice>}
    {canWrite && !canAssign && <Notice tone="warning">Bạn chưa thuộc ban nào nên chưa giao việc được. Hãy nhờ Chủ nhiệm xếp bạn vào một ban.</Notice>}
    {canWrite && canMail && <Notice tone={senderState && !senderState.error && !senderState.configured ? "warning" : "info"} className="break-words">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 grow basis-72"><span className="font-medium">Gmail gửi nhắc việc:</span> {!senderState ? "Đang kiểm tra…" : senderState.error ? `Không đọc được trạng thái: ${senderState.error}` : senderState.configured ? `Mail nhắc được gửi từ Gmail của ${senderState.isMe ? "bạn" : senderState.senderName ?? "một thành viên quản trị"}.` : "Chưa chọn Gmail gửi nhắc nên hệ thống chưa gửi mail nhắc."} <Link href="/manage-clubs/mail" className="font-medium text-emerald-800 underline">Kết nối Gmail ở mục Gửi mail</Link></p>
        {!senderState?.isMe && <Button size="sm" loading={busy === "sender" || !senderState} onClick={() => void connectMyGmail()}>{busy === "sender" ? "Đang lưu…" : "Dùng Gmail của tôi để gửi nhắc"}</Button>}
      </div>
    </Notice>}

    {showCreate && <CreatePanel open={creating} title="Giao việc mới" onClose={() => setCreating(false)}>{createForm}</CreatePanel>}

    {canWrite && supabase && <Panel title="Danh sách việc" padded={false} actions={<Button variant="ghost" size="sm" icon="refresh" onClick={reload}>Làm mới</Button>}>
      <div role="group" aria-label="Lọc việc" className="flex gap-1 border-b border-zinc-100 px-3 py-2">{([["open", `Đang mở (${openCount})`], ["closed", `Đã đóng (${closedCount})`]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600 ${filter === value ? "bg-emerald-50 text-emerald-900" : "text-zinc-600 hover:bg-zinc-100"}`}>{label}</button>)}</div>
      {loading ? <div role="status" aria-label="Đang tải việc" className="space-y-2 p-4">{[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-zinc-100" />)}</div>
        : visible.length ? <ul className="divide-y divide-zinc-100">{visible.map((task) => {
          const done = task.task_assignees.filter((row) => row.status === "done").length;
          const expanded = task.id === selectedId;
          const detailId = `task-detail-${task.id}`;
          return <li key={task.id} className={expanded ? "bg-zinc-50/70" : ""}>
            <button type="button" aria-expanded={expanded} aria-controls={expanded ? detailId : undefined} onClick={() => setSelectedId(expanded ? "" : task.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600 sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium text-zinc-900">{task.title}{task.kind !== "general" && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">{kindLabel[task.kind]}</span>}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">Hạn {formatDateTime(task.due_at)} · {done}/{task.task_assignees.length} người xong</span>
              </span>
              {isOverdue(task) && <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800">Quá hạn</span>}
              <Icon name="chevron-down" className={`mt-0.5 shrink-0 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded && <div id={detailId} className="border-t border-zinc-100 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${task.status === "open" ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>{task.status === "open" ? "Đang mở" : "Đã đóng"}</span>
              </div>
              {task.kind === "engagement" && task.post_url && <p className="mt-2 break-all text-sm">{task.post_url.startsWith("https://") ? <a href={task.post_url} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-800 underline">{task.post_url}</a> : task.post_url}</p>}
              {task.kind === "avatar" && <p className="mt-2 break-words text-sm text-zinc-700">{task.frame_id ? `Khung: ${frames.find((frame) => frame.id === task.frame_id)?.name ?? "Không đọc được tên khung"}` : "Chưa gắn khung."}</p>}
              {task.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-700">{task.description}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" icon="mail" loading={busy === "remind"} disabled={task.status !== "open" || !canRemind || !task.task_assignees.some((row) => row.status === "pending")} onClick={() => void remindNow(task)}>{busy === "remind" ? "Đang gửi…" : "Gửi nhắc ngay"}</Button>
                {task.kind !== "general" && <ButtonLink href="/manage-clubs/scan" size="sm">Đối chiếu bằng bookmarklet</ButtonLink>}
                <Button size="sm" disabled={busy === "status"} onClick={() => void setTaskStatus(task, task.status === "open" ? "closed" : "open")}>{task.status === "open" ? "Đóng việc" : "Mở lại việc"}</Button>
              </div>
              {!canRemind && <p className="mt-2 text-xs text-amber-800">Hãy chọn Gmail gửi nhắc ở dòng Gmail phía trên trước khi gửi nhắc.</p>}

              <h3 className="mt-5 text-sm font-semibold text-zinc-900">Người nhận ({task.task_assignees.length})</h3>
              {task.task_assignees.length ? <ul className="mt-1 divide-y divide-zinc-200/70">{[...task.task_assignees].sort((a, b) => (memberById.get(a.member_id)?.full_name ?? "").localeCompare(memberById.get(b.member_id)?.full_name ?? "", "vi")).map((row) => {
                const key = `${task.id}:${row.member_id}`;
                const draft = drafts[key] ?? { status: row.status, note: row.note ?? "" };
                const member = memberById.get(row.member_id);
                const name = member?.full_name ?? "Thành viên đã xóa";
                const dirty = !!drafts[key] && (draft.status !== row.status || draft.note.trim() !== (row.note ?? ""));
                return <li key={row.member_id} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_160px_minmax(0,1.2fr)_auto] md:items-center md:gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{name}{member && !member.is_active && <span className="ml-2 text-xs font-normal text-zinc-500">Ngừng hoạt động</span>} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass[row.status]}`}>{statusLabel[row.status]}</span></p>
                    {row.completed_at && <p className="mt-0.5 text-xs text-zinc-500">Hoàn thành lúc {formatDateTime(row.completed_at)}{Date.parse(row.completed_at) > Date.parse(task.due_at) ? " (trễ hạn)" : ""}</p>}
                  </div>
                  <select aria-label={`Trạng thái của ${name}`} value={draft.status} onChange={(event) => setDrafts({ ...drafts, [key]: { ...draft, status: event.target.value as AssigneeStatus } })} className={inputClass}>{(Object.keys(statusLabel) as AssigneeStatus[]).map((value) => <option key={value} value={value}>{statusLabel[value]}</option>)}</select>
                  <input aria-label={`Ghi chú của Ban chủ chốt cho ${name}`} value={draft.note} onChange={(event) => setDrafts({ ...drafts, [key]: { ...draft, note: event.target.value } })} className={inputClass} placeholder="Ghi chú (không bắt buộc)" />
                  <Button disabled={!dirty} loading={busy === `assignee:${row.member_id}`} onClick={() => void saveAssignee(task, row)}>{busy === `assignee:${row.member_id}` ? "Đang lưu…" : "Lưu"}</Button>
                </li>;
              })}</ul> : <p className="mt-2 text-sm text-zinc-500">Việc này chưa có người nhận.</p>}

              <div className="mt-4 flex justify-end border-t border-zinc-200/70 pt-3"><Button variant="danger" size="sm" icon="trash" disabled={busy === "delete"} onClick={() => setConfirmTask(task)}>Xóa việc</Button></div>
            </div>}
          </li>;
        })}</ul>
        : <EmptyState title={tasks.length ? (filter === "open" ? "Chưa có việc nào đang mở" : "Chưa có việc nào đã đóng") : "Chưa có việc nào"} description={tasks.length ? undefined : "Giao việc đầu tiên cho thành viên hoặc cả ban."} action={!tasks.length && showCreate && <Button variant="primary" icon="plus" onClick={() => setCreating(true)} disabled={creating}>Giao việc</Button>} />}
    </Panel>}

    {confirmTask && <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="delete-task-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl outline-none">
        <h2 id="delete-task-title" className="break-words text-lg font-semibold">Xóa việc “{confirmTask.title}”?</h2>
        <p className="mt-3 text-sm text-zinc-700">Việc và trạng thái của {confirmTask.task_assignees.length} người nhận sẽ bị xóa, bảng đóng góp cũng không còn tính việc này. Nếu chỉ muốn ngừng nhắc, hãy chọn “Đóng việc” thay vì xóa.</p>
        <div className="mt-5 flex justify-end gap-2"><Button data-autofocus disabled={busy === "delete"} onClick={() => setConfirmTask(null)}>Hủy</Button><Button variant="danger" className="bg-rose-700! text-white! hover:bg-rose-800!" loading={busy === "delete"} onClick={() => void deleteTask()}>{busy === "delete" ? "Đang xóa…" : "Xóa việc"}</Button></div>
      </div>
    </div>}
  </section>;
}
