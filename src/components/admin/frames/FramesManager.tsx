"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { useCurrentAdminClub } from "../AdminClubContext";
import { frameImageUrl, type AvatarFrame } from "../../frames/frameUrl";

type Frame = AvatarFrame & { created_at: string };

const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100";
const checkerClass = "bg-[repeating-conic-gradient(#e4e4e7_0_25%,#fafafa_0_50%)] bg-[length:20px_20px]";
const maxBytes = 2 * 1024 * 1024;

export function FramesManager() {
  const supabase = getSupabaseClient();
  const { id: clubId, role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const [loaded, setLoaded] = useState<{ key: string; rows: Frame[]; error: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState("");
  const [confirmFrame, setConfirmFrame] = useState<Frame | null>(null);
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!supabase || !clubId) return;
    let active = true;
    (async () => {
      const { data, error: loadError } = await supabase.from("avatar_frames").select("id,name,image_path,created_at").eq("club_id", clubId).order("created_at", { ascending: false });
      if (active) setLoaded({ key: `${clubId}|${reloadKey}`, rows: (data ?? []) as Frame[], error: loadError?.message ?? "" });
    })();
    return () => { active = false; };
  }, [supabase, clubId, reloadKey]);

  const current = loaded && loaded.key === `${clubId}|${reloadKey}` ? loaded : null;
  const frames = loaded?.rows ?? [];
  const loading = !!supabase && !current;
  const load = () => setReloadKey((key) => key + 1);
  useEffect(() => { if (confirmFrame) cancelRef.current?.focus(); }, [confirmFrame]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    setError(""); setNotice("");
    if (!file) { setError("Hãy chọn ảnh khung PNG."); return; }
    if (file.type !== "image/png") { setError("Khung phải là ảnh PNG (nền trong suốt)."); return; }
    if (file.size > maxBytes) { setError("Ảnh khung tối đa 2 MB."); return; }
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("clubId", clubId);
      form.append("name", name.trim());
      form.append("file", file);
      const response = await fetch(`/api/admin/frames?clubId=${encodeURIComponent(clubId)}`, { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) { setError(result.error ?? "Không tải được khung lên."); return; }
      setName(""); setFile(null); setFileKey((key) => key + 1);
      setNotice("Đã thêm khung. Gửi link công khai bên dưới cho thành viên.");
      load();
    } catch {
      setError("Không kết nối được máy chủ.");
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!confirmFrame) return;
    const target = confirmFrame;
    setBusy("delete"); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/frames?clubId=${encodeURIComponent(clubId)}&id=${encodeURIComponent(target.id)}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) { setError(result.error ?? "Không xóa được khung."); return; }
      setNotice("Đã xóa khung.");
      load();
    } catch {
      setError("Không kết nối được máy chủ.");
    } finally {
      setBusy(""); setConfirmFrame(null);
    }
  }

  async function copyLink(frame: Frame) {
    setError("");
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/frames/${frame.id}`);
      setCopiedId(frame.id);
      window.setTimeout(() => setCopiedId((current) => current === frame.id ? "" : current), 2000);
    } catch {
      setError("Không sao chép được tự động. Hãy mở link rồi sao chép từ thanh địa chỉ.");
    }
  }

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <header className="mb-6"><p className="text-sm font-semibold text-emerald-700">Không gian CLB</p><h1 className="mt-1 text-3xl font-bold">Khung avatar</h1><p className="mt-2 text-sm text-zinc-600">Tải lên khung PNG nền trong suốt cho sự kiện. Thành viên mở link công khai, chọn ảnh của mình và tải avatar có khung về. Ảnh của họ được ghép ngay trên máy, không tải lên đâu.</p></header>
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!supabase && <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Thiếu cấu hình Supabase.</p>}
    {current?.error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{current.error}</p>}
    {!canWrite && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Chỉ Ban chủ nhiệm và Ban chủ chốt được quản lý khung avatar.</p>}

    <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      {canWrite && <form onSubmit={(event) => void upload(event)} className="space-y-4 rounded-xl border bg-white p-5">
        <div><h2 className="font-semibold">Thêm khung mới</h2><p className="mt-1 text-xs text-zinc-500">PNG vuông, từ 400 đến 2048 px mỗi cạnh, tối đa 2 MB. Phần giữa khung nên trong suốt để thấy ảnh của thành viên.</p></div>
        <label className="block text-sm">Tên khung<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={busy === "upload"} className={inputClass} placeholder="Ví dụ: Khung Gen 17" /></label>
        <label className="block text-sm">Ảnh khung (PNG)<input key={fileKey} required type="file" accept="image/png" disabled={busy === "upload"} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-zinc-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium" /></label>
        {file && <p className="break-all text-xs text-zinc-500">Đã chọn: {file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
        <button disabled={busy === "upload" || !supabase} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "upload" ? "Đang tải lên…" : "Tải khung lên"}</button>
      </form>}

      <div className="min-w-0 overflow-hidden rounded-xl border bg-white">
        <div className="flex items-center justify-between gap-2 border-b p-4"><h2 className="font-semibold">Các khung ({frames.length})</h2><button type="button" disabled={loading} onClick={load} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">Làm mới</button></div>
        {loading ? <p role="status" className="p-6 text-sm text-zinc-500">Đang tải khung…</p> : frames.length ? <ul className="grid gap-4 p-4 sm:grid-cols-2">{frames.map((frame) => <li key={frame.id} className="min-w-0 rounded-lg border p-3">
          <div className={`aspect-square w-full overflow-hidden rounded-lg border ${checkerClass}`}><img src={frameImageUrl(frame.image_path)} alt={`Khung ${frame.name}`} loading="lazy" className="h-full w-full object-contain" /></div>
          <p className="mt-3 break-words font-semibold">{frame.name}</p>
          <p className="mt-1 break-all text-xs text-zinc-500">/frames/{frame.id}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyLink(frame)} className="rounded-lg border border-emerald-700 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">{copiedId === frame.id ? "Đã sao chép" : "Sao chép link"}</button>
            <a href={`/frames/${frame.id}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Mở thử</a>
            {canWrite && <button type="button" disabled={busy === "delete"} onClick={() => setConfirmFrame(frame)} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-800 disabled:opacity-50">Xóa</button>}
          </div>
        </li>)}</ul> : <p className="p-6 text-sm text-zinc-500">CLB chưa có khung avatar nào. Hãy tải khung đầu tiên ở khung bên trái.</p>}
      </div>
    </div>

    {confirmFrame && <div role="presentation" onKeyDown={(event) => { if (event.key === "Escape" && busy !== "delete") setConfirmFrame(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-frame-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="delete-frame-title" className="break-words text-lg font-bold">Xóa khung “{confirmFrame.name}”?</h2>
        <p className="mt-3 text-sm text-zinc-700">Link công khai của khung sẽ không dùng được nữa. Các việc “Thay avatar” đang dùng khung này vẫn còn nhưng không còn gắn khung.</p>
        <div className="mt-5 flex justify-end gap-2"><button ref={cancelRef} type="button" disabled={busy === "delete"} onClick={() => setConfirmFrame(null)} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">Hủy</button><button type="button" disabled={busy === "delete"} onClick={() => void remove()} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "delete" ? "Đang xóa…" : "Xóa khung"}</button></div>
      </div>
    </div>}
  </section>;
}
