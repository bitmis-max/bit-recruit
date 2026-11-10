/* eslint-disable @typescript-eslint/no-unused-vars */
import { facebookProfileKey } from "./profile-key.ts";
import { ringSignature } from "./frame-signature.ts";

export type ScanItem = { key: string; name: string; sig: number[] | null };
export type ScanPayload = { source: string; scannedAt: string; items: ScanItem[] };

const MAX_ITEMS = 3000;
const keyPattern = /^(id:[0-9]{3,25}|u:[a-z0-9.]{1,80})$/;

// Chạy trên trang Facebook (nhúng vào bookmarklet bằng `toString()`), nên TỰ ĐÓNG GÓI:
// không import, không hằng số ngoài thân hàm, chỉ cú pháp ES2017 đơn giản (var, for, if, callback).
// Đọc tên + link hồ sơ (+ vòng viền avatar) trong hộp thoại/vùng chính đang hiện, rồi mở trang đối chiếu của web CLB.
export function scanFacebookPage(
  profileKey: (raw: string) => string | null,
  ringSig: (rgba: ArrayLike<number>, size: number) => number[],
  siteOrigin: string,
): void {
  const MAX = 3000;
  const SIZE = 48;
  const TIMEOUT_MS = 3000;
  const MAX_URL = 1500000;
  const doc = window.document || document;
  const loc = window.location || location;
  const origin = String(siteOrigin).replace(/\/+$/, "");
  const noticeId = "bit-scan-notice";

  function notify(message: string, link?: string) {
    try {
      const old = doc.getElementById(noticeId);
      if (old && old.parentNode) old.parentNode.removeChild(old);
      const box = doc.createElement("div");
      box.id = noticeId;
      box.setAttribute("role", "status");
      box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:320px;padding:12px 16px;border-radius:10px;background:#111827;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)";
      const line = doc.createElement("div");
      line.textContent = message;
      box.appendChild(line);
      if (link) {
        const anchor = doc.createElement("a");
        anchor.href = link;
        anchor.target = "_blank";
        anchor.textContent = "Mở trang đối chiếu";
        anchor.style.cssText = "display:inline-block;margin-top:8px;color:#93c5fd;text-decoration:underline";
        box.appendChild(anchor);
      }
      doc.body.appendChild(box);
      const timer = setTimeout(function () {
        if (box.parentNode) box.parentNode.removeChild(box);
      }, link ? 20000 : 6000) as unknown as { unref?: () => void };
      if (timer && timer.unref) timer.unref();
    } catch (e) {
      /* thông báo chỉ là phụ, bỏ qua lỗi */
    }
  }

  function keyOf(a: Element): string | null {
    const href = a.getAttribute("href");
    return href ? profileKey(href) : null;
  }

  function imageUrl(el: Element): string {
    let url = "";
    if (String(el.tagName).toLowerCase() === "image") {
      const svg = el as SVGImageElement;
      url = (svg.href && svg.href.baseVal) || el.getAttribute("href") || el.getAttribute("xlink:href") || "";
    } else {
      const img = el as HTMLImageElement;
      url = img.currentSrc || img.src || "";
    }
    return /^(https?:|data:image\/)/i.test(url) ? url : "";
  }

  function usableImage(el: Element): boolean {
    if (!el.getBoundingClientRect) return true;
    const rect = el.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 24) return false;
    const ratio = rect.width / rect.height;
    return ratio > 0.8 && ratio < 1.25 && imageUrl(el) !== "";
  }

  function findImage(anchor: Element, key: string): Element | null {
    let el: Element | null = anchor;
    for (let level = 0; level < 5 && el; level++) {
      const links = el.querySelectorAll("a[href]");
      for (let j = 0; j < links.length; j++) {
        const other = keyOf(links[j]);
        if (other && other !== key) return null;
      }
      const images = el.querySelectorAll("img, image");
      for (let k = 0; k < images.length; k++) {
        if (usableImage(images[k])) return images[k];
      }
      el = el.parentElement;
    }
    return null;
  }

  let root: Element | null = null;
  const dialogs = doc.querySelectorAll('[role="dialog"]');
  for (let d = dialogs.length - 1; d >= 0 && !root; d--) {
    if (dialogs[d].querySelector("a[href]")) root = dialogs[d];
  }
  if (!root) root = doc.querySelector('[role="main"]');
  if (!root) root = doc.body;

  const anchors = root.querySelectorAll("a[href]");
  const byKey: { [key: string]: { key: string; name: string; sig: number[] | null; img: Element | null } } = {};
  const order: string[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const key = keyOf(anchors[i]);
    if (!key) continue;
    let item = byKey[key];
    if (!item) {
      if (order.length >= MAX) continue;
      item = { key: key, name: "", sig: null, img: null };
      byKey[key] = item;
      order.push(key);
    }
    const name = String(anchors[i].textContent || "").replace(/\s+/g, " ").trim();
    if (!item.name && name && name.length <= 100) item.name = name;
    if (!item.img) item.img = findImage(anchors[i], key);
  }

  if (!order.length) {
    notify("Chưa thấy hồ sơ nào. Hãy mở hộp danh sách người react hoặc phần bình luận rồi bấm lại.");
    return;
  }
  notify("Đang đọc " + order.length + " hồ sơ...");

  let pending = 0;
  let finished = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  function finish() {
    if (finished) return;
    finished = true;
    if (timeout) clearTimeout(timeout);
    const scannedAt = new Date().toISOString();
    function buildUrl(withSig: boolean) {
      const items = [];
      for (let n = 0; n < order.length; n++) {
        const it = byKey[order[n]];
        let sig: number[] | null = null;
        if (withSig && it.sig) {
          sig = [];
          for (let q = 0; q < it.sig.length; q++) sig.push(Math.round(it.sig[q]));
        }
        items.push({ key: it.key, name: it.name, sig: sig });
      }
      const payload = { v: 1, source: String(loc.href), scannedAt: scannedAt, items: items };
      return origin + "/manage-clubs/scan#" + encodeURIComponent(JSON.stringify(payload));
    }
    let url = buildUrl(true);
    let note = "";
    if (url.length > MAX_URL) {
      url = buildUrl(false);
      note = " Danh sách dài nên đã bỏ phần nhận diện khung avatar.";
    }
    if (url.length > MAX_URL) {
      notify("Danh sách quá dài, hãy quét từng phần.");
      return;
    }
    let opened = null;
    try {
      opened = window.open(url, "_blank");
    } catch (e) {
      opened = null;
    }
    if (opened) notify("Đã đọc " + order.length + " hồ sơ. Đã mở trang đối chiếu." + note);
    else notify("Đã đọc " + order.length + " hồ sơ nhưng trình duyệt chặn cửa sổ mới." + note + " Bấm liên kết bên dưới.", url);
  }

  function startJob(it: { sig: number[] | null; img: Element | null }, url: string) {
    let settled = false;
    function settle() {
      if (settled) return;
      settled = true;
      pending--;
      if (pending <= 0) finish();
    }
    pending++;
    try {
      const image = new (window.Image || Image)();
      image.crossOrigin = "anonymous";
      image.onload = function () {
        try {
          const canvas = doc.createElement("canvas");
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(image, 0, 0, SIZE, SIZE);
            it.sig = ringSig(ctx.getImageData(0, 0, SIZE, SIZE).data, SIZE);
          }
        } catch (e) {
          it.sig = null;
        }
        settle();
      };
      image.onerror = settle;
      image.src = url;
    } catch (e) {
      settle();
    }
  }

  const jobs = [];
  for (let p = 0; p < order.length; p++) {
    const current = byKey[order[p]];
    if (!current.img) continue;
    const src = imageUrl(current.img);
    if (src) jobs.push({ item: current, url: src });
  }
  if (!jobs.length) {
    finish();
    return;
  }
  timeout = setTimeout(finish, TIMEOUT_MS);
  for (let r = 0; r < jobs.length; r++) startJob(jobs[r].item, jobs[r].url);
}

export function buildBookmarklet(siteOrigin: string): string {
  return "javascript:" + encodeURIComponent(
    "(" + scanFacebookPage.toString() + ")(" + facebookProfileKey.toString() + "," + ringSignature.toString() + "," + JSON.stringify(siteOrigin) + ")",
  );
}

// Giải mã phần `#` do bookmarklet tạo; kiểm tra kiểu chặt, sai thì trả null.
export function parseScanPayload(hash: string): { source: string; scannedAt: string; items: ScanItem[] } | null {
  if (typeof hash !== "string") return null;
  const encoded = hash.charAt(0) === "#" ? hash.slice(1) : hash;
  if (!encoded || encoded.length > 8_000_000) return null;
  let text = encoded;
  try {
    text = decodeURIComponent(encoded);
  } catch {
    // Trình duyệt có thể đã giải mã sẵn; thử parse nguyên bản.
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.v !== 1) return null;
  if (typeof record.source !== "string" || typeof record.scannedAt !== "string") return null;
  if (!Array.isArray(record.items) || record.items.length > MAX_ITEMS) return null;

  const items: ScanItem[] = [];
  for (const raw of record.items as unknown[]) {
    if (!raw || typeof raw !== "object") return null;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.key !== "string" || !keyPattern.test(entry.key)) return null;
    if (typeof entry.name !== "string" || entry.name.length > 100) return null;
    let sig: number[] | null = null;
    if (entry.sig !== null) {
      if (!Array.isArray(entry.sig) || entry.sig.length !== 72) return null;
      for (const value of entry.sig as unknown[]) {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 255) return null;
      }
      sig = entry.sig as number[];
    }
    items.push({ key: entry.key, name: entry.name, sig });
  }
  return { source: record.source.slice(0, 2000), scannedAt: record.scannedAt.slice(0, 100), items };
}
