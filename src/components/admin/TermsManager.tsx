"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";
import { useCurrentAdminClub } from "./AdminClubContext";
import { roleLabel } from "./roles";

type Term = { id: string; name: string; start_date: string | null; end_date: string | null; status: "draft" | "active" | "ended"; activated_at: string | null; created_at: string };
type TermRole = { member_id: string; role: "owner" | "admin"; title: string; team_id: string };
type Member = { id: string; full_name: string; role: string; user_id: string | null; team_id: string | null; title: string | null; is_active: boolean };
type Team = { id: string; name: string };
const statusLabel: Record<Term["status"], string> = { draft: "Nháp", active: "Đang áp dụng", ended: "Đã kết thúc" };
const statusClass: Record<Term["status"], string> = { draft: "bg-amber-50 text-amber-800", active: "bg-emerald-50 text-emerald-800", ended: "bg-zinc-100 text-zinc-600" };
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100";
const emptyForm = { name: "", start_date: "", end_date: "" };

function formatDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN") : "—";
}

function serialize(rows: TermRole[]) {
  return JSON.stringify([...rows].sort((a, b) => a.member_id.localeCompare(b.member_id)));
}

export function TermsManager() {
  const supabase = getSupabaseClient();
  const { id: clubId, role } = useCurrentAdminClub();
  const isOwner = role === "owner";
  const [terms, setTerms] = useState<Term[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [roles, setRoles] = useState<TermRole[]>([]);
  const [savedRoles, setSavedRoles] = useState("[]");
  const [form, setForm] = useState(emptyForm);
  const [pickMember, setPickMember] = useState("");
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (!supabase || !clubId) { setLoading(false); return; }
    setLoading(true);
    const [termResult, memberResult, teamResult] = await Promise.all([
      supabase.from("club_terms").select("id,name,start_date,end_date,status,activated_at,created_at").eq("club_id", clubId).order("created_at", { ascending: false }),
      supabase.from("club_members").select("id,full_name,role,user_id,team_id,title,is_active").eq("club_id", clubId).order("full_name"),
      supabase.from("teams").select("id,name").eq("club_id", clubId).order("name"),
    ]);
    const failure = termResult.error ?? memberResult.error ?? teamResult.error;
    if (failure) setError(failure.message);
    else {
      const rows = (termResult.data ?? []) as Term[];
      setTerms(rows); setMembers((memberResult.data ?? []) as Member[]); setTeams((teamResult.data ?? []) as Team[]);
      setSelectedId((current) => rows.some((term) => term.id === current) ? current : (rows.find((term) => term.status === "draft") ?? rows.find((term) => term.status === "active") ?? rows[0])?.id ?? "");
      setError("");
    }
    setLoading(false);
  }, [supabase, clubId]);

  useEffect(() => { void load(); }, [load]);

  const loadRoles = useCallback(async () => {
    if (!supabase || !selectedId) { setRoles([]); setSavedRoles("[]"); return; }
    setRolesLoading(true);
    const { data, error: rolesError } = await supabase.from("club_term_roles").select("member_id,role,title,team_id").eq("term_id", selectedId);
    if (rolesError) setError(rolesError.message);
    else {
      const rows = ((data ?? []) as { member_id: string; role: "owner" | "admin"; title: string | null; team_id: string | null }[]).map((row) => ({ member_id: row.member_id, role: row.role, title: row.title ?? "", team_id: row.team_id ?? "" }));
      setRoles(rows); setSavedRoles(serialize(rows));
    }
    setRolesLoading(false);
  }, [supabase, selectedId]);

  useEffect(() => { void loadRoles(); }, [loadRoles]);

  useEffect(() => { if (confirming) cancelRef.current?.focus(); }, [confirming]);

  const selected = terms.find((term) => term.id === selectedId) ?? null;
  const canEdit = isOwner && selected?.status === "draft";
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const dirty = serialize(roles) !== savedRoles;
  const pickable = members.filter((member) => member.is_active && !roles.some((row) => row.member_id === member.id));
  const hasLoginOwner = roles.some((row) => row.role === "owner" && memberById.get(row.member_id)?.is_active && memberById.get(row.member_id)?.user_id);
  const demoted = members.filter((member) => member.is_active && !roles.some((row) => row.member_id === member.id) && member.role !== "member");
  const droppedCount = members.filter((member) => member.is_active && !roles.some((row) => row.member_id === member.id)).length;

  async function createTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !isOwner) return;
    if (form.start_date && form.end_date && form.end_date < form.start_date) { setError("Ngày kết thúc phải sau hoặc cùng ngày bắt đầu."); return; }
    setBusy(true); setError(""); setNotice("");
    const { data, error: insertError } = await supabase.from("club_terms").insert({ club_id: clubId, name: form.name.trim(), start_date: form.start_date || null, end_date: form.end_date || null }).select("id").single();
    setBusy(false);
    if (insertError) { setError(insertError.message); return; }
    setForm(emptyForm); setNotice("Đã tạo nhiệm kỳ nháp. Hãy chọn Ban chủ nhiệm và Ban chủ chốt rồi lưu danh sách.");
    setSelectedId(data.id);
    await load();
  }

  function addRole() {
    if (!pickMember) return;
    setRoles((current) => [...current, { member_id: pickMember, role: "admin", title: "", team_id: "" }]);
    setPickMember("");
  }

  function updateRole(memberId: string, patch: Partial<TermRole>) {
    setRoles((current) => current.map((row) => row.member_id === memberId ? { ...row, ...patch } : row));
  }

  function prefillFromCurrent() {
    setRoles(members.filter((member) => member.is_active && (member.role === "owner" || member.role === "admin")).map((member) => ({ member_id: member.id, role: member.role as "owner" | "admin", title: member.title ?? "", team_id: member.team_id ?? "" })));
  }

  async function saveRoles() {
    if (!supabase || !canEdit || !selected) return;
    setBusy(true); setError(""); setNotice("");
    const keep = new Set(roles.map((row) => row.member_id));
    const removed = (JSON.parse(savedRoles) as TermRole[]).map((row) => row.member_id).filter((id) => !keep.has(id));
    if (roles.length) {
      const { error: upsertError } = await supabase.from("club_term_roles").upsert(roles.map((row) => ({ term_id: selected.id, member_id: row.member_id, role: row.role, title: row.title.trim() || null, team_id: row.team_id || null })), { onConflict: "term_id,member_id" });
      if (upsertError) { setBusy(false); setError(upsertError.message); return; }
    }
    if (removed.length) {
      const { error: deleteError } = await supabase.from("club_term_roles").delete().eq("term_id", selected.id).in("member_id", removed);
      if (deleteError) { setBusy(false); setError(deleteError.message); return; }
    }
    setBusy(false); setNotice("Đã lưu danh sách Ban chủ nhiệm và Ban chủ chốt.");
    await loadRoles();
  }

  async function activate() {
    if (!supabase || !canEdit || !selected) return;
    setBusy(true); setError(""); setNotice("");
    const { error: rpcError } = await supabase.rpc("activate_term", { p_term_id: selected.id });
    setBusy(false); setConfirming(false);
    if (rpcError) { setError(rpcError.message); return; }
    setNotice(`Đã kích hoạt nhiệm kỳ "${selected.name}".`);
    await load(); await loadRoles();
  }

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <header className="mb-6"><p className="text-sm font-semibold text-emerald-700">Không gian CLB</p><h1 className="mt-1 text-3xl font-bold">Nhiệm kỳ</h1><p className="mt-2 text-sm text-zinc-600">Mỗi nhiệm kỳ có danh sách Ban chủ nhiệm và Ban chủ chốt riêng. Kích hoạt nhiệm kỳ mới để đổi vai trò cả CLB cùng lúc.</p></header>
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!supabase && <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Thiếu cấu hình Supabase.</p>}
    {!isOwner && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Chỉ Ban chủ nhiệm được tạo và sửa nhiệm kỳ. Ban chủ chốt chỉ có quyền xem.</p>}
    <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-6">
        {isOwner && <form onSubmit={(event) => void createTerm(event)} className="space-y-4 rounded-xl border bg-white p-5">
          <div><h2 className="font-semibold">Tạo nhiệm kỳ nháp</h2><p className="mt-1 text-xs text-zinc-500">Nhiệm kỳ nháp chưa ảnh hưởng đến vai trò của ai.</p></div>
          <label className="block text-sm">Tên nhiệm kỳ<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="Ví dụ: Nhiệm kỳ 2026–2027" /></label>
          <label className="block text-sm">Ngày bắt đầu<input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} className={inputClass} /></label>
          <label className="block text-sm">Ngày kết thúc<input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(event) => setForm({ ...form, end_date: event.target.value })} className={inputClass} /></label>
          <button disabled={busy || !supabase} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Đang tạo…" : "Tạo nhiệm kỳ nháp"}</button>
        </form>}
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="flex items-center justify-between border-b p-4"><h2 className="font-semibold">Các nhiệm kỳ ({terms.length})</h2><button type="button" onClick={() => void load()} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Làm mới</button></div>
          {loading ? <p className="p-6 text-sm text-zinc-500">Đang tải nhiệm kỳ…</p> : terms.length ? <ul className="divide-y divide-zinc-100">{terms.map((term) => <li key={term.id}><button type="button" aria-current={term.id === selectedId} onClick={() => { setSelectedId(term.id); setConfirming(false); }} className={`block w-full p-4 text-left hover:bg-zinc-50 ${term.id === selectedId ? "bg-emerald-50/60" : ""}`}><span className="flex items-start justify-between gap-2"><span className="min-w-0 break-words font-medium">{term.name}</span><span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass[term.status]}`}>{statusLabel[term.status]}</span></span><span className="mt-1 block text-xs text-zinc-500">{formatDate(term.start_date)} – {formatDate(term.end_date)}</span></button></li>)}</ul> : <p className="p-6 text-sm text-zinc-500">CLB chưa có nhiệm kỳ nào.</p>}
        </div>
      </div>

      <div className="rounded-xl border bg-white">
        {!selected ? <p className="p-6 text-sm text-zinc-500">Chọn hoặc tạo một nhiệm kỳ để xem danh sách Ban chủ nhiệm và Ban chủ chốt.</p> : <>
          <div className="border-b p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-xl font-semibold">{selected.name}</h2><p className="mt-1 text-sm text-zinc-600">{formatDate(selected.start_date)} – {formatDate(selected.end_date)}{selected.activated_at ? ` · Kích hoạt ${new Date(selected.activated_at).toLocaleDateString("vi-VN")}` : ""}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass[selected.status]}`}>{statusLabel[selected.status]}</span></div></div>
          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Ban chủ nhiệm và Ban chủ chốt ({roles.length})</h3>{canEdit && !roles.length && <button type="button" onClick={prefillFromCurrent} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Lấy từ danh sách hiện tại</button>}</div>
            {rolesLoading ? <p className="mt-4 text-sm text-zinc-500">Đang tải danh sách…</p> : roles.length ? <ul className="mt-4 space-y-3">{roles.map((row) => {
              const member = memberById.get(row.member_id);
              return <li key={row.member_id} className="rounded-lg border p-3">
                <p className="break-words text-sm font-semibold">{member?.full_name ?? "Thành viên đã xóa"}{member && !member.user_id && <span className="ml-2 text-xs font-normal text-amber-800">Chưa có tài khoản</span>}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs font-medium text-zinc-600">Vai trò<select disabled={!canEdit} value={row.role} onChange={(event) => updateRole(row.member_id, { role: event.target.value as "owner" | "admin" })} className={inputClass}><option value="owner">{roleLabel("owner")}</option><option value="admin">{roleLabel("admin")}</option></select></label>
                  <label className="block text-xs font-medium text-zinc-600">Chức danh<input disabled={!canEdit} value={row.title} onChange={(event) => updateRole(row.member_id, { title: event.target.value })} className={inputClass} placeholder="Ví dụ: Phó chủ nhiệm" /></label>
                  <label className="block text-xs font-medium text-zinc-600">Ban<select disabled={!canEdit} value={row.team_id} onChange={(event) => updateRole(row.member_id, { team_id: event.target.value })} className={inputClass}><option value="">Không đổi ban</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
                </div>
                {canEdit && <button type="button" onClick={() => setRoles((current) => current.filter((item) => item.member_id !== row.member_id))} className="mt-2 text-sm font-medium text-rose-700 hover:underline">Gỡ khỏi danh sách</button>}
              </li>;
            })}</ul> : <p className="mt-4 text-sm text-zinc-500">Chưa có ai trong danh sách của nhiệm kỳ này.</p>}
            {canEdit && <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg bg-zinc-50 p-3"><label className="min-w-52 flex-1 text-sm">Thêm thành viên<select value={pickMember} onChange={(event) => setPickMember(event.target.value)} className={inputClass}><option value="">Chọn thành viên</option>{pickable.map((member) => <option key={member.id} value={member.id}>{member.full_name}{member.role !== "member" ? ` · ${roleLabel(member.role)}` : ""}</option>)}</select></label><button type="button" disabled={!pickMember} onClick={addRole} className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">Thêm vào danh sách</button></div>}
            {canEdit && <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-5">
              <button type="button" disabled={busy || !dirty} onClick={() => void saveRoles()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Đang lưu…" : "Lưu danh sách"}</button>
              <button type="button" disabled={busy || dirty || !hasLoginOwner} onClick={() => setConfirming(true)} className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 disabled:opacity-50">Kích hoạt nhiệm kỳ</button>
              <p className="text-xs text-zinc-500">{dirty ? "Hãy lưu danh sách trước khi kích hoạt." : !hasLoginOwner ? "Cần ít nhất một thành viên Ban chủ nhiệm đang hoạt động và đã có tài khoản." : "Kích hoạt sẽ áp dụng danh sách này cho cả CLB."}</p>
            </div>}
          </div>
        </>}
      </div>
    </div>
    {confirming && selected && <div role="presentation" onKeyDown={(event) => { if (event.key === "Escape" && !busy) setConfirming(false); }} className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="activate-term-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="activate-term-title" className="text-lg font-bold">Kích hoạt “{selected.name}”?</h2>
        <div className="mt-3 space-y-2 text-sm text-zinc-700">
          <p>Danh sách này sẽ trở thành Ban chủ nhiệm và Ban chủ chốt của CLB ({roles.length} người). Nhiệm kỳ đang áp dụng (nếu có) sẽ chuyển sang “Đã kết thúc”.</p>
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900"><strong>Mọi người không có trong danh sách sẽ trở thành Thành viên</strong> và mất chức danh hiện tại ({droppedCount} người{demoted.length ? `, trong đó ${demoted.length} người đang giữ vai trò quản trị` : ""}).</p>
          <p className="text-xs text-zinc-500">Thao tác này không hoàn tác tự động; muốn đổi lại phải kích hoạt một nhiệm kỳ khác.</p>
        </div>
        <div className="mt-5 flex justify-end gap-2"><button ref={cancelRef} type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">Hủy</button><button type="button" disabled={busy} onClick={() => void activate()} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Đang kích hoạt…" : "Kích hoạt nhiệm kỳ"}</button></div>
      </div>
    </div>}
  </section>;
}
