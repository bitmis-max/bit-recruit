"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { getSupabaseClient } from "../../lib/supabase/client";
import { frameImageUrl, uuidPattern, type AvatarFrame } from "./frameUrl";

type Loaded = { key: string; frame: AvatarFrame | null; img: HTMLImageElement | null; error: string };
type Photo = { id: number; img: HTMLImageElement };
type Offset = { x: number; y: number };

const EXPORT_SIZE = 1080;
const PREVIEW_SIZE = 540;
const ROUND_SIZE = 160;
const MAX_ZOOM = 3;
const STEP = 0.1;

// Độ lệch tính theo tỉ lệ cạnh khung (không phụ thuộc kích thước canvas) để xem trước và xuất ảnh khớp nhau.
function clampOffset(photo: Photo | null, zoom: number, offset: Offset): Offset {
  if (!photo) return { x: 0, y: 0 };
  const { naturalWidth: w, naturalHeight: h } = photo.img;
  const min = Math.min(w, h);
  const maxX = Math.max(0, ((w / min) * zoom - 1) / 2);
  const maxY = Math.max(0, ((h / min) * zoom - 1) / 2);
  return { x: Math.min(maxX, Math.max(-maxX, offset.x)), y: Math.min(maxY, Math.max(-maxY, offset.y)) };
}

function drawAvatar(canvas: HTMLCanvasElement, frameImg: HTMLImageElement, photo: Photo | null, zoom: number, offset: Offset) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = photo ? "#ffffff" : "#e4e7e3";
  ctx.fillRect(0, 0, size, size);
  if (photo) {
    const { naturalWidth: w, naturalHeight: h } = photo.img;
    const scale = (size / Math.min(w, h)) * zoom;
    ctx.drawImage(photo.img, size / 2 + offset.x * size - (w * scale) / 2, size / 2 + offset.y * size - (h * scale) / 2, w * scale, h * scale);
  }
  ctx.drawImage(frameImg, 0, 0, size, size);
}

function loadImage(src: string, crossOrigin?: "anonymous"): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load"));
    img.src = src;
  });
}

function FrameEditor({ frame, frameImg }: { frame: AvatarFrame; frameImg: HTMLImageElement }) {
  const mainRef = useRef<HTMLCanvasElement>(null);
  const roundRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; start: Offset } | null>(null);
  const photoCounter = useRef(0);
  const resultRef = useRef<string>("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rawOffset, setRawOffset] = useState<Offset>({ x: 0, y: 0 });
  const [result, setResult] = useState<{ url: string; stamp: string } | null>(null);
  const [error, setError] = useState("");
  const offset = useMemo(() => clampOffset(photo, zoom, rawOffset), [photo, zoom, rawOffset]);
  const stamp = `${photo?.id ?? 0}|${zoom}|${offset.x}|${offset.y}`;

  useEffect(() => {
    if (mainRef.current) drawAvatar(mainRef.current, frameImg, photo, zoom, offset);
    if (roundRef.current) drawAvatar(roundRef.current, frameImg, photo, zoom, offset);
  }, [frameImg, photo, zoom, offset]);

  useEffect(() => () => { if (resultRef.current) URL.revokeObjectURL(resultRef.current); }, []);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError("");
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      photoCounter.current += 1;
      setPhoto({ id: photoCounter.current, img });
      setZoom(1);
      setRawOffset({ x: 0, y: 0 });
    } catch {
      setError("Không đọc được ảnh này. Hãy thử ảnh JPG hoặc PNG khác.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!photo) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: offset };
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = event.currentTarget.getBoundingClientRect().width || 1;
    setRawOffset({ x: drag.start.x + (event.clientX - drag.x) / width, y: drag.start.y + (event.clientY - drag.y) / width });
  }

  function endDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    const moves: Record<string, Offset> = { ArrowLeft: { x: -0.02, y: 0 }, ArrowRight: { x: 0.02, y: 0 }, ArrowUp: { x: 0, y: -0.02 }, ArrowDown: { x: 0, y: 0.02 } };
    const move = moves[event.key];
    if (!move || !photo) return;
    event.preventDefault();
    setRawOffset({ x: offset.x + move.x, y: offset.y + move.y });
  }

  function changeZoom(next: number) {
    setZoom(Math.min(MAX_ZOOM, Math.max(1, Math.round(next * 100) / 100)));
  }

  function createResult() {
    if (!photo) return;
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = EXPORT_SIZE;
      canvas.height = EXPORT_SIZE;
      drawAvatar(canvas, frameImg, photo, zoom, offset);
      const currentStamp = stamp;
      canvas.toBlob((blob) => {
        if (!blob) { setError("Không tạo được ảnh. Hãy thử lại."); return; }
        if (resultRef.current) URL.revokeObjectURL(resultRef.current);
        const url = URL.createObjectURL(blob);
        resultRef.current = url;
        setResult({ url, stamp: currentStamp });
      }, "image/png");
    } catch {
      setError("Trình duyệt không cho xuất ảnh này. Hãy thử trình duyệt khác.");
    }
  }

  const fileName = `avatar-${frame.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "khung"}.png`;
  const freshResult = result && result.stamp === stamp ? result : null;
  const iconButton = "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-xl font-semibold text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-40";

  return <div className="grid gap-6 md:grid-cols-[minmax(0,460px)_minmax(0,1fr)] md:items-start md:gap-10">
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[460px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <canvas ref={mainRef} width={PREVIEW_SIZE} height={PREVIEW_SIZE} role="img" aria-label={photo ? "Ảnh đang ghép với khung. Kéo để căn lại, hoặc dùng phím mũi tên." : "Khung avatar, chưa có ảnh của bạn"} tabIndex={photo ? 0 : -1}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={onKeyDown}
          className={`block h-full w-full touch-none select-none outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-emerald-600 ${photo ? "cursor-grab active:cursor-grabbing" : ""}`} style={{ WebkitTouchCallout: "none" }} />
        {!photo && <p className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-sm font-medium text-zinc-600">Chọn ảnh của bạn để ghép vào khung</p>}
      </div>
      {photo && <p className="mt-2 text-center text-xs text-zinc-500">Kéo ảnh bằng ngón tay để căn lại.</p>}
    </div>

    <div className="space-y-6">
      <section aria-labelledby="step-pick">
        <h2 id="step-pick" className="text-base font-bold">1. Chọn ảnh của bạn</h2>
        <label className="mt-3 flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-emerald-700 px-5 py-3 text-center text-base font-semibold text-white hover:bg-emerald-800 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-emerald-700 sm:w-auto">
          {photo ? "Đổi ảnh khác" : "Chọn ảnh từ máy"}
          <input type="file" accept="image/*" className="sr-only" onChange={(event) => { void pickFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        </label>
        <p className="mt-2 text-sm text-zinc-600">Ảnh được ghép ngay trên máy của bạn và không được tải lên đâu cả.</p>
      </section>

      <section aria-labelledby="step-adjust" className={photo ? "" : "opacity-50"}>
        <h2 id="step-adjust" className="text-base font-bold">2. Căn ảnh</h2>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" aria-label="Thu nhỏ" disabled={!photo || zoom <= 1} onClick={() => changeZoom(zoom - STEP)} className={iconButton}>−</button>
          <label className="min-w-0 flex-1 text-sm"><span className="sr-only">Phóng to</span>
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} disabled={!photo} onChange={(event) => changeZoom(Number(event.target.value))} className="h-11 w-full accent-emerald-700" />
          </label>
          <button type="button" aria-label="Phóng to" disabled={!photo || zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom + STEP)} className={iconButton}>+</button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <button type="button" disabled={!photo} onClick={() => { setZoom(1); setRawOffset({ x: 0, y: 0 }); }} className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">Đặt lại vị trí</button>
          <div className="flex items-center gap-3"><canvas ref={roundRef} width={ROUND_SIZE} height={ROUND_SIZE} aria-hidden="true" className="size-14 rounded-full border border-zinc-200 bg-white" /><p className="text-xs text-zinc-500">Xem trước<br />dạng tròn</p></div>
        </div>
      </section>

      <section aria-labelledby="step-save" className={photo ? "" : "opacity-50"}>
        <h2 id="step-save" className="text-base font-bold">3. Tải avatar về</h2>
        <button type="button" disabled={!photo} onClick={createResult} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl border border-emerald-700 bg-white px-5 py-3 text-base font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60 sm:w-auto">Tạo ảnh {EXPORT_SIZE}×{EXPORT_SIZE}</button>
        {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {freshResult && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
          <p className="text-sm font-medium text-emerald-900">Ảnh đã sẵn sàng.</p>
          <a href={freshResult.url} download={fileName} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-700 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-800 sm:w-auto">Tải ảnh PNG về máy</a>
          <img src={freshResult.url} alt="Avatar đã ghép khung" className="mt-4 aspect-square w-40 rounded-full border border-zinc-200" />
          <p className="mt-3 text-xs text-zinc-500">Nếu điện thoại không tự tải, hãy nhấn giữ ảnh rồi chọn Lưu ảnh.</p>
        </div>}
      </section>
    </div>
  </div>;
}

export function FrameMaker({ frameId }: { frameId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const validId = uuidPattern.test(frameId);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!supabase || !validId) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase.from("avatar_frames").select("id,name,image_path").eq("id", frameId).maybeSingle();
      if (!active) return;
      if (error) { setLoaded({ key: frameId, frame: null, img: null, error: "Không tải được khung. Vui lòng thử lại." }); return; }
      if (!data) { setLoaded({ key: frameId, frame: null, img: null, error: "" }); return; }
      const frame = data as AvatarFrame;
      try {
        // crossOrigin để canvas không bị "tainted" và vẫn xuất được PNG.
        const img = await loadImage(frameImageUrl(frame.image_path), "anonymous");
        if (active) setLoaded({ key: frameId, frame, img, error: "" });
      } catch {
        if (active) setLoaded({ key: frameId, frame, img: null, error: "Không tải được ảnh khung. Vui lòng thử lại." });
      }
    })();
    return () => { active = false; };
  }, [supabase, frameId, validId]);

  const state = loaded?.key === frameId ? loaded : null;
  const notFound = !validId || (state && !state.frame && !state.error);

  return <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
    <header className="mb-6 max-w-2xl">
      <h1 className="break-words text-2xl font-bold sm:text-3xl">Tạo avatar có khung</h1>
      {state?.frame && <p className="mt-2 break-words text-base text-zinc-600">Khung: {state.frame.name}</p>}
    </header>
    {!supabase ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Hệ thống chưa được cấu hình. Vui lòng quay lại sau.</p>
      : notFound ? <div role="alert" className="rounded-xl border border-zinc-200 bg-white p-6"><p className="font-semibold">Không tìm thấy khung này.</p><p className="mt-2 text-sm text-zinc-600">Link có thể bị sai hoặc khung đã bị xóa. Hãy hỏi lại Ban chủ chốt để lấy link mới.</p><Link href="/" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Về trang chủ</Link></div>
      : !state ? <p role="status" className="text-sm text-zinc-500">Đang tải khung…</p>
      : state.error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{state.error}</p>
      : state.frame && state.img ? <FrameEditor key={state.frame.id} frame={state.frame} frameImg={state.img} />
      : null}
  </div>;
}
