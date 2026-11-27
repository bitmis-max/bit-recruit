"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useCurrentAdminClub } from "./AdminClubContext";
import { MemberImportDialog } from "./MemberImportDialog";
import { roleLabel, roleLabels } from "./roles";
import { CLUB_PERMISSIONS, isClubPermission } from "../../lib/admin/permissions";
import { normalizeSearchText } from "../../lib/recruitment/search";
import { notifyMembersChanged, requestJson, useReloadOnAdminChange } from "./adminClient";
import { useDialog } from "./useDialog";
import { Button } from "./ui/Button";
import { CreatePanel } from "./ui/CreatePanel";
import { EmptyState } from "./ui/EmptyState";
import { Field, inputClass } from "./ui/Field";
import { Icon } from "./ui/Icon";
import { Notice } from "./ui/Notice";
import { PageHeader } from "./ui/PageHeader";
import { Panel } from "./ui/Panel";

type Member = { id: string; full_name: string; student_code: string | null; class_name: string | null; team_id: string | null; team_ids?: string[] | null; role: string; is_active: boolean; user_id: string | null; email: string | null; phone: string | null; facebook_url: string | null; title: string | null; permissions: string[] | null; is_head: boolean | null };
type Team = { id: string; name: string };
type Draft = { id?: string; full_name: string; student_code: string; class_name: string; team_ids: string[]; role: string; is_active: boolean; email: string; phone: string; facebook_url: string; title: string; permissions: string[]; initial_team_ids?: string[] };
type BulkResult = { memberId: string; status: "created" | "linked" | "skipped" | "error"; message?: string };
const emptyDraft: Draft = { full_name: "", student_code: "", class_name: "", team_ids: [], role: "member", is_active: true, email: "", phone: "", facebook_url: "", title: "", permissions: [] };
// Tập ban của thành viên, ban chính đứng đầu (API trả team_ids; dự phòng bằng team_id).
const teamIdsOf = (member: Member) => member.team_ids ?? (member.team_id ? [member.team_id] : []);
const bulkStatusLabel: Record<BulkResult["status"], string> = { created: "Đã tạo tài khoản", linked: "Đã gắn tài khoản có sẵn", skipped: "Bỏ qua", error: "Lỗi" };
const chip = "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800";

export function ClubMembersManager() {
  const { id: clubId, isHead, can } = useCurrentAdminClub();
  const canWrite = can("members");
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [formOpen, setFormOpen] = useState(false);
  // Máy chủ chỉ cho Chủ nhiệm sửa bất kỳ trường nào của dòng Ban chủ nhiệm/Ban chủ chốt (gồm cả chính mình).
  const staffLocked = !isHead && (draft.role === "owner" || draft.role === "admin");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<{ kind: "remove"; member: Member } | { kind: "accounts" } | null>(null);
  const dialogRef = useDialog<HTMLDivElement>(() => setConfirming(null), !!confirming);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await requestJson<{ members: Member[]; teams: Team[] }>(`/api/admin/club-members?clubId=${encodeURIComponent(clubId)}`, undefined, "Không tải được thành viên.");
    if (!result.ok) setError(result.error);
    else { setMembers(result.data.members ?? []); setTeams(result.data.teams ?? []); setError(""); }
    setLoading(false);
  }, [clubId]);

  useEffect(() => { void load(); }, [load]);
  // Ban đổi ở "Quản lí ban", thành viên đổi ở Tài khoản/Nhiệm kỳ/Import: tải lại danh sách.
  useReloadOnAdminChange(() => void load());

  const shownMembers = useMemo(() => {
    const needle = normalizeSearchText(query);
    if (!needle) return members;
    return members.filter((member) => [member.full_name, member.student_code, member.email].some((value) => normalizeSearchText(value).includes(needle)));
  }, [members, query]);

  function openCreate() { setDraft(emptyDraft); setFormOpen(true); setError(""); setNotice(""); }
  function openEdit(member: Member) {
    setDraft({ id: member.id, full_name: member.full_name, student_code: member.student_code ?? "", class_name: member.class_name ?? "", team_ids: teamIdsOf(member), initial_team_ids: teamIdsOf(member), role: member.role, is_active: member.is_active, email: member.email ?? "", phone: member.phone ?? "", facebook_url: member.facebook_url ?? "", title: member.title ?? "", permissions: (member.permissions ?? []).filter(isClubPermission) });
    setFormOpen(true);
  }
  function closeForm() { setFormOpen(false); setDraft(emptyDraft); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    setBusy(true); setError(""); setNotice("");
    // Chỉ Chủ nhiệm được gửi quyền chức năng; Ban chủ chốt không có quyền này nên bỏ trường đó.
    const { permissions, team_ids: teamIds, initial_team_ids: initialTeamIds, ...rest } = draft;
    // Chỉ gửi tập ban khi thật sự đổi, để không ghi đè ban vừa được thêm ở nơi khác (import, người khác) sau khi mở form.
    const teamsDirty = !draft.id || teamIds.join() !== (initialTeamIds ?? []).join();
    const result = await requestJson<object>("/api/admin/club-members", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId, ...rest, ...(staffLocked || !teamsDirty ? {} : { team_ids: teamIds }), ...(isHead ? { permissions: draft.role === "admin" ? permissions : [] } : {}) }),
    }, "Không lưu được thành viên.");
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    closeForm();
    setNotice(draft.id ? "Đã cập nhật thành viên." : "Đã thêm thành viên vào CLB.");
    notifyMembersChanged();
  }

  async function remove(member: Member) {
    setBusy(true); setError(""); setNotice(""); setConfirming(null);
    const result = await requestJson<object>(`/api/admin/club-members?clubId=${encodeURIComponent(clubId)}&id=${encodeURIComponent(member.id)}`, { method: "DELETE" }, "Không xóa được thành viên.");
    setBusy(false);
    // 409: thành viên đã có lịch sử việc, máy chủ không cho xóa. Gợi ý tạm khóa để giữ lịch sử.
    if (result.status === 409) setError(result.error || "Thành viên đã có lịch sử việc. Hãy tạm khóa (bỏ tick Đang hoạt động) thay vì xóa để giữ lịch sử.");
    else if (!result.ok) setError(result.error);
    else { setNotice("Đã xóa thành viên khỏi CLB."); if (draft.id === member.id) closeForm(); notifyMembersChanged(); }
  }

  const needAccount = members.filter((member) => member.is_active && member.email && !member.user_id);

  async function createAccounts() {
    if (!needAccount.length) return;
    setConfirming(null);
    setBulkBusy(true); setError(""); setNotice(""); setBulkResults([]);
    const result = await requestJson<{ data: { results: BulkResult[] } }>("/api/admin/accounts/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubId, memberIds: needAccount.map((member) => member.id) }) }, "Không tạo được tài khoản hàng loạt.");
    setBulkBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setBulkResults(result.data.data?.results ?? []);
    notifyMembersChanged();
  }

  const memberName = (id: string) => members.find((member) => member.id === id)?.full_name ?? "Thành viên";
  const editing = draft.id ? members.find((member) => member.id === draft.id) : undefined;
  // Chủ nhiệm không xóa được; dòng Ban chủ nhiệm/chủ chốt chỉ Chủ nhiệm xóa (server cũng chặn).
  const canRemoveEditing = canWrite && !!editing && !editing.is_head && (isHead || editing.role === "member");

  const memberForm = <form onSubmit={save} className="space-y-4">
    {staffLocked && <Notice tone="warning" className="mb-0!">Chỉ Chủ nhiệm được sửa thông tin của thành viên Ban chủ nhiệm/Ban chủ chốt. Bạn chỉ xem được hồ sơ này.</Notice>}
    <fieldset disabled={staffLocked} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <Field label="Họ và tên"><input required maxLength={200} value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} className={inputClass} data-autofocus /></Field>
      <Field label="Mã sinh viên"><input maxLength={100} value={draft.student_code} onChange={(event) => setDraft({ ...draft, student_code: event.target.value })} className={inputClass} /></Field>
      <Field label="Lớp"><input maxLength={100} value={draft.class_name} onChange={(event) => setDraft({ ...draft, class_name: event.target.value })} className={inputClass} /></Field>
      <Field label="Chức danh"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={inputClass} placeholder="Ví dụ: Trưởng ban Truyền thông" /></Field>
      <Field label="Email"><input type="email" autoComplete="off" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className={inputClass} placeholder="ten@vi-du.vn" /></Field>
      <Field label="Số điện thoại"><input type="tel" autoComplete="off" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} className={inputClass} /></Field>
      <Field label="Link Facebook" className="sm:col-span-2"><input type="url" autoComplete="off" value={draft.facebook_url} onChange={(event) => setDraft({ ...draft, facebook_url: event.target.value })} className={inputClass} placeholder="https://facebook.com/…" /></Field>
      <fieldset className="min-w-0 text-sm sm:col-span-2"><legend className="font-medium text-zinc-800">Ban ({draft.team_ids.length} đã chọn)</legend>
        <p id="member-teams-hint" className="mt-1 text-xs text-zinc-500">Chọn một hoặc nhiều ban. Ban chính (mặc định là ban chọn đầu tiên) là ban dùng để phân quyền quản lý.</p>
        {teams.length ? <ul aria-describedby="member-teams-hint" className={`mt-2 max-h-52 divide-y divide-zinc-100 overflow-y-auto border-y border-zinc-100 ${staffLocked ? "text-zinc-500" : ""}`}>{teams.map((team) => {
          const checked = draft.team_ids.includes(team.id);
          return <li key={team.id} className="flex items-center justify-between gap-2 py-2">
            <label className="flex min-w-0 cursor-pointer items-center gap-2"><input type="checkbox" checked={checked} onChange={(event) => setDraft({ ...draft, team_ids: event.target.checked ? [...draft.team_ids, team.id] : draft.team_ids.filter((id) => id !== team.id) })} className="shrink-0 accent-emerald-700" /><span className="min-w-0 break-words">{team.name}</span></label>
            {checked && <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-zinc-600"><input type="radio" name="primary-team" aria-label={`Đặt ${team.name} làm ban chính`} checked={draft.team_ids[0] === team.id} onChange={() => setDraft({ ...draft, team_ids: [team.id, ...draft.team_ids.filter((id) => id !== team.id)] })} className="accent-emerald-700" />Ban chính</label>}
          </li>;
        })}</ul> : <p className="mt-2 text-xs text-zinc-500">CLB chưa có ban nào. Hãy tạo ban ở mục Ban trước.</p>}
      </fieldset>
      <Field label="Vai trò trong CLB" hint="Vai trò Ban chủ nhiệm/Ban chủ chốt nên đổi qua mục Nhiệm kỳ khi sang nhiệm kỳ mới. Chỉ Chủ nhiệm được đổi vai trò và cấp quyền chức năng." className="sm:col-span-2"><select disabled={!isHead} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value, permissions: event.target.value === "admin" ? draft.permissions : [] })} className={inputClass}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      {draft.role === "admin" && <fieldset className="min-w-0 text-sm sm:col-span-2"><legend className="font-medium text-zinc-800">Quyền chức năng</legend><div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">{CLUB_PERMISSIONS.map((permission) => <label key={permission.code} className="flex cursor-pointer items-center gap-2"><input type="checkbox" disabled={!isHead} checked={draft.permissions.includes(permission.code)} onChange={(event) => setDraft({ ...draft, permissions: event.target.checked ? [...new Set([...draft.permissions, permission.code])] : draft.permissions.filter((item) => item !== permission.code) })} className="accent-emerald-700" /> {permission.label}</label>)}</div>{!isHead && <p className="mt-1 text-xs text-zinc-500">Chỉ Chủ nhiệm được cấp hoặc gỡ quyền.</p>}</fieldset>}
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} className="accent-emerald-700" /> Thành viên đang hoạt động</label>
    </fieldset>
    {!canWrite && <p className="text-xs text-amber-800">Bạn chưa được cấp quyền Quản lý thành viên nên chỉ xem được danh sách.</p>}
    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
      <Button type="submit" variant="primary" disabled={!canWrite || staffLocked} loading={busy}>{busy ? "Đang lưu…" : draft.id ? "Lưu thay đổi" : "Thêm thành viên"}</Button>
      <Button onClick={closeForm}>Hủy</Button>
      {canRemoveEditing && editing && <Button variant="danger" icon="trash" className="sm:ml-auto" disabled={busy} onClick={() => setConfirming({ kind: "remove", member: editing })}>Xóa thành viên</Button>}
    </div>
  </form>;

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <PageHeader title="Thành viên" description="Danh sách chỉ bao gồm thành viên thuộc CLB đang chọn." actions={canWrite && <>
      <MemberImportDialog clubId={clubId} disabled={loading || busy || bulkBusy} onError={(message) => { setNotice(""); setError(message); }} onImported={(message) => { setError(""); setNotice(message); }} />
      <Button variant="primary" icon="plus" onClick={() => { if (!(formOpen && !draft.id)) openCreate(); }} aria-expanded={formOpen && !draft.id}>Thêm thành viên</Button>
    </>} />
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {canWrite && needAccount.length > 0 && <Notice tone="warning" action={<Button size="sm" disabled={bulkBusy} onClick={() => setConfirming({ kind: "accounts" })}>{bulkBusy ? "Đang tạo tài khoản…" : "Tạo tài khoản cho thành viên có email"}</Button>}>{needAccount.length} thành viên đang hoạt động có email nhưng chưa có tài khoản. Không gửi email; thành viên đăng nhập bằng Google.</Notice>}
    {bulkResults.length > 0 && <Panel title="Kết quả tạo tài khoản" className="mb-5" padded={false}><ul aria-label="Kết quả tạo tài khoản" className="divide-y divide-zinc-100 text-sm">{bulkResults.map((row) => <li key={row.memberId} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 sm:px-5"><span className="font-medium">{memberName(row.memberId)}</span><span className={row.status === "error" ? "text-rose-700" : row.status === "skipped" ? "text-zinc-500" : "text-emerald-700"}>{bulkStatusLabel[row.status] ?? row.status}{row.message ? ` · ${row.message}` : ""}</span></li>)}</ul></Panel>}
    <CreatePanel open={formOpen} title={draft.id ? "Cập nhật thành viên" : "Thêm thành viên"} onClose={closeForm}>{memberForm}</CreatePanel>
    <Panel title={`Thành viên (${shownMembers.length}${shownMembers.length !== members.length ? `/${members.length}` : ""})`} padded={false} actions={<Button variant="ghost" size="sm" icon="refresh" onClick={() => void load()}>Làm mới</Button>}>
      <div className="relative border-b border-zinc-100 px-4 py-3 sm:px-5">
        <Icon name="search" className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-zinc-400 sm:left-8" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Tìm thành viên" className={`${inputClass} pl-9`} placeholder="Gõ tên, mã sinh viên hoặc email" />
      </div>
      {loading ? <div role="status" aria-label="Đang tải thành viên" className="space-y-3 p-4 sm:p-5">{[0, 1, 2, 3].map((index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-zinc-100" />)}</div>
        : shownMembers.length ? <ul className="divide-y divide-zinc-100">{shownMembers.map((member) => <li key={member.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0 text-xs text-zinc-500">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="min-w-0 break-words text-sm font-medium text-zinc-900">{member.full_name}</span>{member.title && <span>{member.title}</span>}
              {member.role === "owner" ? <>{member.is_head && <span className="rounded-full bg-emerald-700 px-2 py-0.5 font-semibold text-white">Chủ nhiệm</span>}<span className={chip}>Toàn quyền</span></>
                : member.role === "admin" && ((member.permissions ?? []).filter(isClubPermission).length ? CLUB_PERMISSIONS.filter((permission) => member.permissions?.includes(permission.code)).map((permission) => <span key={permission.code} className={chip}>{permission.label}</span>) : <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">Chưa có quyền chức năng</span>)}
              {!member.is_active && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">Đã tạm khóa</span>}</p>
            <p className="mt-1">{[member.student_code, member.class_name, teamIdsOf(member).map((id) => teams.find((team) => team.id === id)?.name).filter(Boolean).join(", "), roleLabel(member.role)].filter(Boolean).join(" · ")}</p>
            <p className="mt-0.5 break-words">{[member.email, member.phone].filter(Boolean).join(" · ")}{member.facebook_url && /^https:\/\//i.test(member.facebook_url) && <>{member.email || member.phone ? " · " : ""}<a href={member.facebook_url} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-800 underline">Facebook</a></>}{(member.email || member.phone || member.facebook_url) ? " · " : ""}{member.user_id ? <span className="text-emerald-700">Đã gán tài khoản</span> : <span className="text-zinc-500">Chưa gán tài khoản</span>}</p>
          </div>
          {canWrite && <Button variant="secondary" size="sm" icon="edit" className="self-start sm:self-center" aria-label={`Sửa ${member.full_name}`} onClick={() => openEdit(member)}>Sửa</Button>}
        </li>)}</ul>
        : <EmptyState title={members.length ? "Không có thành viên khớp với từ khóa." : "CLB chưa có thành viên."} action={!members.length && canWrite ? <Button variant="primary" icon="plus" onClick={openCreate}>Thêm thành viên</Button> : undefined} />}
    </Panel>
    {confirming && <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="members-confirm-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl outline-none">
        {confirming.kind === "remove" ? <>
          <h2 id="members-confirm-title" className="break-words text-lg font-semibold">Xóa {confirming.member.full_name} khỏi CLB?</h2>
          <p className="mt-3 text-sm text-zinc-700">Nếu còn được gán hỗ trợ phỏng vấn hoặc đã có lịch sử việc, hãy tạm ngừng hoạt động thay vì xóa. Tài khoản đăng nhập (nếu có) sẽ được giữ lại.</p>
        </> : <>
          <h2 id="members-confirm-title" className="text-lg font-semibold">Tạo tài khoản cho {needAccount.length} thành viên?</h2>
          <p className="mt-3 text-sm text-zinc-700">Chỉ áp dụng cho thành viên có email nhưng chưa có tài khoản. Hệ thống không gửi email; thành viên đăng nhập bằng Google với đúng email này.</p>
        </>}
        <div className="mt-5 flex justify-end gap-2"><Button data-autofocus onClick={() => setConfirming(null)}>Hủy</Button>{confirming.kind === "remove"
          ? <Button variant="danger" className="border border-rose-300" onClick={() => void remove(confirming.member)}>Xóa thành viên</Button>
          : <Button variant="primary" onClick={() => void createAccounts()}>Tạo tài khoản</Button>}</div>
      </div>
    </div>}
  </section>;
}
