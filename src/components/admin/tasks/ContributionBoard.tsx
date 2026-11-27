"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { friendlyError } from "../../../lib/ui/friendly-error";
import { useCurrentAdminClub } from "../AdminClubContext";
import { roleLabel } from "../roles";
import { useReloadOnAdminChange } from "../adminClient";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Field, inputClass } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { Panel } from "../ui/Panel";

type Range = { from: string; to: string };
type RawRow = { member_id: string; full_name: string; team_id: string | null; team_ids: string[] | null; role: string; is_active: boolean; assigned: number; done_on_time: number; done_late: number; missed: number; pending: number };
type Loaded = { key: string; rows: RawRow[]; teams: Map<string, string>; error: string };
type Row = RawRow & { due: number; rate: number | null; flagged: boolean };
type SortMode = "rate-asc" | "rate-desc" | "name";

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
        error: rpcResult.error ? friendlyError(rpcResult.error, "Không tải được bảng đóng góp. Vui lòng thử lại.") : "",
      });
    })();
    return () => { active = false; };
  }, [supabase, clubId, canWrite, applied, reloadKey]);

  // Thành viên hoặc ban đổi ở tab khác: tính lại bảng.
  useReloadOnAdminChange(() => setReloadKey((value) => value + 1));

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
    <PageHeader title="Đóng góp" description="Xem ai hoàn thành việc được giao, ai không. Bảng chỉ để tham khảo, hệ thống không tự động xử lý ai." />
    {error && <Notice tone="error">{error}</Notice>}
    {loaded?.error && <Notice tone="error">{loaded.error}</Notice>}
    {!supabase && <Notice tone="warning">Thiếu cấu hình Supabase.</Notice>}
    {canWrite && !isOwner && <Notice>{teamId ? "Bảng chỉ hiện thành viên trong ban của bạn." : "Bạn chưa thuộc ban nào nên chưa có thành viên để xem. Hãy nhờ Chủ nhiệm xếp bạn vào một ban."}</Notice>}
    {!canWrite && <Notice tone="warning">Chỉ Ban chủ nhiệm và Ban chủ chốt được xem bảng đóng góp.</Notice>}

    {canWrite && <>
      <form onSubmit={apply} className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Từ ngày" className="min-w-40"><input type="date" required suppressHydrationWarning value={inputs.from} max={inputs.to || undefined} onChange={(event) => setInputs({ ...inputs, from: event.target.value })} className={inputClass} /></Field>
          <Field label="Đến ngày" className="min-w-40"><input type="date" required suppressHydrationWarning value={inputs.to} min={inputs.from || undefined} onChange={(event) => setInputs({ ...inputs, to: event.target.value })} className={inputClass} /></Field>
          <Button type="submit" variant="primary" disabled={!loaded}>{loaded ? "Xem" : "Đang tải…"}</Button>
          <Button onClick={() => { const next = defaultRange(); setInputs(next); setApplied(next); setError(""); }}>90 ngày gần nhất</Button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Chỉ tính các việc có hạn chót trong khoảng ngày này.</p>
      </form>

      <Panel padded={false} title={`Thành viên (${shown.length}${shown.length !== rows.length ? `/${rows.length}` : ""})`} actions={<>
        <label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={onlyFlagged} onChange={(event) => setOnlyFlagged(event.target.checked)} /> Chỉ người cần nhắc nhở</label>
        <select aria-label="Sắp xếp" value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className={`${inputClass} w-auto!`}><option value="rate-asc">Tỉ lệ thấp nhất trước</option><option value="rate-desc">Tỉ lệ cao nhất trước</option><option value="name">Theo tên</option></select>
        <Button variant="ghost" size="sm" icon="refresh" onClick={() => setReloadKey((value) => value + 1)}>Làm mới</Button>
      </>}>
        {flaggedCount > 0 && <p className="border-b border-zinc-100 px-4 py-2.5 text-xs text-zinc-600 sm:px-5">{flaggedCount} người cần nhắc nhở. Sau khi trao đổi, Ban chủ chốt có thể đặt ngừng hoạt động ở mục <Link href="/manage-clubs/members" className="font-medium text-emerald-800 underline">Quản lý thành viên</Link>.</p>}
        {!loaded ? <div role="status" aria-label="Đang tải bảng đóng góp" className="space-y-2 p-4 sm:p-5">{[0, 1, 2, 3].map((item) => <div key={item} className="h-10 animate-pulse rounded-lg bg-zinc-100" />)}</div>
          : !rows.length ? <EmptyState title="Chưa có dữ liệu" description="CLB chưa có thành viên hoặc chưa có việc nào trong khoảng này." />
          : !shown.length ? <EmptyState title="Không có ai cần nhắc nhở trong khoảng này" />
          : <div role="region" aria-label="Bảng đóng góp, cuộn ngang để xem đủ cột" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-600"><tr>
                <th scope="col" className="sticky left-0 bg-zinc-50 px-4 py-2 text-left font-medium sm:px-5">Thành viên</th>
                {["Được giao", "Đúng hạn", "Trễ", "Bỏ lỡ", "Đang chờ"].map((label) => <th key={label} scope="col" className="px-3 py-2 text-right font-medium">{label}</th>)}
                <th scope="col" className="px-4 py-2 text-left font-medium sm:px-5">Tỉ lệ hoàn thành</th>
              </tr></thead>
              <tbody className="divide-y divide-zinc-100">{shown.map((row) => <tr key={row.member_id} className="hover:bg-zinc-50/60">
                <th scope="row" className="sticky left-0 max-w-[220px] bg-white px-4 py-2.5 text-left font-normal sm:px-5">
                  <p className="break-words font-medium">{row.full_name}{!row.is_active && <span className="ml-2 text-xs font-normal text-zinc-500">Ngừng hoạt động</span>}{row.flagged && <span className="ml-2 inline-block rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800">Cần nhắc nhở</span>}</p>
                  <p className="mt-0.5 break-words text-xs text-zinc-500">{[(row.team_ids ?? []).map((id) => loaded.teams.get(id)).filter(Boolean).join(", "), roleLabel(row.role)].filter(Boolean).join(" · ")}</p>
                </th>
                <td className="px-3 py-2.5 text-right tabular-nums">{row.assigned}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-emerald-800">{row.done_on_time}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-amber-800">{row.done_late}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${row.missed ? "font-semibold text-rose-800" : ""}`}>{row.missed}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-600">{row.pending}</td>
                <td className="px-4 py-2.5 sm:px-5">{row.rate === null ? <span className="text-xs text-zinc-500">Chưa có việc tới hạn</span> : <div className="flex items-center gap-2"><div role="presentation" className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full ${row.flagged ? "bg-rose-600" : "bg-emerald-600"}`} style={{ width: `${Math.round(row.rate * 100)}%` }} /></div><span className="tabular-nums">{Math.round(row.rate * 100)}%</span></div>}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        <p className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500 sm:px-5">Tỉ lệ hoàn thành = (đúng hạn + trễ) / (được giao − đang chờ). “Bỏ lỡ” gồm việc bị đánh dấu chưa hoàn thành và việc quá hạn mà chưa xong. Nhãn “Cần nhắc nhở” hiện khi có từ 3 việc đã tới hạn trở lên và tỉ lệ dưới 50%.</p>
      </Panel>
    </>}
  </section>;
}
