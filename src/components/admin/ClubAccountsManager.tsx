"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useCurrentAdminClub } from "./AdminClubContext";
import { roleLabel } from "./roles";
import { notifyMembersChanged, requestJson, useReloadOnAdminChange } from "./adminClient";
import { Button } from "./ui/Button";
import { CreatePanel } from "./ui/CreatePanel";
import { EmptyState } from "./ui/EmptyState";
import { Field, inputClass } from "./ui/Field";
import { Notice } from "./ui/Notice";
import { PageHeader } from "./ui/PageHeader";
import { Panel } from "./ui/Panel";

type AccountRow = { memberId: string; memberName: string; role: string; account: { id: string; email: string; fullName: string } | null };

export function ClubAccountsManager() {
  const { id: clubId, role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [creating, setCreating] = useState(false);
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
    setMemberId(""); setEmail(""); setCreating(false); setNotice(mode === "invite" ? "Đã gửi email mời tạo tài khoản và gán vào thành viên." : mode === "create" ? "Đã tạo tài khoản và gán vào thành viên. Thành viên đăng nhập bằng Google với email này." : "Đã gán tài khoản hiện có vào thành viên."); notifyMembersChanged();
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
    else { setEditing(null); setNotice("Đã gỡ liên kết tài khoản khỏi CLB."); notifyMembersChanged(); }
  }

  function openCreate() { setEditing(null); setCreating(true); setError(""); setNotice(""); }
  function openEdit(row: AccountRow) { setCreating(false); setEditing(row); setEditName(row.account?.fullName ?? row.memberName); setEditEmail(row.account?.email ?? ""); }

  const unassigned = rows.filter((row) => !row.account);
  const linked = rows.filter((row) => row.account);

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <PageHeader title="Tài khoản" description="Tài khoản được liên kết với thành viên của CLB đang chọn." actions={canWrite && <Button variant="primary" icon="plus" onClick={() => { if (!creating) openCreate(); }} aria-expanded={creating}>Tạo tài khoản</Button>} />
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {!canWrite && <Notice tone="warning">Vai trò hiện tại chỉ có quyền xem.</Notice>}
    <CreatePanel open={creating} title="Tạo tài khoản cho thành viên" onClose={() => setCreating(false)}>
      <form onSubmit={(event) => { event.preventDefault(); void assign("create"); }} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Thành viên chưa có tài khoản" hint={unassigned.length ? undefined : "Mọi thành viên đã có tài khoản."}><select required value={memberId} onChange={(event) => setMemberId(event.target.value)} className={inputClass} data-autofocus><option value="">Chọn thành viên</option>{unassigned.map((row) => <option key={row.memberId} value={row.memberId}>{row.memberName} · {roleLabel(row.role)}</option>)}</select></Field>
          <Field label="Email tài khoản"><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder="ten@vi-du.vn" /></Field>
        </div>
        <p className="max-w-3xl text-xs text-zinc-500">Mặc định là “Tạo tài khoản”: không gửi email, thành viên đăng nhập bằng Google với đúng email này (Enter trong ô email cũng làm việc này). Nếu email đã có tài khoản, dùng “Gán tài khoản hiện có”. “Gửi lời mời & gán” sẽ gửi email mời thật.</p>
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
          <Button type="submit" variant="primary" disabled={!canWrite || !unassigned.length} loading={busy}>Tạo tài khoản (đăng nhập bằng Google)</Button>
          <Button disabled={!canWrite || busy || !memberId || !email} onClick={() => void assign("link")}>Gán tài khoản hiện có</Button>
          <Button variant="ghost" disabled={!canWrite || busy || !memberId || !email} onClick={() => void assign("invite")}>Gửi lời mời & gán</Button>
        </div>
      </form>
    </CreatePanel>
    <CreatePanel open={!!editing} title={editing ? `Cập nhật tài khoản: ${editing.memberName}` : ""} onClose={() => setEditing(null)}>
      <form onSubmit={(event) => void saveEdit(event)} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Họ và tên" hint="Tên và email là thông tin của tài khoản dùng chung."><input required value={editName} onChange={(event) => setEditName(event.target.value)} className={inputClass} data-autofocus /></Field>
          <Field label="Email"><input required type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} className={inputClass} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
          <Button type="submit" variant="primary" loading={busy}>{busy ? "Đang lưu…" : "Lưu tài khoản"}</Button>
          <Button onClick={() => setEditing(null)}>Hủy</Button>
          {canWrite && editing && <Button variant="danger" className="sm:ml-auto" disabled={busy} onClick={() => void unlink(editing)}>Gỡ khỏi CLB</Button>}
        </div>
      </form>
    </CreatePanel>
    <Panel title={`Tài khoản đã gán (${linked.length})`} padded={false} actions={<Button variant="ghost" size="sm" icon="refresh" onClick={() => void load()}>Làm mới</Button>}>
      {loading ? <div role="status" aria-label="Đang tải tài khoản" className="space-y-3 p-4 sm:p-5">{[0, 1, 2].map((index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-zinc-100" />)}</div>
        : linked.length ? <ul className="divide-y divide-zinc-100">{linked.map((row) => <li key={row.memberId} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{row.account?.fullName || row.memberName}</p><p className="truncate text-sm text-zinc-600">{row.account?.email}</p><p className="mt-0.5 text-xs text-zinc-500">Thành viên: {row.memberName} · {roleLabel(row.role)}</p></div>
          {canWrite && row.account && <Button variant="secondary" size="sm" icon="edit" className="self-start sm:self-center" aria-label={`Sửa tài khoản của ${row.memberName}`} onClick={() => openEdit(row)}>Sửa</Button>}
        </li>)}</ul>
        : <EmptyState title="Chưa có tài khoản nào được gán cho thành viên CLB." action={canWrite && unassigned.length > 0 ? <Button variant="primary" icon="plus" onClick={openCreate}>Tạo tài khoản</Button> : undefined} />}
    </Panel>
  </section>;
}
