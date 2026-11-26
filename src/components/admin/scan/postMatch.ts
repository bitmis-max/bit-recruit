// So sánh link bài viết Facebook của việc với địa chỉ trang bookmarklet đã quét (`scan.source`).
// Thuần TS, không import: chạy được bằng `node --test`.

const POST_SEGMENTS = ["posts", "videos", "reel", "reels", "permalink", "p"];
const POST_ID = /^(\d{5,25}|pfbid[a-z0-9]+)$/i;
const ID_PARAMS = ["story_fbid", "fbid", "v", "multi_permalinks"];

export type PostIdentity = { id: string | null; path: string };

/** Lấy id bài (nếu thấy) và đường dẫn đã bỏ query/fragment. Trả null nếu không phải link Facebook hợp lệ. */
export function postIdentity(raw: string): PostIdentity | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "fb.com" && !host.endsWith(".fb.com") && host !== "facebook.com" && !host.endsWith(".facebook.com")) return null;
  const segments = url.pathname.split("/").filter(Boolean).map((part) => {
    try { return decodeURIComponent(part).toLowerCase(); } catch { return part.toLowerCase(); }
  });
  let id: string | null = null;
  for (const name of ID_PARAMS) {
    const value = url.searchParams.get(name);
    if (value && POST_ID.test(value)) { id = value.toLowerCase(); break; }
  }
  if (!id) {
    const index = segments.findIndex((part) => POST_SEGMENTS.includes(part));
    const next = index >= 0 ? segments[index + 1] : undefined;
    if (next && POST_ID.test(next)) id = next;
  }
  return { id, path: `/${segments.join("/")}` };
}

/** true khi chắc chắn là cùng một bài. Không xác định được một trong hai vế thì coi là khác. */
export function samePost(a: string, b: string): boolean {
  const left = postIdentity(a), right = postIdentity(b);
  if (!left || !right) return false;
  if (left.id && right.id) return left.id === right.id;
  return left.path === right.path;
}
