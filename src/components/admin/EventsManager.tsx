"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useCurrentAdminClub } from "./AdminClubContext";
import { friendlyError } from "../../lib/ui/friendly-error";
import { requestJson } from "./adminClient";
import { Button } from "./ui/Button";
import { CreatePanel } from "./ui/CreatePanel";
import { EmptyState } from "./ui/EmptyState";
import { Field, inputClass } from "./ui/Field";
import { Icon } from "./ui/Icon";
import { Notice } from "./ui/Notice";
import { PageHeader } from "./ui/PageHeader";
import { Panel } from "./ui/Panel";

type ClubEvent = {
  id: string;
  club_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  created_at: string;
};

type EventDraft = { title: string; description: string; image_url: string };
const emptyDraft: EventDraft = { title: "", description: "", image_url: "" };
async function deleteEventImage(clubId: string, imageUrl: string) {
  const result = await requestJson<object>("/api/admin/events/image", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clubId, imageUrl }),
  }, "Không xóa được ảnh cũ.");
  if (!result.ok) throw new Error(result.error);
}

export function EventsManager() {
  const { id: clubId, role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [savedOrderIds, setSavedOrderIds] = useState<string[]>([]);
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestJson<{ events: ClubEvent[] }>(`/api/admin/events?clubId=${encodeURIComponent(clubId)}`, undefined, "Không tải được danh sách sự kiện.");
      if (!result.ok) throw new Error(result.error);
      const rows = result.data.events ?? [];
      setEvents(rows);
      setSavedOrderIds(rows.map((event) => event.id));
      setSelectedId((current) => rows.some((event) => event.id === current) ? current : rows[0]?.id ?? "");
    } catch (loadError) {
      setError(friendlyError(loadError, "Không tải được danh sách sự kiện."));
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  useEffect(() => {
    if (!imageFile) { setImagePreviewUrl(null); return; }
    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  const selected = events.find((event) => event.id === selectedId) ?? null;
  const orderHasChanges = events.length !== savedOrderIds.length
    || events.some((event, index) => event.id !== savedOrderIds[index]);
  useEffect(() => {
    if (creating) return;
    setImageFile(null);
    setDraft(selected ? {
      title: selected.title,
      description: selected.description ?? "",
      image_url: selected.image_url ?? "",
    } : emptyDraft);
  }, [selectedId, selected?.id, selected?.title, selected?.description, selected?.image_url, creating]);

  function startCreate() {
    setCreating(true);
    setSelectedId("");
    setDraft(emptyDraft);
    setImageFile(null);
    setError(null);
    setNotice(null);
  }

  function reorderEvents(draggedId: string, targetId: string) {
    if (!canWrite || busy || draggedId === targetId) return;
    const fromIndex = events.findIndex((event) => event.id === draggedId);
    const toIndex = events.findIndex((event) => event.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const reordered = [...events];
    const [dragged] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, dragged);
    setEvents(reordered);
    setError(null);
    setNotice(null);
  }

  // Đổi chỗ với mục liền kề: dùng được bằng bàn phím và điện thoại (kéo thả không có ở đó).
  function moveEvent(id: string, delta: -1 | 1) {
    if (!canWrite || busy) return;
    const from = events.findIndex((event) => event.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= events.length) return;
    const reordered = [...events];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    setEvents(reordered);
    setError(null);
    setNotice(null);
  }

  async function saveOrder() {
    if (!canWrite || busy || !orderHasChanges) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestJson<{ events: ClubEvent[] }>("/api/admin/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, orderedEventIds: events.map((item) => item.id) }),
      }, "Không sắp xếp được sự kiện.");
      if (!result.ok) throw new Error(result.error);
      const savedEvents = result.data.events ?? [];
      setEvents(savedEvents);
      setSavedOrderIds(savedEvents.map((item) => item.id));
      setNotice("Đã lưu thứ tự hiển thị.");
    } catch (orderError) {
      setError(friendlyError(orderError, "Không lưu được thứ tự sự kiện."));
    } finally {
      setBusy(false);
    }
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    let uploadedImageUrl: string | null = null;
    try {
      if (imageFile && (!imageFile.type.match(/^image\/(jpeg|png|webp)$/) || imageFile.size > 5 * 1024 * 1024)) {
        throw new Error("Ảnh phải có định dạng JPG, PNG hoặc WebP và dung lượng tối đa 5 MB.");
      }
      const eventId = creating ? crypto.randomUUID() : selectedId;
      let imageUrl = draft.image_url || null;
      if (imageFile) {
        const form = new FormData();
        form.append("clubId", clubId);
        form.append("eventId", eventId);
        form.append("file", imageFile);
        const uploadResult = await requestJson<{ imageUrl: string }>("/api/admin/events/image", { method: "POST", body: form }, "Không tải được ảnh lên.");
        if (!uploadResult.ok || !uploadResult.data.imageUrl) throw new Error(uploadResult.error || "Không tải được ảnh lên.");
        imageUrl = uploadResult.data.imageUrl;
        uploadedImageUrl = imageUrl;
      }
      const result = await requestJson<{ event: ClubEvent }>("/api/admin/events", {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubId,
          id: eventId,
          ...draft,
          image_url: imageUrl,
        }),
      }, "Không lưu được sự kiện.");
      if (!result.ok || !result.data.event) throw new Error(result.error || "Không lưu được sự kiện.");
      const saved = result.data.event;
      const oldImageUrl = selected?.image_url;
      if (oldImageUrl && oldImageUrl !== imageUrl) {
        await deleteEventImage(clubId, oldImageUrl).catch(() => undefined);
      }
      uploadedImageUrl = null;
      const updatedEvents = [saved, ...events.filter((row) => row.id !== saved.id)]
        .sort((a, b) => a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at));
      setEvents(updatedEvents);
      if (creating) setSavedOrderIds(updatedEvents.map((item) => item.id));
      setSelectedId(saved.id);
      setCreating(false);
      setImageFile(null);
      setNotice(creating ? "Đã tạo sự kiện." : "Đã lưu thay đổi.");
    } catch (saveError) {
      if (uploadedImageUrl) await deleteEventImage(clubId, uploadedImageUrl).catch(() => undefined);
      setError(friendlyError(saveError, "Không lưu được sự kiện."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent() {
    if (!canWrite || !selected || !window.confirm(`Xóa sự kiện “${selected.title}”?`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestJson<object>(`/api/admin/events?clubId=${encodeURIComponent(clubId)}&id=${encodeURIComponent(selected.id)}`, { method: "DELETE" }, "Không xóa được sự kiện.");
      if (!result.ok) throw new Error(result.error);
      if (selected.image_url) await deleteEventImage(clubId, selected.image_url).catch(() => undefined);
      const remaining = events.filter((item) => item.id !== selected.id);
      setEvents(remaining);
      setSelectedId(remaining[0]?.id ?? "");
      setCreating(false);
      setImageFile(null);
      setNotice("Đã xóa sự kiện.");
    } catch (deleteError) {
      setError(friendlyError(deleteError, "Không xóa được sự kiện."));
    } finally {
      setBusy(false);
    }
  }

  function cancelCreate() {
    setCreating(false);
    setSelectedId(events[0]?.id ?? "");
  }

  const eventForm = <form onSubmit={saveEvent} className="space-y-4">
    <Field label="Tên sự kiện"><input required maxLength={200} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} disabled={!canWrite || busy} className={inputClass} data-autofocus /></Field>
    <Field label="Mô tả"><textarea rows={6} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} disabled={!canWrite || busy} className={inputClass} /></Field>
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-800">Ảnh sự kiện</p>
      {imagePreviewUrl || draft.image_url ? <img src={imagePreviewUrl ?? draft.image_url} alt={`Ảnh sự kiện ${draft.title}`} className="max-h-64 w-full rounded-lg border border-zinc-200 object-cover sm:max-w-lg" /> : <div className="flex min-h-40 w-full items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500 sm:max-w-lg">Sự kiện chưa có ảnh</div>}
      <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={!canWrite || busy} onChange={(event) => { setImageFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} className="sr-only" tabIndex={-1} aria-hidden="true" />
      {canWrite && <Button variant="secondary" size="sm" icon="upload" onClick={() => imageInputRef.current?.click()} disabled={busy}>{imageFile || draft.image_url ? "Thay ảnh" : "Tải ảnh lên"}</Button>}
      <p className="text-xs text-zinc-500">JPG, PNG hoặc WebP, tối đa 5 MB.{imageFile ? ` Ảnh mới: ${imageFile.name}` : ""}</p>
    </div>
    {canWrite && <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
      <Button type="submit" variant="primary" loading={busy}>{busy ? "Đang lưu…" : creating ? "Tạo sự kiện" : "Lưu thay đổi"}</Button>
      {creating && <Button variant="secondary" onClick={cancelCreate} disabled={busy}>Hủy</Button>}
      {selected && !creating && <Button variant="danger" icon="trash" className="sm:ml-auto" onClick={() => void deleteEvent()} disabled={busy}>Xóa sự kiện</Button>}
    </div>}
  </form>;

  return (
    <section className="mx-auto max-w-6xl p-5 sm:p-8">
      <PageHeader title="Sự kiện" description="Tạo và cập nhật nội dung các sự kiện đang hiển thị trên trang Sự kiện." actions={canWrite && <Button variant="primary" icon="plus" onClick={() => { if (!creating) startCreate(); }} aria-expanded={creating}>Thêm sự kiện</Button>} />
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <CreatePanel open={creating} title="Tạo sự kiện mới" onClose={cancelCreate}>{eventForm}</CreatePanel>

      {loading ? <div role="status" aria-label="Đang tải danh sách sự kiện" className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]"><div className="h-48 animate-pulse rounded-xl bg-zinc-100" /><div className="h-72 animate-pulse rounded-xl bg-zinc-100" /></div> : (
        <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Panel title="Sự kiện của CLB" padded={false} actions={canWrite && orderHasChanges && <Button variant="secondary" size="sm" onClick={() => void saveOrder()} loading={busy}>{busy ? "Đang lưu…" : "Lưu thứ tự"}</Button>}>
            {orderHasChanges && <p role="status" className="border-b border-zinc-100 px-4 py-2 text-xs text-amber-800 sm:px-5">Thứ tự có thay đổi chưa lưu.</p>}
            {events.length ? <ul className="space-y-0.5 p-2">{events.map((item, index) => (
              <li key={item.id}
                onDragOver={(event) => { if (canWrite && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
                onDrop={(event) => { event.preventDefault(); reorderEvents(event.dataTransfer.getData("text/plain") || draggedEventId || "", item.id); setDraggedEventId(null); }}
                className={`flex items-center gap-0.5 rounded-lg ${draggedEventId === item.id ? "opacity-40" : ""}`}>
                {canWrite && <span draggable={!busy} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDraggedEventId(item.id); }} onDragEnd={() => setDraggedEventId(null)} title="Kéo để sắp xếp" aria-hidden="true" className={`cursor-grab select-none px-1 text-zinc-400 active:cursor-grabbing ${busy ? "pointer-events-none" : ""}`}><Icon name="grip" /></span>}
                <button type="button" aria-current={selectedId === item.id && !creating ? "true" : undefined} onClick={() => { setSelectedId(item.id); setCreating(false); setError(null); setNotice(null); }} className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600 ${selectedId === item.id && !creating ? "bg-emerald-50 text-emerald-900" : "text-zinc-700 hover:bg-zinc-100"}`}>
                  <span className="block truncate">{item.title}</span>
                </button>
                {canWrite && <span className="flex shrink-0">
                  <Button variant="ghost" size="sm" icon="arrow-up" onClick={() => moveEvent(item.id, -1)} disabled={busy || index === 0} aria-label={`Đưa ${item.title} lên trên`} title="Đưa lên" />
                  <Button variant="ghost" size="sm" icon="arrow-down" onClick={() => moveEvent(item.id, 1)} disabled={busy || index === events.length - 1} aria-label={`Đưa ${item.title} xuống dưới`} title="Đưa xuống" />
                </span>}
              </li>
            ))}</ul> : <EmptyState title="Chưa có sự kiện nào" description="Thêm sự kiện đầu tiên để hiện trên trang Sự kiện." action={canWrite && !creating && <Button variant="primary" icon="plus" onClick={startCreate}>Thêm sự kiện</Button>} />}
          </Panel>

          {!creating && (selected
            ? <Panel title="Thông tin sự kiện">{eventForm}</Panel>
            : events.length > 0 && <Panel padded={false}><EmptyState title="Chọn một sự kiện để xem hoặc chỉnh sửa" /></Panel>)}
        </div>
      )}
    </section>
  );
}
