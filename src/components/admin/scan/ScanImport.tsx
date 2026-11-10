"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { facebookProfileKey } from "../../../lib/facebook/profile-key";
import { FRAME_MATCH_THRESHOLD, ringCoverage, ringSignature, signatureDistance } from "../../../lib/facebook/frame-signature";
import { buildBookmarklet, parseScanPayload } from "../../../lib/facebook/bookmarklet";
import { frameImageUrl } from "../../frames/frameUrl";
import { useCurrentAdminClub } from "../AdminClubContext";

type ScanData = NonNullable<ReturnType<typeof parseScanPayload>>;
type ScanItem = ScanData["items"][number];
type Phase = { kind: "reading" } | { kind: "empty" } | { kind: "invalid" } | { kind: "data"; scan: ScanData };
type Member = { id: string; full_name: string; facebook_url: string | null; is_active: boolean };
type Alias = { fb_key: string; member_id: string };
type AssigneeStatus = "pending" | "done" | "missed";
type ScanTask = { id: string; title: string; kind: "engagement" | "avatar"; post_url: string | null; frame_id: string | null; due_at: string; task_assignees: { member_id: string; status: AssigneeStatus }[] };
type ClubData = { key: string; members: Member[]; aliases: Alias[]; tasks: ScanTask[]; error: string };
type FrameSig = { frameId: string; status: "ok" | "thin" | "failed"; sig: number[]; coverage: number[] };
type Verdict = "changed" | "not_changed" | "unreadable" | "na";

const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100";
const kindLabel = { engagement: "Tương tác bài viết", avatar: "Thay avatar" } as const;
const assigneeLabel: Record<AssigneeStatus, string> = { pending: "Chờ", done: "Đã xong trước đó", missed: "Đã đánh dấu chưa hoàn thành" };
const verdictLabel: Record<Verdict, string> = { changed: "Có vẻ đã thay khung", not_changed: "Chưa thấy khung", unreadable: "Không đọc được ảnh", na: "" };
const verdictClass: Record<Verdict, string> = { changed: "bg-emerald-50 text-emerald-800", not_changed: "bg-amber-50 text-amber-800", unreadable: "bg-zinc-100 text-zinc-600", na: "" };
const PAGE = 30;
const STORAGE_KEY = "bit-scan-payload";
const FRAME_MEASURE_SIZE = 192;
const MIN_USABLE_CELLS = 4;
const MIN_COVERAGE = 0.6;
const noopSubscribe = () => () => {};

// Thông báo từ RPC của dự án là tiếng Việt; lỗi gốc của Postgres/mạng thì đổi sang câu chung.
const viMessage = (message: string | undefined, fallback: string) => message && /[àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữự]/i.test(message) ? message : fallback;

function readStoredPayload() {
  try { return window.sessionStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; }
}

async function readFrameSignature(imagePath: string): Promise<Omit<FrameSig, "frameId">> {
  const failed = { status: "failed" as const, sig: [], coverage: [] };
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("load"));
      image.src = frameImageUrl(imagePath);
    });
    const canvas = document.createElement("canvas");
    canvas.width = FRAME_MEASURE_SIZE; canvas.height = FRAME_MEASURE_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return failed;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, FRAME_MEASURE_SIZE, FRAME_MEASURE_SIZE);
    const data = ctx.getImageData(0, 0, FRAME_MEASURE_SIZE, FRAME_MEASURE_SIZE).data;
    const coverage = ringCoverage(data, FRAME_MEASURE_SIZE);
    const usable = coverage.filter((value) => value >= MIN_COVERAGE).length;
    return { status: usable < MIN_USABLE_CELLS ? "thin" : "ok", sig: ringSignature(data, FRAME_MEASURE_SIZE), coverage };
  } catch {
    return failed;
  }
}

function BookmarkletGuide() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  useEffect(() => {
    // React chặn href "javascript:" trong JSX nên đặt bằng DOM sau khi mount.
    const bookmarklet = buildBookmarklet(window.location.origin);
    linkRef.current?.setAttribute("href", bookmarklet);
    if (codeRef.current) codeRef.current.value = bookmarklet;
  }, []);

  async function copy() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(buildBookmarklet(window.location.origin));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Không sao chép được tự động. Hãy mở ô “Xem mã” bên dưới, chọn hết và sao chép.");
    }
  }

  const steps = [
    "Chọn đúng CLB ở thanh bên trước khi quét. Kết quả sẽ được đối chiếu với thành viên của CLB đang chọn.",
    "Hiện thanh dấu trang của trình duyệt (Ctrl + Shift + B trên Chrome hoặc Edge), rồi kéo nút xanh bên dưới lên thanh đó. Nếu không kéo được, bấm “Sao chép mã”, tạo dấu trang mới và dán mã vào ô địa chỉ (URL).",
    "Trên chính trình duyệt đó, đăng nhập Facebook và mở bài viết của CLB.",
    "Bấm vào số lượt cảm xúc để mở hộp “Tất cả cảm xúc”, hoặc mở phần bình luận.",
    "Cuộn hết danh sách trong hộp cho đến khi không còn thêm người. Bookmarklet chỉ đọc những người đang hiện trong trang.",
    "Bấm dấu trang vừa tạo. Một tab mới của trang này sẽ mở với kết quả để đối chiếu.",
  ];

  return <div>
    <ol className="space-y-3 text-sm text-zinc-700">{steps.map((step, index) => <li key={step} className="flex gap-3"><span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-800">{index + 1}</span><span className="min-w-0">{step}</span></li>)}</ol>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <a ref={linkRef} draggable onClick={(event) => event.preventDefault()} aria-label="Quét Facebook BIT: kéo nút này lên thanh dấu trang, không bấm tại đây" title="Kéo nút này lên thanh dấu trang" className="cursor-grab rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Quét Facebook BIT</a>
      <button type="button" onClick={() => void copy()} className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">{copied ? "Đã sao chép" : "Sao chép mã"}</button>
    </div>
    {copyError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{copyError}</p>}
    <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium text-zinc-700">Xem mã</summary><textarea ref={codeRef} readOnly rows={4} aria-label="Mã bookmarklet" onFocus={(event) => event.currentTarget.select()} className="mt-2 w-full break-all rounded-lg border border-zinc-300 bg-zinc-50 p-2 font-mono text-xs" /></details>
    <p className="mt-4 rounded-lg bg-[#f7f8f6] p-3 text-xs text-zinc-600">Dữ liệu nằm trong phần sau dấu # của địa chỉ nên không gửi lên máy chủ nào; việc so khớp chạy ngay trên trình duyệt của bạn. Chỉ nút bấm này đọc trang Facebook, trên máy của bạn.</p>
  </div>;
}

export function ScanImport() {
  const supabase = getSupabaseClient();
  const { id: clubId, role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const liveHash = useSyncExternalStore(noopSubscribe, () => window.location.hash, () => "");
  const [capture, setCapture] = useState<{ hash: string; stored: string } | null>(null);
  const [cleared, setCleared] = useState(false);
  // Giữ lại phần # (hoặc bản đã lưu trong sessionStorage) ngay lần render đầu ở client, rồi mới xóa # khỏi địa chỉ.
  if (capture === null && hydrated) setCapture({ hash: liveHash, stored: readStoredPayload() });
  const phase = useMemo<Phase>(() => {
    if (!capture) return { kind: "reading" };
    if (cleared) return { kind: "empty" };
    const source = capture.hash.length > 1 ? capture.hash : capture.stored;
    if (source.length <= 1) return { kind: "empty" };
    const parsed = parseScanPayload(source);
    return parsed ? { kind: "data", scan: parsed } : { kind: "invalid" };
  }, [capture, cleared]);
  const [reloadKey, setReloadKey] = useState(0);
  const [club, setClub] = useState<ClubData | null>(null);
  const [taskId, setTaskId] = useState("");
  const [frameSig, setFrameSig] = useState<FrameSig | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [attachKey, setAttachKey] = useState("");
  const [attachMember, setAttachMember] = useState("");
  const [unmatchedQuery, setUnmatchedQuery] = useState("");
  const [unmatchedLimit, setUnmatchedLimit] = useState(PAGE);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!capture || capture.hash.length <= 1) return;
    // Lưu bản hợp lệ để không mất khi đổi CLB hoặc tải lại; hộp nhớ này chỉ sống trong tab hiện tại.
    if (phase.kind === "data") { try { window.sessionStorage.setItem(STORAGE_KEY, capture.hash); } catch { /* đầy bộ nhớ thì bỏ qua */ } }
    // Xóa phần # khỏi địa chỉ (tránh lưu dữ liệu trong lịch sử hoặc chia sẻ nhầm).
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [capture, phase.kind]);

  const dataKey = `${clubId}|${reloadKey}`;

  useEffect(() => {
    if (!supabase || !clubId || !canWrite) return;
    let active = true;
    const key = `${clubId}|${reloadKey}`;
    (async () => {
      const [memberResult, aliasResult, taskResult] = await Promise.all([
        supabase.from("club_members").select("id,full_name,facebook_url,is_active").eq("club_id", clubId).order("full_name"),
        supabase.from("member_facebook_aliases").select("fb_key,member_id").eq("club_id", clubId).order("created_at", { ascending: false }),
        supabase.from("tasks").select("id,title,kind,post_url,frame_id,due_at,task_assignees(member_id,status)").eq("club_id", clubId).eq("status", "open").in("kind", ["engagement", "avatar"]).order("due_at", { ascending: true }),
      ]);
      if (!active) return;
      const failure = memberResult.error ?? aliasResult.error ?? taskResult.error;
      setClub({ key, members: (memberResult.data ?? []) as Member[], aliases: (aliasResult.data ?? []) as Alias[], tasks: (taskResult.data ?? []) as unknown as ScanTask[], error: failure ? "Không tải được thành viên hoặc việc. Vui lòng thử lại." : "" });
    })();
    return () => { active = false; };
  }, [supabase, clubId, canWrite, reloadKey]);

  const loaded = club && club.key === dataKey ? club : null;
  const allMembers = useMemo(() => loaded?.members ?? [], [loaded]);
  const members = useMemo(() => allMembers.filter((member) => member.is_active), [allMembers]);
  const aliases = useMemo(() => loaded?.aliases ?? [], [loaded]);
  const tasks = useMemo(() => loaded?.tasks ?? [], [loaded]);
  const task = tasks.find((row) => row.id === taskId) ?? null;
  const taskFrameId = task?.kind === "avatar" ? task.frame_id : null;

  useEffect(() => {
    if (!supabase || !taskFrameId) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from("avatar_frames").select("image_path").eq("id", taskFrameId).maybeSingle();
      const result = data?.image_path ? await readFrameSignature(data.image_path as string) : { status: "failed" as const, sig: [], coverage: [] };
      if (active) setFrameSig({ frameId: taskFrameId, ...result });
    })();
    return () => { active = false; };
  }, [supabase, taskFrameId]);

  const currentFrameSig = taskFrameId && frameSig?.frameId === taskFrameId ? frameSig : null;
  const frameLoading = !!taskFrameId && !currentFrameSig;
  const frameUsable = currentFrameSig?.status === "ok" ? currentFrameSig : null;
  const scan = phase.kind === "data" ? phase.scan : null;

  const { matched, unmatched, missing } = useMemo(() => {
    const keyToMember = new Map<string, Member>();
    const byId = new Map(members.map((member) => [member.id, member]));
    for (const member of members) {
      const key = member.facebook_url ? facebookProfileKey(member.facebook_url) : null;
      if (key) keyToMember.set(key, member);
    }
    for (const alias of aliases) {
      const member = byId.get(alias.member_id);
      if (member) keyToMember.set(alias.fb_key, member);
    }
    const seen = new Set<string>();
    const matchedRows: { item: ScanItem; member: Member }[] = [];
    const unmatchedRows: ScanItem[] = [];
    for (const item of scan?.items ?? []) {
      const member = keyToMember.get(item.key);
      if (!member) { unmatchedRows.push(item); continue; }
      if (seen.has(member.id)) continue;
      seen.add(member.id);
      matchedRows.push({ item, member });
    }
    return { matched: matchedRows, unmatched: unmatchedRows, missing: members.filter((member) => !seen.has(member.id)) };
  }, [members, aliases, scan]);

  function verdictFor(item: ScanItem): Verdict {
    if (task?.kind !== "avatar" || !frameUsable) return "na";
    if (!item.sig) return "unreadable";
    return signatureDistance(item.sig, frameUsable.sig, frameUsable.coverage) <= FRAME_MATCH_THRESHOLD ? "changed" : "not_changed";
  }

  const rows = matched.map(({ item, member }) => {
    const assignee = task?.task_assignees.find((row) => row.member_id === member.id) ?? null;
    const verdict = verdictFor(item);
    const eligible = assignee?.status === "pending";
    // Không tick sẵn: admin tự chọn hoặc dùng các nút chọn nhanh.
    const checked = eligible && (overrides[`${task?.id}:${member.id}`] ?? false);
    return { item, member, assignee, verdict, eligible, checked };
  });
  const selectedIds = rows.filter((row) => row.checked).map((row) => row.member.id);
  const eligibleCount = rows.filter((row) => row.eligible).length;
  const missingStatus = (member: Member) => task?.task_assignees.find((row) => row.member_id === member.id)?.status ?? null;
  const query = unmatchedQuery.trim().toLowerCase();
  const filteredUnmatched = query ? unmatched.filter((item) => item.name.toLowerCase().includes(query) || item.key.includes(query)) : unmatched;
  const memberName = (memberId: string) => allMembers.find((member) => member.id === memberId)?.full_name ?? "Thành viên đã xóa";

  function setChecked(memberId: string, value: boolean) {
    setOverrides((current) => ({ ...current, [`${task?.id}:${memberId}`]: value }));
  }

  function selectRows(pick: (row: (typeof rows)[number]) => boolean) {
    setOverrides((current) => ({ ...current, ...Object.fromEntries(rows.filter((row) => row.eligible).map((row) => [`${task?.id}:${row.member.id}`, pick(row)])) }));
  }

  function clearScan() {
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* bỏ qua */ }
    setCleared(true); setTaskId(""); setOverrides({}); setAttachKey(""); setError("");
    setNotice("Đã xóa kết quả quét khỏi trang này.");
  }

  async function attach(item: ScanItem) {
    if (!supabase || !attachMember) return;
    setBusy(`attach:${item.key}`); setError(""); setNotice("");
    const { data, error: insertError } = await supabase.from("member_facebook_aliases").insert({ club_id: clubId, fb_key: item.key, member_id: attachMember }).select("fb_key");
    setBusy("");
    if (insertError) {
      if (insertError.code === "23505") {
        const existing = aliases.find((alias) => alias.fb_key === item.key);
        setError(`Tài khoản này đã được gắn với ${existing ? memberName(existing.member_id) : "một thành viên khác"}. Gỡ trước rồi gắn lại.`);
        setReloadKey((key) => key + 1);
      } else setError("Không gắn được tài khoản Facebook. Vui lòng thử lại.");
      return;
    }
    if (!data?.length) { setError("Không gắn được: bạn không có quyền hoặc dữ liệu không hợp lệ."); return; }
    setClub((current) => current ? { ...current, aliases: [{ fb_key: item.key, member_id: attachMember }, ...current.aliases] } : current);
    setAttachKey(""); setAttachMember("");
    setNotice(`Đã gắn “${item.name}” với ${memberName(attachMember)}. Lần quét sau sẽ tự nhận ra người này.`);
  }

  async function detach(alias: Alias) {
    if (!supabase) return;
    setBusy(`detach:${alias.fb_key}`); setError(""); setNotice("");
    const { data, error: deleteError } = await supabase.from("member_facebook_aliases").delete().eq("club_id", clubId).eq("fb_key", alias.fb_key).select("fb_key");
    setBusy("");
    if (deleteError) { setError("Không gỡ được tài khoản Facebook. Vui lòng thử lại."); return; }
    if (!data?.length) { setError("Không gỡ được: bạn không có quyền hoặc tài khoản này đã được gỡ rồi."); setReloadKey((key) => key + 1); return; }
    setClub((current) => current ? { ...current, aliases: current.aliases.filter((row) => row.fb_key !== alias.fb_key) } : current);
    setNotice(`Đã gỡ tài khoản Facebook khỏi ${memberName(alias.member_id)}.`);
  }

  async function apply() {
    if (!supabase || !task || !selectedIds.length) return;
    setBusy("apply"); setError(""); setNotice("");
    const { data, error: rpcError } = await supabase.rpc("apply_task_scan", { p_task_id: task.id, p_member_ids: selectedIds });
    setBusy("");
    if (rpcError) { setError(viMessage(rpcError.message, "Không đánh dấu được. Vui lòng thử lại.")); return; }
    const changed = typeof data === "number" ? data : selectedIds.length;
    setNotice(`Đã đánh dấu xong cho ${changed} người${changed < selectedIds.length ? ` (${selectedIds.length - changed} người đã được cập nhật từ trước)` : ""}. Bạn có thể quét thêm (ví dụ bình luận) và đánh dấu tiếp.`);
    setReloadKey((key) => key + 1);
  }

  const dataLoading = canWrite && !!supabase && !loaded;
  const aliasSection = loaded && <div className="overflow-hidden rounded-xl border bg-white">
    <div className="border-b p-4"><h2 className="font-semibold">Tài khoản Facebook đã gắn ({aliases.length})</h2><p className="mt-1 text-xs text-zinc-500">Những tài khoản bạn đã gắn tay với thành viên. Gỡ nếu gắn nhầm hoặc muốn gắn lại cho người khác.</p></div>
    {aliases.length ? <ul className="divide-y divide-zinc-100">{aliases.map((alias) => <li key={alias.fb_key} className="flex flex-wrap items-start justify-between gap-2 p-4">
      <div className="min-w-0"><p className="break-words text-sm font-medium">{memberName(alias.member_id)}{allMembers.find((member) => member.id === alias.member_id)?.is_active === false && <span className="ml-2 text-xs font-normal text-zinc-500">Ngừng hoạt động</span>}</p><p className="break-all text-xs text-zinc-500">{alias.fb_key}</p></div>
      <button type="button" disabled={busy === `detach:${alias.fb_key}`} onClick={() => void detach(alias)} className="shrink-0 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-800 disabled:opacity-50">{busy === `detach:${alias.fb_key}` ? "Đang gỡ…" : "Gỡ"}</button>
    </li>)}</ul> : <p className="p-6 text-sm text-zinc-500">Chưa gắn tài khoản Facebook nào. Khi kết quả quét có người chưa khớp, bạn có thể gắn họ với thành viên ở mục “Không khớp”.</p>}
  </div>;

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <header className="mb-6"><p className="text-sm font-semibold text-emerald-700">Không gian CLB</p><h1 className="mt-1 text-3xl font-bold">Đối chiếu Facebook</h1><p className="mt-2 max-w-3xl text-sm text-zinc-600">Kiểm tra thành viên nào đã react, bình luận hoặc đổi avatar có khung. Bạn tự quét bài viết trên trình duyệt của mình bằng bookmarklet; trang này chỉ so khớp và đánh dấu xong. Kết quả nhận diện avatar là thử nghiệm, hãy xem lại trước khi xác nhận.</p></header>
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!supabase && <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Thiếu cấu hình Supabase.</p>}
    {!canWrite && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Chỉ Ban chủ nhiệm và Ban chủ chốt được đối chiếu và đánh dấu việc.</p>}
    {loaded?.error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{loaded.error}</p>}

    {phase.kind === "reading" && <p role="status" className="text-sm text-zinc-500">Đang đọc dữ liệu quét…</p>}

    {(phase.kind === "empty" || phase.kind === "invalid") && <div className="space-y-6">
      <div className="rounded-xl border bg-white p-5">
        {phase.kind === "invalid" && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Dữ liệu quét không hợp lệ hoặc đã bị cắt bớt. Hãy quét lại bài viết bằng bookmarklet.</p>}
        <h2 className="font-semibold">Cách quét một bài viết</h2>
        <p className="mb-4 mt-1 text-xs text-zinc-500">Cài bookmarklet một lần, dùng lại cho mọi bài viết.</p>
        <BookmarkletGuide />
      </div>
      {aliasSection}
    </div>}

    {scan && <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 text-sm text-amber-950">
            <h2 className="font-semibold">Kết quả quét ({scan.items.length} người)</h2>
            <p className="mt-1">Dữ liệu này đến từ địa chỉ của trang, nên chỉ dùng nếu chính bạn vừa quét. Nếu bạn không nhớ đã quét, hãy xóa kết quả.</p>
            <p className="mt-2 text-xs">Quét lúc {Number.isNaN(Date.parse(scan.scannedAt)) ? "không rõ" : new Date(scan.scannedAt).toLocaleString("vi-VN")}, {scan.items.length} người.</p>
            <p className="mt-1 break-all text-xs">Nguồn: {scan.source}</p>
            <p className="mt-2 text-xs">Lưu ý: khi quét phần bình luận, người được nhắc tên (@) trong bình luận cũng bị tính là đã tham gia. Hãy xem lại danh sách trước khi đánh dấu.</p>
          </div>
          <button type="button" onClick={clearScan} className="shrink-0 rounded-lg border border-amber-700 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100">Xóa kết quả quét</button>
        </div>
        <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium text-emerald-800">Quét thêm bài viết hoặc phần bình luận</summary><div className="mt-3 rounded-lg bg-white p-4"><BookmarkletGuide /></div></details>
      </div>

      {dataLoading && <p role="status" className="text-sm text-zinc-500">Đang tải thành viên và việc…</p>}

      {loaded && <>
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Việc cần đánh dấu</h2>
          {tasks.length ? <>
            <label className="mt-3 block text-sm">Chọn việc đang mở<select value={taskId} onChange={(event) => { setTaskId(event.target.value); setNotice(""); setError(""); }} className={inputClass}><option value="">Chỉ xem, chưa chọn việc</option>{tasks.map((row) => <option key={row.id} value={row.id}>{kindLabel[row.kind]}: {row.title}</option>)}</select></label>
            {task && <div className="mt-3 space-y-1 text-sm text-zinc-600">
              <p className="break-words"><span className="font-medium text-zinc-800">{kindLabel[task.kind]}</span>, hạn {new Date(task.due_at).toLocaleString("vi-VN")}, {task.task_assignees.filter((row) => row.status === "pending").length}/{task.task_assignees.length} người còn chờ.</p>
              {task.kind === "engagement" && task.post_url?.startsWith("https://") && <p><a href={task.post_url} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-800 underline">Mở bài viết của việc này</a></p>}
              <p className="text-xs text-zinc-500">Chưa ai được tick sẵn. Hãy chọn từng người, hoặc dùng nút chọn nhanh ở mục “Khớp”.</p>
              {task.kind === "avatar" && !task.frame_id && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Việc này chưa gắn khung nên không tự nhận diện được avatar. Hãy tick tay những người bạn đã xác nhận.</p>}
              {task.kind === "avatar" && task.frame_id && frameLoading && <p role="status" className="text-xs text-zinc-500">Đang đọc ảnh khung…</p>}
              {task.kind === "avatar" && currentFrameSig?.status === "failed" && <p role="alert" className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Không đọc được ảnh khung nên không so sánh được. Hãy tick tay.</p>}
              {task.kind === "avatar" && currentFrameSig?.status === "thin" && <p role="alert" className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Khung không có viền đủ dày để nhận diện, nên trang không đoán. Hãy xem avatar bằng mắt và tick tay.</p>}
              {task.kind === "avatar" && frameUsable && <p className="text-xs text-zinc-500">Nhận diện chỉ là phỏng đoán theo màu viền avatar nhỏ, hãy xem lại bằng mắt trước khi xác nhận.</p>}
            </div>}
          </> : <p className="mt-3 text-sm text-zinc-500">CLB chưa có việc đang mở loại “Tương tác bài viết” hoặc “Thay avatar”. <Link href="/manage-clubs/tasks" className="font-medium text-emerald-800 underline">Tạo việc ở mục Giao việc</Link> rồi quay lại quét. Bạn vẫn có thể xem đối chiếu và gắn tài khoản Facebook ở dưới.</p>}
        </div>

        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4"><h2 className="font-semibold">Khớp ({matched.length})</h2>{task && eligibleCount > 0 && <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => selectRows(() => true)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Chọn hết người khớp</button>
            {frameUsable && <button type="button" onClick={() => selectRows((row) => row.verdict === "changed")} className="rounded-lg border border-emerald-700 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">Chọn người có vẻ đã thay khung</button>}
            <button type="button" onClick={() => selectRows(() => false)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Bỏ chọn hết</button></div>}</div>
          {rows.length ? <ul className="divide-y divide-zinc-100">{rows.map((row) => <li key={row.member.id}>
            <label className={`flex items-start gap-3 p-4 ${row.eligible ? "cursor-pointer hover:bg-zinc-50" : "opacity-70"}`}>
              <input type="checkbox" disabled={!task || !row.eligible} checked={row.checked} onChange={(event) => setChecked(row.member.id, event.target.checked)} className="mt-1 size-4 shrink-0" />
              <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="break-words font-medium">{row.member.full_name}</span>{row.verdict !== "na" && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${verdictClass[row.verdict]}`}>{verdictLabel[row.verdict]}</span>}</span>
                <span className="mt-0.5 block break-words text-xs text-zinc-500">Trên Facebook: {row.item.name || row.item.key}{task && (row.assignee ? ` · ${assigneeLabel[row.assignee.status]}` : " · Không được giao việc này")}</span></span>
            </label>
          </li>)}</ul> : <p className="p-6 text-sm text-zinc-500">Chưa có người nào trong kết quả quét khớp với thành viên CLB. Hãy gắn tài khoản ở mục “Không khớp” bên dưới.</p>}
          {task && <div className="flex flex-wrap items-center gap-3 border-t p-4"><button type="button" disabled={busy === "apply" || !selectedIds.length} onClick={() => void apply()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "apply" ? "Đang lưu…" : `Đánh dấu xong cho ${selectedIds.length} người`}</button><p className="text-xs text-zinc-500">Chỉ đổi người đang “Chờ”, không đụng người đã xong hoặc đã bị đánh dấu chưa hoàn thành.</p></div>}
        </div>

        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b p-4"><h2 className="font-semibold">Không khớp ({unmatched.length})</h2><p className="mt-1 text-xs text-zinc-500">Người trong kết quả quét chưa nhận ra là thành viên nào, thường là người ngoài CLB hoặc thành viên chưa điền link Facebook. Gắn tài khoản để lần sau tự khớp.</p></div>
          {unmatched.length > 0 && <div className="border-b p-4"><label className="block text-xs font-medium text-zinc-600">Tìm trong danh sách<input type="search" value={unmatchedQuery} onChange={(event) => { setUnmatchedQuery(event.target.value); setUnmatchedLimit(PAGE); }} className={inputClass} placeholder="Gõ tên để lọc" /></label></div>}
          {filteredUnmatched.length ? <ul className="divide-y divide-zinc-100">{filteredUnmatched.slice(0, unmatchedLimit).map((item) => <li key={item.key} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-medium">{item.name || "(Không có tên)"}</p><p className="break-all text-xs text-zinc-500">{item.key}</p></div>
              {attachKey !== item.key && <button type="button" onClick={() => { setAttachKey(item.key); setAttachMember(""); }} className="shrink-0 rounded-lg border border-emerald-700 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">Gắn với thành viên</button>}</div>
            {attachKey === item.key && <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-zinc-50 p-3"><label className="min-w-52 flex-1 text-xs font-medium text-zinc-600">Thành viên<select value={attachMember} onChange={(event) => setAttachMember(event.target.value)} className={inputClass}><option value="">Chọn thành viên</option>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></label>
              <button type="button" disabled={!attachMember || busy === `attach:${item.key}`} onClick={() => void attach(item)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === `attach:${item.key}` ? "Đang gắn…" : "Gắn"}</button>
              <button type="button" disabled={busy === `attach:${item.key}`} onClick={() => setAttachKey("")} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-white disabled:opacity-50">Hủy</button></div>}
          </li>)}</ul> : <p className="p-6 text-sm text-zinc-500">{unmatched.length ? "Không có người phù hợp với từ khóa." : "Mọi người trong kết quả quét đều đã khớp."}</p>}
          {filteredUnmatched.length > unmatchedLimit && <div className="border-t p-4"><button type="button" onClick={() => setUnmatchedLimit((limit) => limit + PAGE)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Hiện thêm ({filteredUnmatched.length - unmatchedLimit} người)</button></div>}
        </div>

        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b p-4"><h2 className="font-semibold">Thành viên chưa thấy ({missing.length})</h2><p className="mt-1 text-xs text-zinc-500">Thành viên đang hoạt động không có trong kết quả quét. Có thể họ chưa làm, hoặc chưa cuộn hết danh sách, hoặc tài khoản Facebook chưa được gắn.</p></div>
          {missing.length ? <ul className="divide-y divide-zinc-100">{missing.map((member) => { const status = missingStatus(member); return <li key={member.id} className="flex flex-wrap items-start justify-between gap-2 p-4 text-sm"><span className="min-w-0 break-words font-medium">{member.full_name}{!member.facebook_url && <span className="ml-2 text-xs font-normal text-amber-800">Chưa có link Facebook</span>}</span>{task && <span className="text-xs text-zinc-500">{status ? assigneeLabel[status] : "Không được giao việc này"}</span>}</li>; })}</ul> : <p className="p-6 text-sm text-zinc-500">Mọi thành viên đang hoạt động đều có trong kết quả quét.</p>}
        </div>

        {aliasSection}
      </>}
    </div>}
  </section>;
}
