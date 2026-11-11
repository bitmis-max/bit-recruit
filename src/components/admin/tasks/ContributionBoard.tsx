"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { useCurrentAdminClub } from "../AdminClubContext";
import { roleLabel } from "../roles";

type Range = { from: string; to: string };
type RawRow = { member_id: string; full_name: string; team_id: string | null; team_ids: string[] | null; role: string; is_active: boolean; assigned: number; done_on_time: number; done_late: number; missed: number; pending: number };
type Loaded = { key: string; rows: RawRow[]; teams: Map<string, string>; error: string };
type Row = RawRow & { due: number; rate: number | null; flagged: boolean };
type SortMode = "rate-asc" | "rate-desc" | "name";

const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";
const pad = (value: number) => String(value).padStart(2, "0");
const toInputDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function defaultRange(): Range {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 90);
  return { from: toInputDate(from), to: toInputDate(to) };
}

// Khoảng [từ 00:00 ngày bắt đầu, 00:00 ngày sau ngày kết thúc) theo giờ máy người dùng.
function toIsoRange(range: Range) {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function toRow(raw: RawRow): Row {
  const assigned = Number(raw.assigned), pending = Number(raw.pending), onTime = Number(raw.done_on_time), late = Number(raw.done_late);
  const due = assigned - pending;
  const rate = due > 0 ? (onTime + late) / due : null;
  return { ...raw, assigned, pending, done_on_time: onTime, done_late: late, missed: Number(raw.missed), due, rate, flagged: due >= 3 && rate !== null && rate < 0.5 };
}

function compareRows(mode: SortMode) {
  return (a: Row, b: Row) => {
    if (mode === "name") return a.full_name.localeCompare(b.full_name, "vi");
    if (a.rate === null || b.rate === null) return a.rate === b.rate ? a.full_name.localeCompare(b.full_name, "vi") : a.rate === null ? 1 : -1;
    return (mode === "rate-asc" ? a.rate - b.rate : b.rate - a.rate) || a.full_name.localeCompare(b.full_name, "vi");
  };
}

export function ContributionBoard() {
  const supabase = getSupabaseClient();
  const { id: clubId, role, teamId } = useCurrentAdminClub();
  const isOwner = role === "owner";
  const canWrite = isOwner || role === "admin";
  const [inputs, setInputs] = useState<Range>(defaultRange);
  const [applied, setApplied] = useState<Range>(inputs);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<Loaded | null>(null);
  const [sort, setSort] = useState<SortMode>("rate-asc");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [error, setError] = useState("");

  const key = `${clubId}|${applied.from}|${applied.to}|${reloadKey}`;

  useEffect(() => {
    if (!supabase || !clubId || !canWrite) return;
    let active = true;
    const iso = toIsoRange(applied);
    (async () => {
      const [rpcResult, teamResult] = await Promise.all([
        supabase.rpc("club_contribution", { p_club_id: clubId, p_from: iso.from, p_to: iso.to }),
        supabase.from("teams").select("id,name").eq("club_id", clubId),
      ]);
      if (!active) return;
      setResult({
        key: `${clubId}|${applied.from}|${applied.to}|${reloadKey}`,
        rows: (rpcResult.data ?? []) as RawRow[],
        teams: new Map((teamResult.data ?? []).map((team) => [team.id as string, team.name as string])),
        error: rpcResult.error?.message ?? "",
      });
    })();
    return () => { active = false; };
  }, [supabase, clubId, canWrite, applied, reloadKey]);

  const loaded = result?.key === key ? result : null;
  // Ban chủ chốt chỉ xem thành viên trong ban của mình (máy chủ cũng lọc như vậy).
  const rows = useMemo(() => (loaded?.rows ?? []).filter((raw) => isOwner || (!!teamId && (raw.team_ids ?? []).includes(teamId))).map(toRow), [loaded, isOwner, teamId]);
  const flaggedCount = rows.filter((row) => row.flagged).length;
  const shown = useMemo(() => rows.filter((row) => !onlyFlagged || row.flagged).sort(compareRows(sort)), [rows, onlyFlagged, sort]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inputs.from || !inputs.to) { setError("Hãy chọn đủ ngày bắt đầu và ngày kết thúc."); return; }
    if (inputs.to < inputs.from) { setError("Ngày kết thúc phải sau hoặc cùng ngày bắt đầu."); return; }
    setError("");
    setApplied(inputs);
  }

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <header className="mb-6"><p className="text-sm font-semibold text-emerald-700">Không gian CLB</p><h1 className="mt-1 text-3xl font-bold">Đóng góp</h1><p className="mt-2 text-sm text-zinc-600">Xem ai hoàn thành việc được giao, ai không. Bảng chỉ để tham khảo, hệ thống không tự động xử lý ai.</p></header>
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {loaded?.error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{loaded.error}</p>}
    {!supabase && <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Thiếu cấu hình Supabase.</p>}
    {canWrite && !isOwner && <p className="mb-4 rounded-lg bg-zinc-100 p-3 text-sm text-zinc-700">{teamId ? "Bảng chỉ hiện thành viên trong ban của bạn." : "Bạn chưa thuộc ban nào nên chưa có thành viên để xem. Hãy nhờ Chủ nhiệm xếp bạn vào một ban."}</p>}
    {!canWrite && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Chỉ Ban chủ nhiệm và Ban chủ chốt được xem bảng đóng góp.</p>}

    {canWrite && <>
      <form onSubmit={apply} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <label className="block min-w-40 flex-1 text-sm">Từ ngày<input type="date" required suppressHydrationWarning value={inputs.from} max={inputs.to || undefined} onChange={(event) => setInputs({ ...inputs, from: event.target.value })} className={inputClass} /></label>
        <label className="block min-w-40 flex-1 text-sm">Đến ngày<input type="date" required suppressHydrationWarning value={inputs.to} min={inputs.from || undefined} onChange={(event) => setInputs({ ...inputs, to: event.target.value })} className={inputClass} /></label>
        <button disabled={!loaded} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loaded ? "Xem" : "Đang tải…"}</button>
        <button type="button" onClick={() => { const next = defaultRange(); setInputs(next); setApplied(next); setError(""); }} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">90 ngày gần nhất</button>
        <p className="w-full text-xs text-zinc-500">Chỉ tính các việc có hạn chót trong khoảng ngày này.</p>
      </form>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
          <div><h2 className="font-semibold">Thành viên ({shown.length}{shown.length !== rows.length ? `/${rows.length}` : ""})</h2>{flaggedCount > 0 && <p className="mt-1 text-xs text-zinc-500">{flaggedCount} người cần nhắc nhở. Sau khi trao đổi, Ban chủ chốt có thể đặt ngừng hoạt động ở mục <Link href="/manage-clubs/members" className="font-medium text-emerald-800 underline">Quản lý thành viên</Link>.</p>}</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyFlagged} onChange={(event) => setOnlyFlagged(event.target.checked)} /> Chỉ người cần nhắc nhở</label>
            <label className="block text-xs font-medium text-zinc-600">Sắp xếp<select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className={inputClass}><option value="rate-asc">Tỉ lệ thấp nhất trước</option><option value="rate-desc">Tỉ lệ cao nhất trước</option><option value="name">Theo tên</option></select></label>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Làm mới</button>
          </div>
        </div>
        {!loaded ? <p role="status" className="p-6 text-sm text-zinc-500">Đang tải bảng đóng góp…</p> : !rows.length ? <p className="p-6 text-sm text-zinc-500">CLB chưa có thành viên hoặc chưa có việc nào trong khoảng này.</p> : !shown.length ? <p className="p-6 text-sm text-zinc-500">Không có ai cần nhắc nhở trong khoảng này.</p> : <div role="region" aria-label="Bảng đóng góp, cuộn ngang để xem đủ cột" tabIndex={0} className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-600"><tr>
              <th scope="col" className="sticky left-0 bg-zinc-50 px-4 py-2 text-left font-medium">Thành viên</th>
              {["Được giao", "Đúng hạn", "Trễ", "Bỏ lỡ", "Đang chờ"].map((label) => <th key={label} scope="col" className="px-3 py-2 text-right font-medium">{label}</th>)}
              <th scope="col" className="px-4 py-2 text-left font-medium">Tỉ lệ hoàn thành</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-100">{shown.map((row) => <tr key={row.member_id}>
              <th scope="row" className="sticky left-0 max-w-[220px] bg-white px-4 py-3 text-left font-normal">
                <p className="break-words font-medium">{row.full_name}{!row.is_active && <span className="ml-2 text-xs font-normal text-zinc-500">Ngừng hoạt động</span>}</p>
                <p className="mt-0.5 break-words text-xs text-zinc-500">{[(row.team_ids ?? []).map((id) => loaded.teams.get(id)).filter(Boolean).join(", "), roleLabel(row.role)].filter(Boolean).join(" · ")}</p>
                {row.flagged && <span className="mt-1 inline-block rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800">Cần nhắc nhở</span>}
              </th>
              <td className="px-3 py-3 text-right tabular-nums">{row.assigned}</td>
              <td className="px-3 py-3 text-right tabular-nums text-emerald-800">{row.done_on_time}</td>
              <td className="px-3 py-3 text-right tabular-nums text-amber-800">{row.done_late}</td>
              <td className={`px-3 py-3 text-right tabular-nums ${row.missed ? "font-semibold text-rose-800" : ""}`}>{row.missed}</td>
              <td className="px-3 py-3 text-right tabular-nums text-zinc-600">{row.pending}</td>
              <td className="px-4 py-3">{row.rate === null ? <span className="text-xs text-zinc-500">Chưa có việc tới hạn</span> : <div className="flex items-center gap-2"><div role="presentation" className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full ${row.flagged ? "bg-rose-600" : "bg-emerald-600"}`} style={{ width: `${Math.round(row.rate * 100)}%` }} /></div><span className="tabular-nums">{Math.round(row.rate * 100)}%</span></div>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <p className="border-t p-4 text-xs text-zinc-500">Tỉ lệ hoàn thành = (đúng hạn + trễ) / (được giao − đang chờ). “Bỏ lỡ” gồm việc bị đánh dấu chưa hoàn thành và việc quá hạn mà chưa xong. Nhãn “Cần nhắc nhở” hiện khi có từ 3 việc đã tới hạn trở lên và tỉ lệ dưới 50%.</p>
      </div>
    </>}
  </section>;
}
