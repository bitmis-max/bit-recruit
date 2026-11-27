"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabase/client";
import { friendlyError } from "../../lib/ui/friendly-error";
import { useCurrentAdminClub } from "./AdminClubContext";
import { EmptyState } from "./ui/EmptyState";
import { PageHeader } from "./ui/PageHeader";
import { Panel } from "./ui/Panel";

type TileKey = "pending" | "campaign" | "overdue" | "soon" | "active" | "noAccount";
type TileData = { value: string; hint: string; attention: boolean } | { error: string };
type Loaded = { clubId: string; tiles: Partial<Record<TileKey, TileData>> };

const DAY = 24 * 60 * 60 * 1000;
const ROOT = "/manage-clubs";

function daysLeftText(endDate: string | null, now: number) {
  if (!endDate) return "Chưa đặt hạn đóng";
  const left = Math.ceil((Date.parse(endDate) - now) / DAY);
  return left > 0 ? `Còn ${left} ngày` : "Đã quá hạn đóng";
}

export function AdminOverview() {
  const { id: clubId, role, can } = useCurrentAdminClub();
  const pathname = usePathname();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const isStaff = role === "owner" || role === "admin";
  const canRecruit = can("recruitment");
  const canMembers = can("members");
  // Các tab được giữ mounted nên chỉ tải khi đang xem Tổng quan; mỗi lần quay lại thì số liệu được làm mới.
  const visible = pathname === ROOT;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!visible || !supabase || !clubId) return;
    let active = true;
    const now = Date.now();
    const put = (key: TileKey, data: TileData) => {
      if (active) setLoaded((prev) => ({ clubId, tiles: { ...(prev?.clubId === clubId ? prev.tiles : {}), [key]: data } }));
    };
    const fail = (key: TileKey, error: unknown) => put(key, { error: friendlyError(error, "Không tải được số liệu.") });
    // Mỗi ô tải độc lập: lỗi ở ô này không làm hỏng ô khác.
    const count = (key: TileKey, query: PromiseLike<{ count: number | null; error: unknown }>, hint: string, attentionWhenPositive: boolean) =>
      query.then(({ count: total, error }) => error ? fail(key, error) : put(key, { value: String(total ?? 0), hint, attention: attentionWhenPositive && (total ?? 0) > 0 }), (error) => fail(key, error));
    const head = { count: "exact", head: true } as const;

    if (canRecruit) {
      void count("pending", supabase.from("applications").select("id, recruitment_campaigns!inner(club_id)", head).eq("status", "submitted").eq("recruitment_campaigns.club_id", clubId), "Đơn đang chờ xem", true);
      void supabase.from("recruitment_campaigns").select("name,end_date").eq("club_id", clubId).eq("status", "open").order("end_date", { ascending: true, nullsFirst: false })
        .then(({ data, error }) => {
          if (error) return fail("campaign", error);
          if (!data?.length) return put("campaign", { value: "—", hint: "Chưa có đợt mở", attention: false });
          // Không có job tự đóng đợt: đợt quá hạn vẫn 'open'. Đưa đợt còn hạn lên trước (sort ổn định, giữ thứ tự end_date).
          const expired = (row: { end_date: string | null }) => row.end_date !== null && Date.parse(row.end_date) < now;
          const [first] = [...data].sort((a, b) => Number(expired(a)) - Number(expired(b)));
          const extra = data.length > 1 ? ` · +${data.length - 1} đợt khác` : "";
          put("campaign", { value: first.name, hint: `${daysLeftText(first.end_date, now)}${extra}`, attention: expired(first) });
        }, (error) => fail("campaign", error));
    }
    if (isStaff) {
      const open = () => supabase.from("tasks").select("id", head).eq("club_id", clubId).eq("status", "open");
      void count("overdue", open().lt("due_at", new Date(now).toISOString()), "Việc đã quá hạn, chưa đóng", true);
      void count("soon", open().gte("due_at", new Date(now).toISOString()).lte("due_at", new Date(now + 3 * DAY).toISOString()), "Đến hạn trong 72 giờ tới", false);
    }
    if (canMembers) {
      const members = () => supabase.from("club_members").select("id", head).eq("club_id", clubId).eq("is_active", true);
      void count("active", members(), "Đang hoạt động trong CLB", false);
      void count("noAccount", members().not("email", "is", null).is("user_id", null), "Có email nhưng chưa tạo tài khoản", false);
    }
    return () => { active = false; };
  }, [visible, clubId, canRecruit, canMembers, isStaff]);

  const tiles = loaded?.clubId === clubId ? loaded.tiles : {};
  type Group = { title: string; items: { key: TileKey; label: string; href: string }[] };
  const allGroups: Group[] = [
    { title: "Tuyển thành viên", items: canRecruit ? [
      { key: "pending", label: "Đơn mới chờ xử lý", href: `${ROOT}/recruitment/applications` },
      { key: "campaign", label: "Đợt tuyển đang mở", href: `${ROOT}/recruitment` },
    ] : [] },
    { title: "Việc được giao", items: isStaff ? [
      { key: "overdue", label: "Việc quá hạn", href: `${ROOT}/tasks` },
      { key: "soon", label: "Việc sắp đến hạn", href: `${ROOT}/tasks` },
    ] : [] },
    { title: "Thành viên", items: canMembers ? [
      { key: "active", label: "Thành viên đang hoạt động", href: `${ROOT}/members` },
      { key: "noAccount", label: "Chưa có tài khoản", href: `${ROOT}/members` },
    ] : [] },
  ];
  const groups = allGroups.filter((group) => group.items.length);

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <PageHeader title="Tổng quan" />
    {groups.length ? groups.map((group) => <div key={group.title} className="mt-6 first:mt-0">
      <h2 className="text-sm font-semibold text-zinc-700">{group.title}</h2>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2">{group.items.map((item) => <li key={item.key}><Tile label={item.label} href={item.href} data={tiles[item.key]} /></li>)}</ul>
    </div>) : <Panel padded={false}><EmptyState title="Chưa có số liệu để hiển thị" description="Chọn một mục ở menu bên trái để bắt đầu, hoặc nhờ Ban chủ nhiệm cấp thêm quyền." /></Panel>}
  </section>;
}

function Tile({ label, href, data }: { label: string; href: string; data: TileData | undefined }) {
  const attention = !!data && "attention" in data && data.attention;
  return <Link href={href} className={`block h-full rounded-xl border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${attention ? "border-amber-300 bg-amber-50 hover:bg-amber-100/70" : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"}`}>
    <span className="block text-sm font-medium text-zinc-600">{label}</span>
    {!data ? <span role="status" aria-label="Đang tải" className="mt-2 block"><span className="block h-8 w-16 animate-pulse rounded bg-zinc-100" /><span className="mt-2 block h-3 w-32 animate-pulse rounded bg-zinc-100" /></span>
      : "error" in data ? <><span className="mt-1 block text-2xl font-semibold text-zinc-400">—</span><span role="alert" className="mt-1 block text-xs text-rose-700">{data.error}</span></>
      : <><span className={`mt-1 block break-words text-2xl font-semibold tabular-nums ${attention ? "text-amber-900" : "text-zinc-900"} ${data.value.length > 8 ? "text-lg leading-8" : ""}`}>{data.value}</span><span className="mt-1 block text-xs text-zinc-500">{data.hint}</span></>}
  </Link>;
}
