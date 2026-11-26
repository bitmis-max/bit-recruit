"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useCurrentAdminClub } from "./AdminClubContext";
import { roleLabel } from "./roles";
import { notifyMembersChanged, requestJson, useReloadOnAdminChange } from "./adminClient";

type AccountRow = { memberId: string; memberName: string; role: string; account: { id: string; email: string; fullName: string } | null };
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";

export function ClubAccountsManager() {
  const { id: clubId, role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [memberId, setMemberId] = useState("");
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await requestJson<{ accounts: AccountRow[] }>(`/api/admin/accounts?clubId=${encodeURIComponent(clubId)}`, undefined, "Không tải được tài khoản.");
    if (!result.ok) setError(result.error);
    else { setRows(result.data.accounts ?? []); setError(""); }
    setLoading(false);
  }, [clubId]);

  useEffect(() => { void load(); }, [load]);
  // Thành viên đổi ở màn khác (thêm, xóa, khóa, import, nhiệm kỳ): tải lại danh sách.
  useReloadOnAdminChange(() => void load());

  async function assign(mode: "invite" | "link" | "create") {
    setBusy(true); setError(""); setNotice("");
    const result = await requestJson<object>("/api/admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubId, memberId, email, mode }) }, "Không gán được tài khoản.");
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setMemberId(""); setEmail(""); setNotice(mode === "invite" ? "Đã gửi email mời tạo tài khoản và gán vào thành viên." : mode === "create" ? "Đã tạo tài khoản và gán vào thành viên. Thành viên đăng nhập bằng Google với email này." : "Đã gán tài khoản hiện có vào thành viên."); notifyMembersChanged();
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing?.account) return;
    setBusy(true); setError("");
    const result = await requestJson<object>("/api/admin/accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubId, accountId: editing.account.id, email: editEmail, fullName: editName }) }, "Không cập nhật được tài khoản.");
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setEditing(null); setNotice("Đã cập nhật tài khoản."); notifyMembersChanged();
  }

  async function unlink(row: AccountRow) {
    if (!row.account || !confirm(`Gỡ tài khoản ${row.account.email} khỏi CLB này? Tài khoản đăng nhập vẫn được giữ nguyên.`)) return;
    const result = await requestJson<object>(`/api/admin/accounts?clubId=${encodeURIComponent(clubId)}&accountId=${encodeURIComponent(row.account.id)}`, { method: "DELETE" }, "Không gỡ được tài khoản.");
    if (!result.ok) setError(result.error);
    else { setNotice("Đã gỡ liên kết tài khoản khỏi CLB."); notifyMembersChanged(); }
  }

  const unassigned = rows.filter((row) => !row.account);
  const linked = rows.filter((row) => row.account);

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <header className="mb-6"><p className="text-sm font-semibold text-emerald-700">Không gian CLB</p><h1 className="mt-1 text-3xl font-bold">Quản lý tài khoản</h1><p className="mt-2 text-sm text-zinc-600">Tài khoản được liên kết với thành viên của CLB đang chọn.</p></header>
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <form onSubmit={(event) => { event.preventDefault(); void assign("create"); }} className="mb-6 grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <label className="text-sm">Thành viên chưa có tài khoản<select required value={memberId} onChange={(event) => setMemberId(event.target.value)} className={inputClass}><option value="">Chọn thành viên</option>{unassigned.map((row) => <option key={row.memberId} value={row.memberId}>{row.memberName} · {roleLabel(row.role)}</option>)}</select></label>
      <label className="text-sm">Email tài khoản<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder="ten@vi-du.vn" /></label>
      <button type="submit" disabled={!canWrite || busy || !unassigned.length} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Tạo tài khoản (đăng nhập bằng Google)</button>
      <p className="text-xs text-zinc-500 md:col-span-3">Mặc định là “Tạo tài khoản”: không gửi email, thành viên đăng nhập bằng Google với đúng email này (Enter trong ô email cũng làm việc này). Nếu email đã có tài khoản, dùng “Gán tài khoản hiện có”. “Gửi lời mời & gán” sẽ gửi email mời thật.</p>
      <div className="flex flex-wrap gap-4 md:col-span-3"><button type="button" disabled={!canWrite || busy || !memberId || !email} onClick={() => void assign("invite")} className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">Gửi lời mời & gán</button>
      <button type="button" disabled={!canWrite || busy || !memberId || !email} onClick={() => void assign("link")} className="w-fit text-sm font-semibold text-emerald-800 disabled:opacity-50">Gán tài khoản hiện có</button></div>
    </form>
    {!canWrite && <p className="mb-4 text-sm text-amber-800">Vai trò hiện tại chỉ có quyền xem.</p>}
    {editing && <form onSubmit={(event) => void saveEdit(event)} className="mb-6 grid gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 md:grid-cols-2">
      <div className="md:col-span-2"><h2 className="font-semibold">Cập nhật tài khoản: {editing.memberName}</h2><p className="mt-1 text-xs text-emerald-900/70">Tên và email là thông tin của tài khoản dùng chung.</p></div>
      <label className="text-sm">Họ và tên<input required value={editName} onChange={(event) => setEditName(event.target.value)} className={inputClass} /></label>
      <label className="text-sm">Email<input required type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} className={inputClass} /></label>
      <div className="flex gap-2 md:col-span-2"><button disabled={busy} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white">Lưu tài khoản</button><button type="button" onClick={() => setEditing(null)} className="rounded-lg border bg-white px-4 py-2 text-sm">Hủy</button></div>
    </form>}
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="flex items-center justify-between border-b p-4"><h2 className="font-semibold">Tài khoản đã gán ({linked.length})</h2><button type="button" onClick={() => void load()} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Làm mới</button></div>
      {loading ? <p className="p-6 text-sm text-zinc-500">Đang tải tài khoản…</p> : linked.length ? <ul className="divide-y divide-zinc-100">{linked.map((row) => <li key={row.memberId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><p className="truncate font-medium">{row.account?.fullName || row.memberName}</p><p className="truncate text-sm text-zinc-600">{row.account?.email}</p><p className="mt-1 text-xs text-zinc-500">Thành viên: {row.memberName} · {roleLabel(row.role)}</p></div>
        {canWrite && row.account && <div className="flex shrink-0 gap-2"><button type="button" onClick={() => { setEditing(row); setEditName(row.account?.fullName ?? row.memberName); setEditEmail(row.account?.email ?? ""); }} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100">Sửa</button><button type="button" onClick={() => void unlink(row)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100">Gỡ khỏi CLB</button></div>}
      </li>)}</ul> : <p className="p-6 text-sm text-zinc-500">Chưa có tài khoản nào được gán cho thành viên CLB.</p>}
    </div>
  </section>;
}
