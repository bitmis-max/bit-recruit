"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { friendlyError } from "../../../lib/ui/friendly-error";
import { facebookProfileKey } from "../../../lib/facebook/profile-key";
import { FRAME_MATCH_THRESHOLD, ringCoverage, ringSignature, signatureDistance } from "../../../lib/facebook/frame-signature";
import { buildBookmarklet, parseScanPayload } from "../../../lib/facebook/bookmarklet";
import { frameImageUrl } from "../../frames/frameUrl";
import { useCurrentAdminClub } from "../AdminClubContext";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { Panel } from "../ui/Panel";
import { useReloadOnAdminChange } from "../adminClient";
import { samePost } from "./postMatch";

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

function BookmarkletGuide({ primary = true }: { primary?: boolean }) {
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
    "Hiện thanh dấu trang của trình duyệt (Ctrl + Shift + B trên Chrome hoặc Edge), rồi kéo nút “Quét Facebook BIT” bên dưới lên thanh đó. Nếu không kéo được, bấm “Sao chép mã”, tạo dấu trang mới và dán mã vào ô địa chỉ (URL).",
    "Trên chính trình duyệt đó, đăng nhập Facebook và mở bài viết của CLB.",
    "Bấm vào số lượt cảm xúc để mở hộp “Tất cả cảm xúc”, hoặc mở phần bình luận.",
    "Cuộn hết danh sách trong hộp cho đến khi không còn thêm người. Bookmarklet chỉ đọc những người đang hiện trong trang.",
    "Bấm dấu trang vừa tạo. Một tab mới của trang này sẽ mở với kết quả để đối chiếu.",
  ];

  return <div>
    <ol className="space-y-3 text-sm text-zinc-700">{steps.map((step, index) => <li key={step} className="flex gap-3"><span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700">{index + 1}</span><span className="min-w-0">{step}</span></li>)}</ol>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <a ref={linkRef} draggable onClick={(event) => event.preventDefault()} aria-label="Quét Facebook BIT: kéo nút này lên thanh dấu trang, không bấm tại đây" title="Kéo nút này lên thanh dấu trang" className={`inline-flex h-9 cursor-grab items-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${primary ? "bg-emerald-700 text-white hover:bg-emerald-800" : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"}`}><Icon name="grip" />Quét Facebook BIT</a>
      <Button variant="secondary" icon={copied ? "check" : undefined} onClick={() => void copy()}>{copied ? "Đã sao chép" : "Sao chép mã"}</Button>
    </div>
    {copyError && <Notice tone="error" className="mt-3 mb-0!">{copyError}</Notice>}
    <details className="mt-3 text-sm"><summary className="cursor-pointer rounded font-medium text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">Xem mã</summary><textarea ref={codeRef} readOnly rows={4} aria-label="Mã bookmarklet" onFocus={(event) => event.currentTarget.select()} className={`${inputClass} mt-2 break-all bg-zinc-50 font-mono text-xs`} /></details>
    <p className="mt-4 text-xs text-zinc-500">Dữ liệu nằm trong phần sau dấu # của địa chỉ nên không gửi lên máy chủ nào; việc so khớp chạy ngay trên trình duyệt của bạn. Chỉ nút bấm này đọc trang Facebook, trên máy của bạn.</p>
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
  const [showAliases, setShowAliases] = useState(false);
  const [busy, setBusy] = useState("");
  // Đã bấm xác nhận "quét nhầm bài" cho việc nào (tự hết hiệu lực khi đổi việc).
  const [ackMismatchTaskId, setAckMismatchTaskId] = useState("");
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
  // Thành viên đổi ở tab khác: tải lại để đối chiếu không dùng danh sách cũ.
  useReloadOnAdminChange(() => setReloadKey((key) => key + 1));

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
  // Việc tương tác gắn với một bài cụ thể: nếu trang vừa quét không phải bài đó thì kết quả có thể là của bài khác.
  const postMismatch = !!scan && task?.kind === "engagement" && !!task.post_url && !samePost(task.post_url, scan.source);
  const mismatchAcked = !!task && ackMismatchTaskId === task.id;
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
    if (!supabase || !task || !selectedIds.length || (postMismatch && !mismatchAcked)) return;
    setBusy("apply"); setError(""); setNotice("");
    const { data, error: rpcError } = await supabase.rpc("apply_task_scan", { p_task_id: task.id, p_member_ids: selectedIds });
    setBusy("");
    if (rpcError) { setError(friendlyError(rpcError, "Không đánh dấu được. Vui lòng thử lại.")); return; }
    const changed = typeof data === "number" ? data : selectedIds.length;
    setNotice(`Đã đánh dấu xong cho ${changed} người${changed < selectedIds.length ? ` (${selectedIds.length - changed} người đã được cập nhật từ trước)` : ""}. Bạn có thể quét thêm (ví dụ bình luận) và đánh dấu tiếp.`);
    setReloadKey((key) => key + 1);
  }

  const dataLoading = canWrite && !!supabase && !loaded;
  const rowPad = "px-4 py-3 sm:px-5";
  const emptyNote = `${rowPad} text-sm text-zinc-500`;
  const aliasSection = loaded && <Panel padded={false}>
    <h2><button type="button" aria-expanded={showAliases} onClick={() => setShowAliases((open) => !open)} className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-base font-semibold text-zinc-900 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 sm:px-5">Tài khoản Facebook đã gắn ({aliases.length})<Icon name="chevron-down" className={`shrink-0 text-zinc-500 transition-transform ${showAliases ? "rotate-180" : ""}`} /></button></h2>
    {showAliases && <div className="border-t border-zinc-100">
      <p className={`${rowPad} text-xs text-zinc-500`}>Những tài khoản bạn đã gắn tay với thành viên. Gỡ nếu gắn nhầm hoặc muốn gắn lại cho người khác.</p>
      {aliases.length ? <ul className="divide-y divide-zinc-100 border-t border-zinc-100">{aliases.map((alias) => <li key={alias.fb_key} className={`flex flex-wrap items-center justify-between gap-2 ${rowPad}`}>
        <div className="min-w-0"><p className="break-words text-sm font-medium">{memberName(alias.member_id)}{allMembers.find((member) => member.id === alias.member_id)?.is_active === false && <span className="ml-2 text-xs font-normal text-zinc-500">Ngừng hoạt động</span>}</p><p className="break-all text-xs text-zinc-500">{alias.fb_key}</p></div>
        <Button variant="danger" size="sm" loading={busy === `detach:${alias.fb_key}`} onClick={() => void detach(alias)}>{busy === `detach:${alias.fb_key}` ? "Đang gỡ…" : "Gỡ"}</Button>
      </li>)}</ul> : <p className={`${emptyNote} border-t border-zinc-100`}>Chưa gắn tài khoản Facebook nào. Khi kết quả quét có người chưa khớp, bạn có thể gắn họ với thành viên ở mục “Không khớp”.</p>}
    </div>}
  </Panel>;
  const skeleton = (label: string) => <div role="status" aria-label={label} className="h-32 animate-pulse rounded-xl bg-zinc-100" />;

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <PageHeader title="Đối chiếu Facebook" description="Kiểm tra thành viên nào đã react, bình luận hoặc đổi avatar có khung. Bạn tự quét bài viết trên trình duyệt của mình bằng bookmarklet; trang này chỉ so khớp và đánh dấu xong." />
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {!supabase && <Notice tone="warning">Thiếu cấu hình Supabase.</Notice>}
    {!canWrite && <Notice tone="warning">Chỉ Ban chủ nhiệm và Ban chủ chốt được đối chiếu và đánh dấu việc.</Notice>}
    {loaded?.error && <Notice tone="error">{loaded.error}</Notice>}

    {phase.kind === "reading" && skeleton("Đang đọc dữ liệu quét")}

    {(phase.kind === "empty" || phase.kind === "invalid") && <div className="space-y-5">
      {phase.kind === "invalid" && <Notice tone="error">Dữ liệu quét không hợp lệ hoặc đã bị cắt bớt. Hãy quét lại bài viết bằng bookmarklet.</Notice>}
      <Panel title="Cách quét một bài viết">
        <p className="mb-4 text-sm text-zinc-600">Cài bookmarklet một lần, dùng lại cho mọi bài viết.</p>
        <BookmarkletGuide />
      </Panel>
      {aliasSection}
    </div>}

    {scan && <div className="space-y-5">
      <Panel title={`Kết quả quét (${scan.items.length} người)`} actions={<Button variant="secondary" size="sm" onClick={clearScan}>Xóa kết quả quét</Button>}>
        <Notice tone="warning">Dữ liệu này đến từ địa chỉ của trang, nên chỉ dùng nếu chính bạn vừa quét. Nếu bạn không nhớ đã quét, hãy xóa kết quả.</Notice>
        <p className="text-xs text-zinc-600">Quét lúc {Number.isNaN(Date.parse(scan.scannedAt)) ? "không rõ" : new Date(scan.scannedAt).toLocaleString("vi-VN")}.</p>
        <p className="mt-1 break-all text-xs text-zinc-600">Nguồn: {scan.source}</p>
        <p className="mt-2 text-xs text-zinc-500">Lưu ý: khi quét phần bình luận, người được nhắc tên (@) trong bình luận cũng bị tính là đã tham gia. Hãy xem lại danh sách trước khi đánh dấu.</p>
        <details className="mt-4 text-sm"><summary className="cursor-pointer rounded font-medium text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">Quét thêm bài viết hoặc phần bình luận</summary><div className="mt-3"><BookmarkletGuide primary={false} /></div></details>
      </Panel>

      {dataLoading && skeleton("Đang tải thành viên và việc")}

      {loaded && <>
        <Panel title="Việc cần đánh dấu">
          {tasks.length ? <div className="space-y-3">
            <Field label="Chọn việc đang mở"><select value={taskId} onChange={(event) => { setTaskId(event.target.value); setNotice(""); setError(""); }} className={inputClass}><option value="">Chỉ xem, chưa chọn việc</option>{tasks.map((row) => <option key={row.id} value={row.id}>{kindLabel[row.kind]}: {row.title}</option>)}</select></Field>
            {task && <div className="space-y-2 text-sm text-zinc-600">
              <p className="break-words"><span className="font-medium text-zinc-800">{kindLabel[task.kind]}</span>, hạn {new Date(task.due_at).toLocaleString("vi-VN")}, {task.task_assignees.filter((row) => row.status === "pending").length}/{task.task_assignees.length} người còn chờ.</p>
              {task.kind === "engagement" && task.post_url?.startsWith("https://") && <p><a href={task.post_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded font-medium text-emerald-800 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">Mở bài viết của việc này<Icon name="external" size={14} /></a></p>}
              <p className="text-xs text-zinc-500">Chưa ai được tick sẵn. Hãy chọn từng người, hoặc dùng nút chọn nhanh ở mục “Khớp”.</p>
              {task.kind === "avatar" && !task.frame_id && <Notice tone="warning" className="mb-0!">Việc này chưa gắn khung nên không tự nhận diện được avatar. Hãy tick tay những người bạn đã xác nhận.</Notice>}
              {task.kind === "avatar" && task.frame_id && frameLoading && <p role="status" className="text-xs text-zinc-500">Đang đọc ảnh khung…</p>}
              {task.kind === "avatar" && currentFrameSig?.status === "failed" && <Notice tone="warning" className="mb-0!">Không đọc được ảnh khung nên không so sánh được. Hãy tick tay.</Notice>}
              {task.kind === "avatar" && currentFrameSig?.status === "thin" && <Notice tone="warning" className="mb-0!">Khung không có viền đủ dày để nhận diện, nên trang không đoán. Hãy xem avatar bằng mắt và tick tay.</Notice>}
              {task.kind === "avatar" && frameUsable && <p className="text-xs text-zinc-500">Nhận diện avatar là thử nghiệm, chỉ là phỏng đoán theo màu viền avatar nhỏ. Hãy xem lại bằng mắt trước khi xác nhận.</p>}
            </div>}
          </div> : <p className="text-sm text-zinc-500">CLB chưa có việc đang mở loại “Tương tác bài viết” hoặc “Thay avatar”. <Link href="/manage-clubs/tasks" className="font-medium text-emerald-800 underline">Tạo việc ở mục Giao việc</Link> rồi quay lại quét. Bạn vẫn có thể xem đối chiếu và gắn tài khoản Facebook ở dưới.</p>}
        </Panel>

        <Panel title={`Khớp (${matched.length})`} padded={false} actions={task && eligibleCount > 0 && <>
          <Button variant="secondary" size="sm" onClick={() => selectRows(() => true)}>Chọn hết người khớp</Button>
          {frameUsable && <Button variant="secondary" size="sm" onClick={() => selectRows((row) => row.verdict === "changed")}>Chọn người có vẻ đã thay khung</Button>}
          <Button variant="ghost" size="sm" onClick={() => selectRows(() => false)}>Bỏ chọn hết</Button></>}>
          {rows.length ? <ul className="divide-y divide-zinc-100">{rows.map((row) => <li key={row.member.id}>
            <label className={`flex items-start gap-3 ${rowPad} ${row.eligible ? "cursor-pointer hover:bg-zinc-50" : "opacity-70"}`}>
              <input type="checkbox" disabled={!task || !row.eligible} checked={row.checked} onChange={(event) => setChecked(row.member.id, event.target.checked)} className="mt-1 size-4 shrink-0 accent-emerald-700" />
              <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="break-words text-sm font-medium">{row.member.full_name}</span>{row.verdict !== "na" && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${verdictClass[row.verdict]}`}>{verdictLabel[row.verdict]}</span>}</span>
                <span className="mt-0.5 block break-words text-xs text-zinc-500">Trên Facebook: {row.item.name || row.item.key}{task && (row.assignee ? ` · ${assigneeLabel[row.assignee.status]}` : " · Không được giao việc này")}</span></span>
            </label>
          </li>)}</ul> : <p className={emptyNote}>Chưa có người nào trong kết quả quét khớp với thành viên CLB. Hãy gắn tài khoản ở mục “Không khớp” bên dưới.</p>}
          {task && postMismatch && <div className="border-t border-zinc-100 p-4 sm:p-5">
            <Notice tone="warning" className="mb-0!">
              <p className="font-semibold">Trang vừa quét có vẻ không phải bài viết của việc này.</p>
              <p className="mt-1 break-all text-xs">Bài của việc: {task.post_url}</p>
              <p className="mt-1 break-all text-xs">Trang đã quét: {scan?.source}</p>
              <label className="mt-3 flex cursor-pointer items-start gap-2"><input type="checkbox" checked={mismatchAcked} onChange={(event) => setAckMismatchTaskId(event.target.checked ? task.id : "")} className="mt-0.5 size-4 shrink-0 accent-emerald-700" /><span>Tôi đã kiểm tra: danh sách này đúng là của bài viết của việc, vẫn đánh dấu xong.</span></label>
            </Notice>
          </div>}
          {task && <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-b-xl border-t border-zinc-100 bg-white px-4 py-3 sm:px-5"><Button variant="primary" icon="check" loading={busy === "apply"} disabled={!selectedIds.length || (postMismatch && !mismatchAcked)} onClick={() => void apply()}>{busy === "apply" ? "Đang lưu…" : `Đánh dấu xong cho ${selectedIds.length} người`}</Button><p className="min-w-0 flex-1 text-xs text-zinc-500">Chỉ đổi người đang “Chờ”, không đụng người đã xong hoặc đã bị đánh dấu chưa hoàn thành.</p></div>}
        </Panel>

        <Panel title={`Không khớp (${unmatched.length})`} padded={false}>
          <p className={`${rowPad} text-xs text-zinc-500`}>Người trong kết quả quét chưa nhận ra là thành viên nào, thường là người ngoài CLB hoặc thành viên chưa điền link Facebook. Gắn tài khoản để lần sau tự khớp.</p>
          {unmatched.length > 0 && <div className="px-4 pb-3 sm:px-5"><input type="search" aria-label="Tìm trong danh sách không khớp" value={unmatchedQuery} onChange={(event) => { setUnmatchedQuery(event.target.value); setUnmatchedLimit(PAGE); }} className={inputClass} placeholder="Tìm trong danh sách: gõ tên để lọc" /></div>}
          {filteredUnmatched.length ? <ul className="divide-y divide-zinc-100 border-t border-zinc-100">{filteredUnmatched.slice(0, unmatchedLimit).map((item) => <li key={item.key} className={rowPad}>
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-medium">{item.name || "(Không có tên)"}</p><p className="break-all text-xs text-zinc-500">{item.key}</p></div>
              {attachKey !== item.key && <Button variant="secondary" size="sm" onClick={() => { setAttachKey(item.key); setAttachMember(""); }}>Gắn với thành viên</Button>}</div>
            {attachKey === item.key && <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-zinc-50 p-3"><Field label="Thành viên" className="min-w-52 flex-1"><select value={attachMember} onChange={(event) => setAttachMember(event.target.value)} className={inputClass} data-autofocus><option value="">Chọn thành viên</option>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></Field>
              <Button variant="secondary" loading={busy === `attach:${item.key}`} disabled={!attachMember} onClick={() => void attach(item)}>{busy === `attach:${item.key}` ? "Đang gắn…" : "Gắn"}</Button>
              <Button variant="ghost" disabled={busy === `attach:${item.key}`} onClick={() => setAttachKey("")}>Hủy</Button></div>}
          </li>)}</ul> : <p className={`${emptyNote} border-t border-zinc-100`}>{unmatched.length ? "Không có người phù hợp với từ khóa." : "Mọi người trong kết quả quét đều đã khớp."}</p>}
          {filteredUnmatched.length > unmatchedLimit && <div className="border-t border-zinc-100 px-4 py-3 sm:px-5"><Button variant="secondary" size="sm" onClick={() => setUnmatchedLimit((limit) => limit + PAGE)}>Hiện thêm ({filteredUnmatched.length - unmatchedLimit} người)</Button></div>}
        </Panel>

        <Panel title={`Thành viên chưa thấy (${missing.length})`} padded={false}>
          <p className={`${rowPad} text-xs text-zinc-500`}>Thành viên đang hoạt động không có trong kết quả quét. Có thể họ chưa làm, hoặc chưa cuộn hết danh sách, hoặc tài khoản Facebook chưa được gắn.</p>
          {missing.length ? <ul className="divide-y divide-zinc-100 border-t border-zinc-100">{missing.map((member) => { const status = missingStatus(member); return <li key={member.id} className={`flex flex-wrap items-start justify-between gap-2 text-sm ${rowPad}`}><span className="min-w-0 break-words font-medium">{member.full_name}{!member.facebook_url && <span className="ml-2 text-xs font-normal text-amber-800">Chưa có link Facebook</span>}</span>{task && <span className="text-xs text-zinc-500">{status ? assigneeLabel[status] : "Không được giao việc này"}</span>}</li>; })}</ul> : <p className={`${emptyNote} border-t border-zinc-100`}>Mọi thành viên đang hoạt động đều có trong kết quả quét.</p>}
        </Panel>

        {aliasSection}
      </>}
    </div>}
  </section>;
}
