"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabase/client";
import { friendlyError } from "../../lib/ui/friendly-error";
import { notifyMembersChanged, useReloadOnAdminChange } from "./adminClient";
import { useDialog } from "./useDialog";
import { useCurrentAdminClub } from "./AdminClubContext";
import { roleLabel } from "./roles";
import { CLUB_PERMISSIONS, isClubPermission } from "../../lib/admin/permissions";
import { Button } from "./ui/Button";
import { CreatePanel } from "./ui/CreatePanel";
import { EmptyState } from "./ui/EmptyState";
import { Field, inputClass } from "./ui/Field";
import { Notice } from "./ui/Notice";
import { PageHeader } from "./ui/PageHeader";
import { Panel } from "./ui/Panel";

type Term = { id: string; name: string; start_date: string | null; end_date: string | null; status: "draft" | "active" | "ended"; activated_at: string | null; created_at: string };
type TermRole = { member_id: string; role: "owner" | "admin"; title: string; team_id: string; permissions: string[]; is_head: boolean };
type Member = { id: string; full_name: string; role: string; user_id: string | null; team_id: string | null; title: string | null; is_active: boolean; permissions: string[] | null; is_head: boolean | null };
type Team = { id: string; name: string };
const statusLabel: Record<Term["status"], string> = { draft: "Nháp", active: "Đang áp dụng", ended: "Đã kết thúc" };
const statusClass: Record<Term["status"], string> = { draft: "bg-amber-50 text-amber-800", active: "bg-emerald-50 text-emerald-800", ended: "bg-zinc-100 text-zinc-600" };
const emptyForm = { name: "", start_date: "", end_date: "" };

function formatDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN") : "—";
}

function serialize(rows: TermRole[]) {
  return JSON.stringify([...rows].map((row) => ({ ...row, permissions: [...row.permissions].sort() })).sort((a, b) => a.member_id.localeCompare(b.member_id)));
}

export function TermsManager() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const { id: clubId, role, isHead } = useCurrentAdminClub();
  const [terms, setTerms] = useState<Term[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [roles, setRoles] = useState<TermRole[]>([]);
  const [savedRoles, setSavedRoles] = useState("[]");
  const [form, setForm] = useState(emptyForm);
  const [pickMember, setPickMember] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialogRef = useDialog<HTMLDivElement>(() => { if (!busy) setConfirming(false); }, confirming);

  const load = useCallback(async () => {
    if (!supabase || !clubId) { setLoading(false); return; }
    setLoading(true);
    const [termResult, memberResult, teamResult] = await Promise.all([
      supabase.from("club_terms").select("id,name,start_date,end_date,status,activated_at,created_at").eq("club_id", clubId).order("created_at", { ascending: false }),
      supabase.from("club_members").select("id,full_name,role,user_id,team_id,title,is_active,permissions,is_head").eq("club_id", clubId).order("full_name"),
      supabase.from("teams").select("id,name").eq("club_id", clubId).order("name"),
    ]);
    const failure = termResult.error ?? memberResult.error ?? teamResult.error;
    if (failure) setError(friendlyError(failure, "Không tải được nhiệm kỳ. Vui lòng thử lại."));
    else {
      const rows = (termResult.data ?? []) as Term[];
      setTerms(rows); setMembers((memberResult.data ?? []) as Member[]); setTeams((teamResult.data ?? []) as Team[]);
      setSelectedId((current) => rows.some((term) => term.id === current) ? current : (rows.find((term) => term.status === "draft") ?? rows.find((term) => term.status === "active") ?? rows[0])?.id ?? "");
      setError("");
    }
    setLoading(false);
  }, [supabase, clubId]);

  useEffect(() => { void load(); }, [load]);
  // Thành viên hoặc ban đổi ở màn khác: tải lại danh sách để chọn người không bị cũ.
  useReloadOnAdminChange(() => void load());

  const loadRoles = useCallback(async () => {
    if (!supabase || !selectedId) { setRoles([]); setSavedRoles("[]"); return; }
    setRolesLoading(true);
    const { data, error: rolesError } = await supabase.from("club_term_roles").select("member_id,role,title,team_id,permissions,is_head").eq("term_id", selectedId);
    if (rolesError) setError(friendlyError(rolesError, "Không tải được danh sách của nhiệm kỳ."));
    else {
      const rows = ((data ?? []) as { member_id: string; role: "owner" | "admin"; title: string | null; team_id: string | null; permissions: string[] | null; is_head: boolean | null }[]).map((row) => ({ member_id: row.member_id, role: row.role, title: row.title ?? "", team_id: row.team_id ?? "", permissions: row.permissions ?? [], is_head: row.is_head === true && row.role === "owner" }));
      setRoles(rows); setSavedRoles(serialize(rows));
    }
    setRolesLoading(false);
  }, [supabase, selectedId]);

  useEffect(() => { void loadRoles(); }, [loadRoles]);

  const selected = terms.find((term) => term.id === selectedId) ?? null;
  const canEdit = isHead && selected?.status === "draft";
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const dirty = serialize(roles) !== savedRoles;
  const pickable = members.filter((member) => member.is_active && !roles.some((row) => row.member_id === member.id));
  const heads = roles.filter((row) => row.role === "owner" && row.is_head);
  const headMember = heads.length === 1 ? memberById.get(heads[0].member_id) : undefined;
  // Kích hoạt chỉ được khi có đúng một Chủ nhiệm đang hoạt động và đã có tài khoản.
  const headReady = heads.length === 1 && !!headMember?.is_active && !!headMember.user_id;
  const demoted = members.filter((member) => member.is_active && !roles.some((row) => row.member_id === member.id) && member.role !== "member");
  const droppedCount = members.filter((member) => member.is_active && !roles.some((row) => row.member_id === member.id)).length;

  // Đang sửa dở danh sách mà chuyển nhiệm kỳ khác thì các thay đổi chưa lưu sẽ mất: hỏi trước.
  function selectTerm(id: string) {
    if (id === selectedId) return;
    if (dirty && !window.confirm("Danh sách của nhiệm kỳ này có thay đổi chưa lưu. Chuyển sang nhiệm kỳ khác sẽ mất các thay đổi đó. Vẫn chuyển?")) return;
    setSelectedId(id); setConfirming(false);
  }

  async function createTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !isHead) return;
    if (form.start_date && form.end_date && form.end_date < form.start_date) { setError("Ngày kết thúc phải sau hoặc cùng ngày bắt đầu."); return; }
    setBusy(true); setError(""); setNotice("");
    const { data, error: insertError } = await supabase.from("club_terms").insert({ club_id: clubId, name: form.name.trim(), start_date: form.start_date || null, end_date: form.end_date || null }).select("id").single();
    setBusy(false);
    if (insertError) { setError(friendlyError(insertError, "Không tạo được nhiệm kỳ.")); return; }
    setForm(emptyForm); setCreating(false); setNotice("Đã tạo nhiệm kỳ nháp. Hãy chọn Ban chủ nhiệm (đúng một Chủ nhiệm) và Ban chủ chốt kèm quyền rồi lưu danh sách.");
    setSelectedId(data.id);
    await load();
  }

  function addRole() {
    if (!pickMember) return;
    setRoles((current) => [...current, { member_id: pickMember, role: "admin", title: "", team_id: "", permissions: [], is_head: false }]);
    setPickMember("");
  }

  function updateRole(memberId: string, patch: Partial<TermRole>) {
    setRoles((current) => current.map((row) => row.member_id === memberId ? { ...row, ...patch } : row));
  }

  // Chọn đúng một Chủ nhiệm: bỏ cờ ở mọi người khác.
  function setHead(memberId: string) {
    setRoles((current) => current.map((row) => ({ ...row, is_head: row.member_id === memberId && row.role === "owner" })));
  }

  function changeRole(memberId: string, next: "owner" | "admin") {
    // Ban chủ nhiệm đã có mọi quyền nên xóa quyền lẻ; Ban chủ chốt không thể là Chủ nhiệm.
    updateRole(memberId, next === "owner" ? { role: next, permissions: [] } : { role: next, is_head: false });
  }

  function togglePermission(memberId: string, code: string, checked: boolean) {
    setRoles((current) => current.map((row) => row.member_id !== memberId ? row : { ...row, permissions: checked ? [...new Set([...row.permissions, code])] : row.permissions.filter((item) => item !== code) }));
  }

  function prefillFromCurrent() {
    setRoles(members.filter((member) => member.is_active && (member.role === "owner" || member.role === "admin")).map((member) => ({
      member_id: member.id, role: member.role as "owner" | "admin", title: member.title ?? "", team_id: member.team_id ?? "",
      permissions: member.role === "admin" ? (member.permissions ?? []).filter(isClubPermission) : [], is_head: member.role === "owner" && member.is_head === true,
    })));
  }

  async function saveRoles() {
    if (!supabase || !canEdit || !selected) return;
    if (heads.length > 1) { setError("Chỉ được chọn một Chủ nhiệm."); return; }
    setBusy(true); setError(""); setNotice("");
    const keep = new Set(roles.map((row) => row.member_id));
    const saved = JSON.parse(savedRoles) as TermRole[];
    const removed = saved.map((row) => row.member_id).filter((id) => !keep.has(id));
    // Bỏ cờ Chủ nhiệm cũ trước để không vướng ràng buộc "tối đa một Chủ nhiệm" khi đổi người.
    if (saved.some((row) => row.is_head)) {
      const { error: clearError } = await supabase.from("club_term_roles").update({ is_head: false }).eq("term_id", selected.id).eq("is_head", true);
      if (clearError) { setBusy(false); setError(friendlyError(clearError, "Không lưu được danh sách.")); return; }
    }
    if (roles.length) {
      const { error: upsertError } = await supabase.from("club_term_roles").upsert(roles.map((row) => ({ term_id: selected.id, member_id: row.member_id, role: row.role, title: row.title.trim() || null, team_id: row.team_id || null, permissions: row.role === "admin" ? row.permissions : [], is_head: row.role === "owner" && row.is_head })), { onConflict: "term_id,member_id" });
      if (upsertError) { setBusy(false); setError(friendlyError(upsertError, "Không lưu được danh sách.")); return; }
    }
    if (removed.length) {
      const { error: deleteError } = await supabase.from("club_term_roles").delete().eq("term_id", selected.id).in("member_id", removed);
      if (deleteError) { setBusy(false); setError(friendlyError(deleteError, "Không lưu được danh sách.")); return; }
    }
    setBusy(false); setNotice("Đã lưu danh sách Ban chủ nhiệm và Ban chủ chốt.");
    await loadRoles();
  }

  async function activate() {
    if (!supabase || !canEdit || !selected) return;
    setBusy(true); setError(""); setNotice("");
    const { error: rpcError } = await supabase.rpc("activate_term", { p_term_id: selected.id });
    setBusy(false); setConfirming(false);
    if (rpcError) { setError(friendlyError(rpcError, "Không kích hoạt được nhiệm kỳ.")); return; }
    setNotice(`Đã kích hoạt nhiệm kỳ "${selected.name}".`);
    await loadRoles();
    // Vai trò cả CLB vừa đổi: báo các màn khác tải lại và làm mới vai trò/menu của chính người dùng.
    notifyMembersChanged();
    router.refresh();
  }

  const roleChips = (row: TermRole) => row.role === "owner"
    ? <>{row.is_head && <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-semibold text-white">Chủ nhiệm</span>}</>
    : row.permissions.filter(isClubPermission).length
      ? CLUB_PERMISSIONS.filter((permission) => row.permissions.includes(permission.code)).map((permission) => <span key={permission.code} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">{permission.label}</span>)
      : <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">Chưa có quyền chức năng</span>;

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <PageHeader title="Nhiệm kỳ" description="Mỗi nhiệm kỳ có danh sách Ban chủ nhiệm và Ban chủ chốt riêng. Kích hoạt nhiệm kỳ mới để đổi vai trò cả CLB cùng lúc." actions={isHead && <Button variant="primary" icon="plus" onClick={() => setCreating(true)} aria-expanded={creating}>Tạo nhiệm kỳ nháp</Button>} />
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {!supabase && <Notice tone="error">Thiếu cấu hình Supabase.</Notice>}
    {!isHead && <Notice tone="warning">Chỉ Chủ nhiệm được tạo, sửa và kích hoạt nhiệm kỳ.{role === "owner" ? " Phó chủ nhiệm chỉ có quyền xem." : " Ban chủ chốt chỉ có quyền xem."}</Notice>}
    <CreatePanel open={creating && isHead} title="Tạo nhiệm kỳ nháp" onClose={() => setCreating(false)}>
      <form onSubmit={(event) => void createTerm(event)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr]">
          <Field label="Tên nhiệm kỳ"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="Ví dụ: Nhiệm kỳ 2026–2027" data-autofocus /></Field>
          <Field label="Ngày bắt đầu"><input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} className={inputClass} /></Field>
          <Field label="Ngày kết thúc"><input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(event) => setForm({ ...form, end_date: event.target.value })} className={inputClass} /></Field>
        </div>
        <p className="text-xs text-zinc-500">Nhiệm kỳ nháp chưa ảnh hưởng đến vai trò của ai.</p>
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
          <Button type="submit" variant="primary" disabled={!supabase} loading={busy}>{busy ? "Đang tạo…" : "Tạo nhiệm kỳ nháp"}</Button>
          <Button onClick={() => setCreating(false)}>Hủy</Button>
        </div>
      </form>
    </CreatePanel>
    <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Panel title={`Các nhiệm kỳ (${terms.length})`} padded={false} actions={<Button variant="ghost" size="sm" icon="refresh" aria-label="Làm mới" onClick={() => void load()} />}>
        {loading ? <div role="status" aria-label="Đang tải nhiệm kỳ" className="space-y-2 p-3">{[0, 1, 2].map((index) => <div key={index} className="h-14 animate-pulse rounded-lg bg-zinc-100" />)}</div>
          : terms.length ? <ul className="space-y-0.5 p-2">{terms.map((term) => <li key={term.id}><button type="button" aria-current={term.id === selectedId ? "true" : undefined} onClick={() => selectTerm(term.id)} className={`block w-full rounded-lg px-3 py-2.5 text-left hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600 ${term.id === selectedId ? "bg-emerald-50 hover:bg-emerald-50" : ""}`}><span className="flex items-start justify-between gap-2"><span className="min-w-0 break-words text-sm font-medium">{term.name}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass[term.status]}`}>{statusLabel[term.status]}</span></span><span className="mt-0.5 block text-xs text-zinc-500">{formatDate(term.start_date)} – {formatDate(term.end_date)}</span></button></li>)}</ul>
          : <EmptyState title="CLB chưa có nhiệm kỳ nào." action={isHead && !creating ? <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Tạo nhiệm kỳ nháp</Button> : undefined} />}
      </Panel>

      {!selected ? <Panel padded={false}><EmptyState title="Chọn hoặc tạo một nhiệm kỳ để xem danh sách Ban chủ nhiệm và Ban chủ chốt." /></Panel> : <Panel title={selected.name} actions={<span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass[selected.status]}`}>{statusLabel[selected.status]}</span>}>
        <p className="text-sm text-zinc-600">{formatDate(selected.start_date)} – {formatDate(selected.end_date)}{selected.activated_at ? ` · Kích hoạt ${new Date(selected.activated_at).toLocaleDateString("vi-VN")}` : ""}</p>
        <div className="mt-5 border-t border-zinc-100 pt-5">
          <h3 className="text-sm font-semibold text-zinc-900">Ban chủ nhiệm và Ban chủ chốt ({roles.length})</h3>
          {rolesLoading ? <div role="status" aria-label="Đang tải danh sách" className="mt-4 space-y-3">{[0, 1].map((index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-zinc-100" />)}</div> : roles.length ? <ul className="mt-2 divide-y divide-zinc-100">{roles.map((row) => {
            const member = memberById.get(row.member_id);
            const name = member?.full_name ?? "Thành viên đã xóa";
            const noAccount = member && !member.user_id && <span className="ml-2 text-xs font-normal text-amber-800">Chưa có tài khoản</span>;
            if (!canEdit) return <li key={row.member_id} className="py-3">
              <p className="break-words text-sm font-semibold">{name}{noAccount}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{[roleLabel(row.role), row.title, teams.find((team) => team.id === row.team_id)?.name].filter(Boolean).join(" · ")}</p>
              <p className="mt-1.5 flex flex-wrap gap-1">{roleChips(row)}</p>
            </li>;
            return <li key={row.member_id} className="py-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-semibold">{name}{noAccount}</p>
                <Button variant="danger" size="sm" icon="trash" aria-label={`Gỡ ${name} khỏi danh sách`} title="Gỡ khỏi danh sách" onClick={() => setRoles((current) => current.filter((item) => item.member_id !== row.member_id))} />
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <Field label="Vai trò"><select value={row.role} onChange={(event) => changeRole(row.member_id, event.target.value as "owner" | "admin")} className={inputClass}><option value="owner">{roleLabel("owner")}</option><option value="admin">{roleLabel("admin")}</option></select></Field>
                <Field label="Chức danh"><input value={row.title} onChange={(event) => updateRole(row.member_id, { title: event.target.value })} className={inputClass} placeholder="Ví dụ: Phó chủ nhiệm" /></Field>
                <Field label="Ban"><select value={row.team_id} onChange={(event) => updateRole(row.member_id, { team_id: event.target.value })} className={inputClass}><option value="">Không đổi ban</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></Field>
              </div>
              {row.role === "owner" ? <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm"><input type="radio" name="term-head" checked={row.is_head} onChange={() => setHead(row.member_id)} className="accent-emerald-700" /> <span className="font-medium">Chủ nhiệm</span><span className="text-xs text-zinc-500">(đúng một người; Phó chủ nhiệm không chọn)</span></label>
                : <fieldset className="mt-3"><legend className="text-xs font-medium text-zinc-600">Quyền chức năng của {member?.full_name ?? "thành viên"}</legend><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{CLUB_PERMISSIONS.map((permission) => <label key={permission.code} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={row.permissions.includes(permission.code)} onChange={(event) => togglePermission(row.member_id, permission.code, event.target.checked)} className="accent-emerald-700" /> {permission.label}</label>)}</div></fieldset>}
            </li>;
          })}</ul> : <EmptyState title="Chưa có ai trong danh sách của nhiệm kỳ này." action={canEdit ? <Button onClick={prefillFromCurrent}>Lấy từ danh sách hiện tại</Button> : undefined} />}
          {canEdit && <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-4">
            <Field label="Thêm thành viên" className="min-w-52 flex-1"><select value={pickMember} onChange={(event) => setPickMember(event.target.value)} className={inputClass}><option value="">Chọn thành viên</option>{pickable.map((member) => <option key={member.id} value={member.id}>{member.full_name}{member.role !== "member" ? ` · ${roleLabel(member.role)}` : ""}</option>)}</select></Field>
            <Button disabled={!pickMember} onClick={addRole}>Thêm vào danh sách</Button>
          </div>}
          {canEdit && <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-5">
            <Button variant="primary" disabled={!dirty} loading={busy} onClick={() => void saveRoles()}>{busy ? "Đang lưu…" : "Lưu danh sách"}</Button>
            <Button variant="danger" className="border border-rose-300" disabled={busy || dirty || !headReady} onClick={() => setConfirming(true)}>Kích hoạt nhiệm kỳ</Button>
            <p className="min-w-0 flex-1 text-xs text-zinc-500">{dirty ? "Hãy lưu danh sách trước khi kích hoạt." : !headReady ? "Cần chọn đúng một Chủ nhiệm thuộc Ban chủ nhiệm, đang hoạt động và đã có tài khoản." : "Kích hoạt sẽ áp dụng danh sách này cho cả CLB."}</p>
          </div>}
        </div>
      </Panel>}
    </div>
    {confirming && selected && <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="activate-term-title" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl outline-none">
        <h2 id="activate-term-title" className="text-lg font-semibold">Kích hoạt “{selected.name}”?</h2>
        <div className="mt-3 text-sm text-zinc-700">
          <Notice tone="success"><strong>{headMember?.full_name ?? "Người được chọn"}</strong> sẽ trở thành Chủ nhiệm của CLB. Chỉ Chủ nhiệm mới được kích hoạt nhiệm kỳ và cấp quyền.</Notice>
          <p className="mb-4">Danh sách này sẽ trở thành Ban chủ nhiệm và Ban chủ chốt của CLB ({roles.length} người) với đúng quyền chức năng đã tick. Nhiệm kỳ đang áp dụng (nếu có) sẽ chuyển sang “Đã kết thúc”.</p>
          <Notice tone="warning"><strong>Mọi người không có trong danh sách sẽ trở thành Thành viên</strong> và mất chức danh hiện tại ({droppedCount} người{demoted.length ? `, trong đó ${demoted.length} người đang giữ vai trò quản trị` : ""}).</Notice>
          <p className="text-xs text-zinc-500">Thao tác này không hoàn tác tự động; muốn đổi lại phải kích hoạt một nhiệm kỳ khác.</p>
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button data-autofocus disabled={busy} onClick={() => setConfirming(false)}>Hủy</Button><Button variant="danger" className="border border-rose-300" loading={busy} onClick={() => void activate()}>{busy ? "Đang kích hoạt…" : "Kích hoạt nhiệm kỳ"}</Button></div>
      </div>
    </div>}
  </section>;
}
