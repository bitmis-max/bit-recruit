"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useCurrentAdminClub } from "./AdminClubContext";

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
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15";
async function deleteEventImage(clubId: string, imageUrl: string) {
  const response = await fetch("/api/admin/events/image", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clubId, imageUrl }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Không xóa được ảnh cũ.");
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
      const response = await fetch(`/api/admin/events?clubId=${encodeURIComponent(clubId)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không tải được danh sách sự kiện.");
      const rows = result.events as ClubEvent[];
      setEvents(rows);
      setSavedOrderIds(rows.map((event) => event.id));
      setSelectedId((current) => rows.some((event) => event.id === current) ? current : rows[0]?.id ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được danh sách sự kiện.");
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

  async function saveOrder() {
    if (!canWrite || busy || !orderHasChanges) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, orderedEventIds: events.map((item) => item.id) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không sắp xếp được sự kiện.");
      const savedEvents = result.events as ClubEvent[];
      setEvents(savedEvents);
      setSavedOrderIds(savedEvents.map((item) => item.id));
      setNotice("Đã lưu thứ tự hiển thị.");
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : "Không lưu được thứ tự sự kiện.");
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
        const uploadResponse = await fetch("/api/admin/events/image", { method: "POST", body: form });
        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadResult.error || "Không tải được ảnh lên.");
        imageUrl = uploadResult.imageUrl as string;
        uploadedImageUrl = imageUrl;
      }
      const response = await fetch("/api/admin/events", {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubId,
          id: eventId,
          ...draft,
          image_url: imageUrl,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không lưu được sự kiện.");
      const saved = result.event as ClubEvent;
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
      setError(saveError instanceof Error ? saveError.message : "Không lưu được sự kiện.");
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
      const response = await fetch(`/api/admin/events?clubId=${encodeURIComponent(clubId)}&id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không xóa được sự kiện.");
      if (selected.image_url) await deleteEventImage(clubId, selected.image_url).catch(() => undefined);
      const remaining = events.filter((item) => item.id !== selected.id);
      setEvents(remaining);
      setSelectedId(remaining[0]?.id ?? "");
      setCreating(false);
      setImageFile(null);
      setNotice("Đã xóa sự kiện.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Không xóa được sự kiện.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl p-5 sm:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Quản trị CLB</p>
          <h1 className="mt-1 text-3xl font-bold">Quản lý sự kiện</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Tạo và cập nhật nội dung các sự kiện đang hiển thị trên trang Sự kiện.</p>
        </div>
        {canWrite && <button type="button" onClick={startCreate} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800">+ Thêm sự kiện</button>}
      </header>

      {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      {loading ? <p className="rounded-xl border bg-white p-6 text-sm text-zinc-600">Đang tải danh sách sự kiện…</p> : (
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="rounded-xl border bg-white p-3">
            <div className="flex items-center justify-between gap-2 px-2 py-2">
              <h2 className="text-sm font-semibold">Sự kiện của CLB</h2>
              {canWrite && <button type="button" onClick={() => void saveOrder()} disabled={busy || !orderHasChanges} className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Đang lưu…" : "Lưu thứ tự"}</button>}
            </div>
            {orderHasChanges && <p className="px-2 text-xs text-amber-700">Thứ tự có thay đổi chưa lưu.</p>}
            {events.length ? <ul className="mt-1 space-y-1">{events.map((item) => (
              <li key={item.id}
                onDragOver={(event) => { if (canWrite && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
                onDrop={(event) => { event.preventDefault(); reorderEvents(event.dataTransfer.getData("text/plain") || draggedEventId || "", item.id); setDraggedEventId(null); }}
                className={`flex items-center gap-1 rounded-lg ${draggedEventId === item.id ? "opacity-40" : ""}`}>
                {canWrite && <span draggable={!busy} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDraggedEventId(item.id); }} onDragEnd={() => setDraggedEventId(null)} title="Kéo để sắp xếp" aria-label={`Kéo ${item.title} để sắp xếp`} className={`cursor-grab select-none px-2 text-lg text-zinc-400 active:cursor-grabbing ${busy ? "pointer-events-none" : ""}`}>⠿</span>}
                <button type="button" onClick={() => { setSelectedId(item.id); setCreating(false); setError(null); setNotice(null); }} className={`min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left ${selectedId === item.id && !creating ? "bg-emerald-50 text-emerald-900" : "text-zinc-700 hover:bg-zinc-50"}`}>
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                </button>
              </li>
            ))}</ul> : <p className="px-2 py-3 text-sm text-zinc-500">Chưa có sự kiện nào.</p>}
          </aside>

          <div className="rounded-xl border bg-white p-4 sm:p-6">
            {creating || selected ? <form onSubmit={saveEvent} className="space-y-4">
              <div><h2 className="text-lg font-semibold">{creating ? "Tạo sự kiện mới" : "Thông tin sự kiện"}</h2><p className="mt-1 text-sm text-zinc-500">Nội dung này sẽ xuất hiện trong danh sách trên trang Sự kiện.</p></div>
              <label className="block text-sm font-medium">Tên sự kiện<input required maxLength={200} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} disabled={!canWrite || busy} className={inputClass} /></label>
              <label className="block text-sm font-medium">Mô tả<textarea rows={6} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} disabled={!canWrite || busy} className={inputClass} /></label>
              <div className="space-y-2">
                <p className="text-sm font-medium">Ảnh sự kiện</p>
                {imagePreviewUrl || draft.image_url ? <img src={imagePreviewUrl ?? draft.image_url} alt={`Ảnh sự kiện ${draft.title}`} className="max-h-64 w-full rounded-xl border object-cover sm:max-w-lg" /> : <div className="flex min-h-48 w-full items-center justify-center rounded-xl border border-dashed bg-zinc-50 text-sm text-zinc-500 sm:max-w-lg">Sự kiện chưa có ảnh</div>}
                <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={!canWrite || busy} onChange={(event) => { setImageFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} className="sr-only" />
                {canWrite && <button type="button" onClick={() => imageInputRef.current?.click()} disabled={busy} className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60">{imageFile || draft.image_url ? "Thay ảnh" : "Tải ảnh lên"}</button>}
                <p className="text-xs text-zinc-500">JPG, PNG hoặc WebP, tối đa 5 MB.{imageFile ? ` Ảnh mới: ${imageFile.name}` : ""}</p>
              </div>
              {canWrite && <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy ? "Đang lưu…" : creating ? "Tạo sự kiện" : "Lưu thay đổi"}</button>{selected && !creating && <button type="button" onClick={() => void deleteEvent()} disabled={busy} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60">Xóa sự kiện</button>}</div>}
            </form> : <p className="rounded-lg border border-dashed p-8 text-center text-sm text-zinc-500">Chọn một sự kiện để xem hoặc chỉnh sửa thông tin.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
