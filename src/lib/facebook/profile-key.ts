/* eslint-disable @typescript-eslint/no-unused-vars */
// Chuẩn hóa link hồ sơ Facebook thành khóa so khớp ("id:<số>" hoặc "u:<username>").
// Hàm này TỰ ĐÓNG GÓI: bookmarklet nhúng bằng `toString()` và chạy trên trang Facebook,
// nên mọi hằng số nằm trong thân hàm và chỉ dùng cú pháp ES2017 đơn giản.
export function facebookProfileKey(raw: string): string | null {
  const reserved = [
    "groups", "pages", "events", "photo", "photo.php", "photos", "watch", "hashtag", "story.php",
    "permalink.php", "reel", "reels", "share", "sharer", "login", "help", "notifications", "messages",
    "marketplace", "gaming", "friends", "settings", "bookmarks", "search", "ufi", "reactions",
    "profile.php", "home.php", "privacy", "policies", "ads", "business", "l.php", "stories", "live",
    "media", "saved", "memories", "fundraisers", "people", "dialog", "plugins", "sharer.php", "video",
    "videos", "posts", "pg", "login.php", "checkpoint", "recover", "ajax", "hovercard", "rsrc.php",
    "p", "profile", "me", "public", "about", "lite", "legal", "directory", "r.php", "reg", "apps", "games",
    "jobs", "offers", "places", "lists", "communities",
  ];
  const hosts = [
    "facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "mbasic.facebook.com",
    "fb.com", "www.fb.com",
  ];
  const s = String(raw == null ? "" : raw).trim();
  if (!s || s.length > 2000) return null;

  let rest = "";
  if (s.charAt(0) === "/") {
    if (s.charAt(1) === "/") return null;
    rest = s;
  } else {
    const m = /^https?:\/\/([^\/?#]+)(.*)$/i.exec(s);
    if (!m) return null;
    if (hosts.indexOf(m[1].toLowerCase()) < 0) return null;
    rest = m[2];
  }

  const hashAt = rest.indexOf("#");
  if (hashAt >= 0) rest = rest.slice(0, hashAt);
  let query = "";
  const queryAt = rest.indexOf("?");
  if (queryAt >= 0) {
    query = rest.slice(queryAt + 1);
    rest = rest.slice(0, queryAt);
  }

  const parts = rest.split("/");
  const segs: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    let seg = parts[i];
    try {
      seg = decodeURIComponent(seg);
    } catch (e) {
      return null;
    }
    segs.push(seg.toLowerCase());
  }
  if (!segs.length) return null;

  const first = segs[0];
  if (first === "profile.php") {
    const idMatch = /(?:^|&)id=([0-9]{3,25})(?:&|$)/.exec(query);
    return idMatch ? "id:" + idMatch[1] : null;
  }
  if (first === "people") {
    if (segs.length >= 3 && /^[0-9]{3,25}$/.test(segs[2])) return "id:" + segs[2];
    return null;
  }
  if (first === "p") {
    const slug = /-([0-9]{3,25})$/.exec(segs[1] || "");
    return slug ? "id:" + slug[1] : null;
  }
  if (first === "profile") {
    return segs.length >= 2 && /^[0-9]{3,25}$/.test(segs[1]) ? "id:" + segs[1] : null;
  }
  if (/^[0-9]+$/.test(first)) return /^[0-9]{3,25}$/.test(first) ? "id:" + first : null;
  if (reserved.indexOf(first) >= 0) return null;
  if (!/^[a-z0-9.]{5,80}$/.test(first) || !/[a-z]/.test(first)) return null;
  return "u:" + first;
}
