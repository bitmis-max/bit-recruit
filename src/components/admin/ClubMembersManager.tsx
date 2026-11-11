"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useCurrentAdminClub } from "./AdminClubContext";
import { MemberImportDialog } from "./MemberImportDialog";
import { roleLabel, roleLabels } from "./roles";
import { CLUB_PERMISSIONS, isClubPermission } from "../../lib/admin/permissions";

type Member = { id: string; full_name: string; student_code: string | null; class_name: string | null; team_id: string | null; role: string; is_active: boolean; user_id: string | null; email: string | null; phone: string | null; facebook_url: string | null; title: string | null; permissions: string[] | null; is_head: boolean | null };
type Team = { id: string; name: string };
type Draft = { id?: string; full_name: string; student_code: string; class_name: string; team_id: string; role: string; is_active: boolean; email: string; phone: string; facebook_url: string; title: string; permissions: string[] };
type BulkResult = { memberId: string; status: "created" | "linked" | "skipped" | "error"; message?: string };
const emptyDraft: Draft = { full_name: "", student_code: "", class_name: "", team_id: "", role: "member", is_active: true, email: "", phone: "", facebook_url: "", title: "", permissions: [] };
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";
const bulkStatusLabel: Record<BulkResult["status"], string> = { created: "Đã tạo tài khoản", linked: "Đã gắn tài khoản có sẵn", skipped: "Bỏ qua", error: "Lỗi" };

export function ClubMembersManager() {
  const { id: clubId, isHead, can } = useCurrentAdminClub();
  const canWrite = can("members");
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<{ kind: "remove"; member: Member } | { kind: "accounts" } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (confirming) cancelRef.current?.focus(); }, [confirming]);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/admin/club-members?clubId=${encodeURIComponent(clubId)}`);
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "Không tải được thành viên.");
    else { setMembers(result.members ?? []); setTeams(result.teams ?? []); setError(""); }
    setLoading(false);
  }, [clubId]);

  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    setBusy(true); setError(""); setNotice("");
    // Chỉ Chủ nhiệm được gửi quyền chức năng; Ban chủ chốt không có quyền này nên bỏ trường đó.
    const { permissions, ...rest } = draft;
    const response = await fetch("/api/admin/club-members", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId, ...rest, ...(isHead ? { permissions: draft.role === "admin" ? permissions : [] } : {}) }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) { setError(result.error ?? "Không lưu được thành viên."); return; }
    setDraft(emptyDraft);
    setNotice(draft.id ? "Đã cập nhật thành viên." : "Đã thêm thành viên vào CLB.");
    await load();
  }

  async function remove(member: Member) {
    setBusy(true); setError(""); setNotice(""); setConfirming(null);
    const response = await fetch(`/api/admin/club-members?clubId=${encodeURIComponent(clubId)}&id=${encodeURIComponent(member.id)}`, { method: "DELETE" });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) setError(result.error ?? "Không xóa được thành viên.");
    else { setNotice("Đã xóa thành viên khỏi CLB."); await load(); }
  }

  const needAccount = members.filter((member) => member.is_active && member.email && !member.user_id);

  async function createAccounts() {
    if (!needAccount.length) return;
    setConfirming(null);
    setBulkBusy(true); setError(""); setNotice(""); setBulkResults([]);
    const response = await fetch("/api/admin/accounts/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubId, memberIds: needAccount.map((member) => member.id) }) });
    const result = await response.json();
    setBulkBusy(false);
    if (!response.ok) { setError(result.error ?? "Không tạo được tài khoản hàng loạt."); return; }
    setBulkResults(result.data?.results ?? []);
    await load();
  }

  const memberName = (id: string) => members.find((member) => member.id === id)?.full_name ?? "Thành viên";

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <header className="mb-6"><p className="text-sm font-semibold text-emerald-700">Không gian CLB</p><h1 className="mt-1 text-3xl font-bold">Quản lý thành viên</h1><p className="mt-2 text-sm text-zinc-600">Danh sách chỉ bao gồm thành viên thuộc CLB đang chọn.</p></header>
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <form onSubmit={save} className="space-y-4 rounded-xl border bg-white p-5">
        <div><h2 className="font-semibold">{draft.id ? "Cập nhật thành viên" : "Thêm thành viên"}</h2><p className="mt-1 text-xs text-zinc-500">Vai trò Ban chủ nhiệm/Ban chủ chốt nên đổi qua mục Nhiệm kỳ khi sang nhiệm kỳ mới. Chỉ Chủ nhiệm được đổi vai trò và cấp quyền chức năng.</p></div>
        <label className="block text-sm">Họ và tên<input required value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} className={inputClass} /></label>
        <label className="block text-sm">Mã sinh viên<input value={draft.student_code} onChange={(event) => setDraft({ ...draft, student_code: event.target.value })} className={inputClass} /></label>
        <label className="block text-sm">Lớp<input value={draft.class_name} onChange={(event) => setDraft({ ...draft, class_name: event.target.value })} className={inputClass} /></label>
        <label className="block text-sm">Email<input type="email" autoComplete="off" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className={inputClass} placeholder="ten@vi-du.vn" /></label>
        <label className="block text-sm">Số điện thoại<input type="tel" autoComplete="off" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} className={inputClass} /></label>
        <label className="block text-sm">Link Facebook<input type="url" autoComplete="off" value={draft.facebook_url} onChange={(event) => setDraft({ ...draft, facebook_url: event.target.value })} className={inputClass} placeholder="https://facebook.com/…" /></label>
        <label className="block text-sm">Ban<select value={draft.team_id} onChange={(event) => setDraft({ ...draft, team_id: event.target.value })} className={inputClass}><option value="" disabled>Chọn ban</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label className="block text-sm">Chức danh<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={inputClass} placeholder="Ví dụ: Trưởng ban Truyền thông" /></label>
        <label className="block text-sm">Vai trò trong CLB<select disabled={!isHead} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value, permissions: event.target.value === "admin" ? draft.permissions : [] })} className={`${inputClass} disabled:bg-zinc-100`}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{!isHead && <span className="mt-1 block text-xs text-zinc-500">Chỉ Chủ nhiệm được đổi vai trò.</span>}</label>
        {draft.role === "admin" && <fieldset className="text-sm"><legend className="font-medium">Quyền chức năng</legend><div className="mt-1 space-y-1">{CLUB_PERMISSIONS.map((permission) => <label key={permission.code} className="flex cursor-pointer items-center gap-2"><input type="checkbox" disabled={!isHead} checked={draft.permissions.includes(permission.code)} onChange={(event) => setDraft({ ...draft, permissions: event.target.checked ? [...new Set([...draft.permissions, permission.code])] : draft.permissions.filter((item) => item !== permission.code) })} /> {permission.label}</label>)}</div>{!isHead && <p className="mt-1 text-xs text-zinc-500">Chỉ Chủ nhiệm được cấp hoặc gỡ quyền.</p>}</fieldset>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} /> Thành viên đang hoạt động</label>
        <div className="flex gap-2"><button disabled={!canWrite || busy} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Đang lưu…" : draft.id ? "Lưu thay đổi" : "Thêm thành viên"}</button>{draft.id && <button type="button" onClick={() => setDraft(emptyDraft)} className="rounded-lg border px-4 py-2 text-sm">Hủy</button>}</div>
        {!canWrite && <p className="text-xs text-amber-800">Bạn chưa được cấp quyền Quản lý thành viên nên chỉ xem được danh sách.</p>}
      </form>

      <div className="space-y-4">
        {canWrite && <div className="rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Tài khoản đăng nhập</h2><p className="mt-1 text-xs text-zinc-500">{needAccount.length} thành viên đang hoạt động có email nhưng chưa có tài khoản. Không gửi email; thành viên đăng nhập bằng Google.</p></div><button type="button" disabled={bulkBusy || !needAccount.length} onClick={() => setConfirming({ kind: "accounts" })} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{bulkBusy ? "Đang tạo tài khoản…" : "Tạo tài khoản cho thành viên có email"}</button></div>
          {bulkResults.length > 0 && <ul aria-label="Kết quả tạo tài khoản" className="mt-3 divide-y divide-zinc-100 rounded-lg border text-sm">{bulkResults.map((row) => <li key={row.memberId} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"><span className="font-medium">{memberName(row.memberId)}</span><span className={row.status === "error" ? "text-rose-700" : row.status === "skipped" ? "text-zinc-500" : "text-emerald-700"}>{bulkStatusLabel[row.status] ?? row.status}{row.message ? ` · ${row.message}` : ""}</span></li>)}</ul>}
        </div>}
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="flex items-center justify-between border-b p-4"><h2 className="font-semibold">Thành viên ({members.length})</h2><div className="flex gap-2">{canWrite && <MemberImportDialog clubId={clubId} disabled={loading || busy || bulkBusy} onError={(message) => { setNotice(""); setError(message); }} onImported={async (message) => { setError(""); setNotice(message); await load(); }} />}<button type="button" onClick={() => void load()} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Làm mới</button></div></div>
          {loading ? <p className="p-6 text-sm text-zinc-500">Đang tải thành viên…</p> : members.length ? <ul className="divide-y divide-zinc-100">{members.map((member) => <li key={member.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="truncate font-medium">{member.full_name}{member.title && <span className="ml-2 text-xs font-normal text-zinc-500">{member.title}</span>}</p><p className="mt-1 text-xs text-zinc-500">{[member.student_code, member.class_name, teams.find((team) => team.id === member.team_id)?.name, roleLabel(member.role)].filter(Boolean).join(" · ")}</p>{member.role === "owner" ? <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">{member.is_head && <span className="rounded-full bg-emerald-700 px-2 py-0.5 font-semibold text-white">Chủ nhiệm</span>}<span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">Toàn quyền</span></p> : member.role === "admin" && <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">{(member.permissions ?? []).filter(isClubPermission).length ? CLUB_PERMISSIONS.filter((permission) => member.permissions?.includes(permission.code)).map((permission) => <span key={permission.code} className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">{permission.label}</span>) : <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">Chưa có quyền chức năng</span>}</p>}{(member.email || member.phone || member.facebook_url) && <p className="mt-1 break-words text-xs text-zinc-500">{[member.email, member.phone].filter(Boolean).join(" · ")}{member.facebook_url && /^https:\/\//i.test(member.facebook_url) && <>{member.email || member.phone ? " · " : ""}<a href={member.facebook_url} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-800 underline">Facebook</a></>}</p>}<p className="mt-1 text-xs">{member.user_id ? <span className="text-emerald-700">Đã gán tài khoản</span> : <span className="text-zinc-400">Chưa gán tài khoản</span>} · {member.is_active ? "Đang hoạt động" : "Đã tạm khóa"}</p></div>
            {canWrite && <div className="flex shrink-0 gap-2"><button type="button" onClick={() => setDraft({ id: member.id, full_name: member.full_name, student_code: member.student_code ?? "", class_name: member.class_name ?? "", team_id: member.team_id ?? "", role: member.role, is_active: member.is_active, email: member.email ?? "", phone: member.phone ?? "", facebook_url: member.facebook_url ?? "", title: member.title ?? "", permissions: (member.permissions ?? []).filter(isClubPermission) })} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100">Sửa</button>{/* Chủ nhiệm không xóa được; dòng Ban chủ nhiệm/chủ chốt chỉ Chủ nhiệm xóa (server cũng chặn). */}{!member.is_head && (isHead || member.role === "member") && <button type="button" onClick={() => setConfirming({ kind: "remove", member })} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100">Xóa</button>}</div>}
          </li>)}</ul> : <p className="p-6 text-sm text-zinc-500">CLB chưa có thành viên.</p>}
        </div>
      </div>
    </div>
    {confirming && <div role="presentation" onKeyDown={(event) => { if (event.key === "Escape") setConfirming(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="members-confirm-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        {confirming.kind === "remove" ? <>
          <h2 id="members-confirm-title" className="break-words text-lg font-bold">Xóa {confirming.member.full_name} khỏi CLB?</h2>
          <p className="mt-3 text-sm text-zinc-700">Nếu còn được gán hỗ trợ phỏng vấn, hãy tạm ngừng hoạt động thay vì xóa. Tài khoản đăng nhập (nếu có) sẽ được giữ lại.</p>
        </> : <>
          <h2 id="members-confirm-title" className="text-lg font-bold">Tạo tài khoản cho {needAccount.length} thành viên?</h2>
          <p className="mt-3 text-sm text-zinc-700">Chỉ áp dụng cho thành viên có email nhưng chưa có tài khoản. Hệ thống không gửi email; thành viên đăng nhập bằng Google với đúng email này.</p>
        </>}
        <div className="mt-5 flex justify-end gap-2"><button ref={cancelRef} type="button" onClick={() => setConfirming(null)} className="rounded-lg border px-4 py-2 text-sm font-medium">Hủy</button>{confirming.kind === "remove"
          ? <button type="button" onClick={() => void remove(confirming.member)} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white">Xóa thành viên</button>
          : <button type="button" onClick={() => void createAccounts()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Tạo tài khoản</button>}</div>
      </div>
    </div>}
  </section>;
}
