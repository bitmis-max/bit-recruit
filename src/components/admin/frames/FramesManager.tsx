"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { friendlyError } from "../../../lib/ui/friendly-error";
import { useCurrentAdminClub } from "../AdminClubContext";
import { useDialog } from "../useDialog";
import { Button, ButtonLink } from "../ui/Button";
import { CreatePanel } from "../ui/CreatePanel";
import { EmptyState } from "../ui/EmptyState";
import { Field, inputClass } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { Panel } from "../ui/Panel";
import { frameImageUrl, type AvatarFrame } from "../../frames/frameUrl";

type Frame = AvatarFrame & { created_at: string };

const checkerClass = "bg-[repeating-conic-gradient(#e4e4e7_0_25%,#fafafa_0_50%)] bg-[length:20px_20px]";
const maxBytes = 2 * 1024 * 1024;

export function FramesManager() {
  const supabase = getSupabaseClient();
  const { id: clubId, role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const [loaded, setLoaded] = useState<{ key: string; rows: Frame[]; error: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState("");
  const [confirmFrame, setConfirmFrame] = useState<Frame | null>(null);
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialogRef = useDialog<HTMLDivElement>(() => { if (busy !== "delete") setConfirmFrame(null); }, !!confirmFrame);

  useEffect(() => {
    if (!supabase || !clubId) return;
    let active = true;
    (async () => {
      const { data, error: loadError } = await supabase.from("avatar_frames").select("id,name,image_path,created_at").eq("club_id", clubId).order("created_at", { ascending: false });
      if (active) setLoaded({ key: `${clubId}|${reloadKey}`, rows: (data ?? []) as Frame[], error: loadError ? friendlyError(loadError, "Không tải được danh sách khung. Vui lòng thử lại.") : "" });
    })();
    return () => { active = false; };
  }, [supabase, clubId, reloadKey]);

  const current = loaded && loaded.key === `${clubId}|${reloadKey}` ? loaded : null;
  const frames = loaded?.rows ?? [];
  const loading = !!supabase && !current;
  const load = () => setReloadKey((key) => key + 1);

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
      closeForm();
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

  function closeForm() {
    setCreating(false); setName(""); setFile(null); setFileKey((key) => key + 1);
  }

  const uploadForm = <form onSubmit={(event) => void upload(event)} className="space-y-4">
    <p className="text-sm text-zinc-600">PNG vuông, từ 400 đến 2048 px mỗi cạnh, tối đa 2 MB. Phần giữa khung nên trong suốt để thấy ảnh của thành viên.</p>
    <Field label="Tên khung"><input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={busy === "upload"} className={inputClass} placeholder="Ví dụ: Khung Gen 17" data-autofocus /></Field>
    <Field label="Ảnh khung (PNG)" hint={file ? `Đã chọn: ${file.name} (${(file.size / 1024).toFixed(0)} KB)` : undefined}><input key={fileKey} required type="file" accept="image/png" disabled={busy === "upload"} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-sm file:font-medium file:text-zinc-800`} /></Field>
    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
      <Button type="submit" variant="primary" icon="upload" loading={busy === "upload"} disabled={!supabase}>{busy === "upload" ? "Đang tải lên…" : "Tải khung lên"}</Button>
      <Button variant="secondary" onClick={closeForm} disabled={busy === "upload"}>Hủy</Button>
    </div>
  </form>;

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <PageHeader title="Khung avatar" description="Tải lên khung PNG nền trong suốt cho sự kiện. Thành viên mở link công khai, chọn ảnh của mình và tải avatar có khung về. Ảnh của họ được ghép ngay trên máy, không tải lên đâu." actions={canWrite && <Button variant="primary" icon="plus" onClick={() => setCreating(true)} aria-expanded={creating}>Thêm khung</Button>} />
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {!supabase && <Notice tone="warning">Thiếu cấu hình Supabase.</Notice>}
    {current?.error && <Notice tone="error">{current.error}</Notice>}
    {!canWrite && <Notice tone="warning">Chỉ Ban chủ nhiệm và Ban chủ chốt được quản lý khung avatar.</Notice>}

    {canWrite && <CreatePanel open={creating} title="Thêm khung mới" onClose={closeForm}>{uploadForm}</CreatePanel>}

    <Panel title={`Các khung (${frames.length})`} padded={!!frames.length || loading} actions={<Button variant="secondary" size="sm" icon="refresh" disabled={loading} onClick={load}>Làm mới</Button>}>
      {loading ? <div role="status" aria-label="Đang tải khung" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((key) => <div key={key} className="aspect-square animate-pulse rounded-lg bg-zinc-100" />)}</div>
        : frames.length ? <ul className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">{frames.map((frame) => <li key={frame.id} className="min-w-0">
          <div className={`aspect-square w-full overflow-hidden rounded-lg border border-zinc-200 ${checkerClass}`}><img src={frameImageUrl(frame.image_path)} alt={`Khung ${frame.name}`} loading="lazy" className="h-full w-full object-contain" /></div>
          <p className="mt-3 break-words text-sm font-semibold text-zinc-900">{frame.name}</p>
          <p className="mt-0.5 break-all text-xs text-zinc-500">/frames/{frame.id}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" icon={copiedId === frame.id ? "check" : undefined} onClick={() => void copyLink(frame)}>{copiedId === frame.id ? "Đã sao chép" : "Sao chép link"}</Button>
            <ButtonLink variant="ghost" size="sm" icon="external" href={`/frames/${frame.id}`} target="_blank" rel="noopener noreferrer">Mở thử</ButtonLink>
            {canWrite && <Button variant="danger" size="sm" icon="trash" className="ml-auto" aria-label={`Xóa khung ${frame.name}`} disabled={busy === "delete"} onClick={() => setConfirmFrame(frame)} />}
          </div>
        </li>)}</ul>
        : <EmptyState title="CLB chưa có khung avatar nào" description="Tải khung đầu tiên lên để lấy link công khai cho thành viên." action={canWrite && !creating && <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Thêm khung</Button>} />}
    </Panel>

    {confirmFrame && <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="delete-frame-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl outline-none">
        <h2 id="delete-frame-title" className="break-words text-lg font-semibold">Xóa khung “{confirmFrame.name}”?</h2>
        <p className="mt-3 text-sm text-zinc-700">Link công khai của khung sẽ không dùng được nữa. Các việc “Thay avatar” đang dùng khung này vẫn còn nhưng không còn gắn khung.</p>
        <div className="mt-5 flex justify-end gap-2"><Button data-autofocus variant="secondary" disabled={busy === "delete"} onClick={() => setConfirmFrame(null)}>Hủy</Button><Button variant="danger" icon="trash" loading={busy === "delete"} onClick={() => void remove()}>{busy === "delete" ? "Đang xóa…" : "Xóa khung"}</Button></div>
      </div>
    </div>}
  </section>;
}
