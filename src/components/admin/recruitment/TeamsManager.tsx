"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { useCurrentAdminClub } from "../AdminShell";

type Team = { id: string; club_id: string; name: string; description: string | null; created_at: string };
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15";

export function TeamsManager() {
  const supabase = getSupabaseClient();
  const { id: clubId, role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    if (!supabase) { setError("Chưa cấu hình kết nối Supabase."); setLoading(false); return; }
    if (!clubId) { setError("Tài khoản chưa được gán vào CLB nào."); setLoading(false); return; }
    setLoading(true);
    const { data, error: queryError } = await supabase.from("teams")
      .select("id,club_id,name,description,created_at").eq("club_id", clubId).order("name");
    if (queryError) {
      setError(queryError.message);
    } else {
      const rows = (data ?? []) as Team[];
      setTeams(rows);
      setSelectedId((current) => rows.some((team) => team.id === current) ? current : rows[0]?.id ?? "");
      setError(null);
    }
    setLoading(false);
  }, [supabase, clubId]);

  useEffect(() => { void loadTeams(); }, [loadTeams]);

  const selected = teams.find((team) => team.id === selectedId) ?? null;
  useEffect(() => {
    setName(selected?.name ?? "");
    setDescription(selected?.description ?? "");
  }, [selectedId, selected?.name, selected?.description]);

  function startCreate() {
    setSelectedId("");
    setIsCreating(true);
    setName("");
    setDescription("");
    setError(null);
    setNotice(null);
  }

  async function saveTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !clubId || !canWrite) return;
    const cleanName = name.trim();
    if (!cleanName) return;
    setBusy(true); setError(null); setNotice(null);
    const payload = { club_id: clubId, name: cleanName, description: description.trim() || null };
    const result = selected && !isCreating
      ? await supabase.from("teams").update({ name: payload.name, description: payload.description }).eq("id", selected.id).eq("club_id", clubId).select("id,club_id,name,description,created_at").single()
      : await supabase.from("teams").insert(payload).select("id,club_id,name,description,created_at").single();
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    const saved = result.data as Team;
    setTeams((rows) => [...rows.filter((team) => team.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, "vi")));
    setSelectedId(saved.id);
    setIsCreating(false);
    setNotice(isCreating ? "Đã tạo ban." : "Đã lưu thay đổi.");
  }

  async function deleteTeam() {
    if (!supabase || !clubId || !selected || !canWrite) return;
    if (!window.confirm(`Xóa ban “${selected.name}”?`)) return;
    setBusy(true); setError(null); setNotice(null);
    const [members, positions] = await Promise.all([
      supabase.from("club_members").select("id", { count: "exact", head: true }).eq("team_id", selected.id),
      supabase.from("recruitment_positions").select("id", { count: "exact", head: true }).eq("team_id", selected.id),
    ]);
    if (members.error || positions.error) {
      setError(members.error?.message ?? positions.error?.message ?? "Không kiểm tra được dữ liệu liên quan.");
      setBusy(false);
      return;
    }
    if ((members.count ?? 0) > 0 || (positions.count ?? 0) > 0) {
      setError("Ban đang được gán cho thành viên hoặc vị trí tuyển. Hãy chuyển các dữ liệu đó sang ban khác trước khi xóa.");
      setBusy(false);
      return;
    }
    const { error: deleteError } = await supabase.from("teams").delete().eq("id", selected.id).eq("club_id", clubId);
    setBusy(false);
    if (deleteError) { setError(deleteError.message); return; }
    const rows = teams.filter((team) => team.id !== selected.id);
    setTeams(rows);
    setSelectedId(rows[0]?.id ?? "");
    setNotice("Đã xóa ban.");
  }

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-semibold text-emerald-700">Quản trị CLB</p><h1 className="mt-1 text-3xl font-bold">Quản lí ban</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Tạo và cập nhật thông tin các ban. Nội dung mô tả sẽ được hiển thị ở trang Khám phá CLB.</p></div>
      {canWrite && <button type="button" onClick={startCreate} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800">+ Thêm ban</button>}
    </header>
    {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {loading ? <p className="rounded-xl border bg-white p-6 text-sm text-zinc-600">Đang tải danh sách ban…</p> : (
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-xl border bg-white p-3">
          <h2 className="px-2 py-2 text-sm font-semibold">Các ban trong CLB</h2>
          {teams.length ? <ul className="mt-1 space-y-1">{teams.map((team) => <li key={team.id}><button type="button" onClick={() => { setSelectedId(team.id); setIsCreating(false); setError(null); setNotice(null); }} className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium ${selectedId === team.id && !isCreating ? "bg-emerald-50 text-emerald-900" : "text-zinc-700 hover:bg-zinc-50"}`}>{team.name}</button></li>)}</ul> : <p className="px-2 py-3 text-sm text-zinc-500">Chưa có ban nào.</p>}
        </aside>
        <div className="rounded-xl border bg-white p-4 sm:p-6">
          {isCreating || selected ? <form onSubmit={saveTeam} className="space-y-4">
            <div><h2 className="text-lg font-semibold">{isCreating ? "Tạo ban mới" : "Thông tin ban"}</h2><p className="mt-1 text-sm text-zinc-500">Tên ban và phần mô tả giới thiệu.</p></div>
            <label className="block text-sm font-medium">Tên ban<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={!canWrite || busy} className={inputClass} /></label>
            <label className="block text-sm font-medium">Mô tả<textarea rows={7} value={description} onChange={(event) => setDescription(event.target.value)} disabled={!canWrite || busy} className={inputClass} placeholder="Giới thiệu nhiệm vụ và hoạt động của ban…" /></label>
            {canWrite && <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy ? "Đang lưu…" : isCreating ? "Tạo ban" : "Lưu thay đổi"}</button>{selected && !isCreating && <button type="button" onClick={() => void deleteTeam()} disabled={busy} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60">Xóa ban</button>}</div>}
          </form> : <p className="rounded-lg border border-dashed p-8 text-center text-sm text-zinc-500">Chọn một ban để xem hoặc chỉnh sửa thông tin.</p>}
        </div>
      </div>
    )}
  </section>;
}
