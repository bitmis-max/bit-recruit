import { test } from "node:test";
import assert from "node:assert/strict";
import { facebookProfileKey } from "../../src/lib/facebook/profile-key.ts";

const k = facebookProfileKey;

// ---------------------------------------------------------------------------
// Username
// ---------------------------------------------------------------------------
test("username: URL tuyệt đối trên facebook.com và www.", () => {
  assert.equal(k("https://facebook.com/john.doe"), "u:john.doe");
  assert.equal(k("https://www.facebook.com/john.doe"), "u:john.doe");
  assert.equal(k("https://www.facebook.com/zuckerberg"), "u:zuckerberg");
});

test("username: chữ hoa được hạ xuống chữ thường", () => {
  assert.equal(k("https://www.facebook.com/John.DOE"), "u:john.doe");
  assert.equal(k("HTTPS://WWW.FACEBOOK.COM/Zuckerberg"), "u:zuckerberg");
});

test("username: bỏ '/' cuối, query và fragment", () => {
  assert.equal(k("https://www.facebook.com/john.doe/"), "u:john.doe");
  assert.equal(k("https://www.facebook.com/john.doe?ref=bookmarks"), "u:john.doe");
  assert.equal(k("https://www.facebook.com/john.doe/?ref=bookmarks&fref=pb"), "u:john.doe");
  assert.equal(k("https://www.facebook.com/john.doe#frag"), "u:john.doe");
  assert.equal(k("https://www.facebook.com/john.doe/?comment_id=123#x"), "u:john.doe");
});

test("username: bỏ đoạn sau username (posts, photos, ...)", () => {
  assert.equal(k("https://www.facebook.com/john.doe/posts/12345"), "u:john.doe");
  assert.equal(k("https://www.facebook.com/john.doe/photos"), "u:john.doe");
  assert.equal(k("https://www.facebook.com/john.doe/friends/"), "u:john.doe");
});

test("username: số và dấu chấm hợp lệ, chặn ký tự lạ và độ dài ngoài 5-80", () => {
  assert.equal(k("https://www.facebook.com/user123"), "u:user123");
  assert.equal(k("https://www.facebook.com/abcde"), "u:abcde"); // đúng 5 ký tự
  assert.equal(k("https://www.facebook.com/abcd"), null); // 4 ký tự
  assert.equal(k("https://www.facebook.com/a"), null);
  assert.equal(k("https://www.facebook.com/ab"), null);
  assert.equal(k("https://www.facebook.com/" + "a".repeat(80)), "u:" + "a".repeat(80));
  assert.equal(k("https://www.facebook.com/" + "a".repeat(81)), null);
  assert.equal(k("https://www.facebook.com/john_doe"), null);
  assert.equal(k("https://www.facebook.com/john-doe"), null);
  assert.equal(k("https://www.facebook.com/john%20doe"), null);
});

// ---------------------------------------------------------------------------
// profile.php và people
// ---------------------------------------------------------------------------
test("profile.php?id=<số> -> id:<số>", () => {
  assert.equal(k("https://www.facebook.com/profile.php?id=100012345678901"), "id:100012345678901");
  assert.equal(k("https://facebook.com/profile.php?id=123456"), "id:123456");
  assert.equal(k("https://www.facebook.com/profile.php?id=123456&ref=bookmarks"), "id:123456");
  assert.equal(k("https://www.facebook.com/profile.php?ref=bookmarks&id=123456"), "id:123456");
  assert.equal(k("https://www.facebook.com/profile.php?id=123456#x"), "id:123456");
});

test("profile.php thiếu id hoặc id không phải số -> null", () => {
  assert.equal(k("https://www.facebook.com/profile.php"), null);
  assert.equal(k("https://www.facebook.com/profile.php?ref=bookmarks"), null);
  assert.equal(k("https://www.facebook.com/profile.php?id="), null);
  assert.equal(k("https://www.facebook.com/profile.php?id=abc"), null);
});

test("/people/<tên>/<số> -> id:<số>", () => {
  assert.equal(k("https://www.facebook.com/people/Nguyen-Van-A/100012345678901"), "id:100012345678901");
  assert.equal(k("https://www.facebook.com/people/Nguyen-Van-A/100012345678901/"), "id:100012345678901");
  assert.equal(k("https://www.facebook.com/people/Nguyen-Van-A/100012345678901/?ref=x#y"), "id:100012345678901");
});

test("/people thiếu số -> null", () => {
  assert.equal(k("https://www.facebook.com/people"), null);
  assert.equal(k("https://www.facebook.com/people/"), null);
  assert.equal(k("https://www.facebook.com/people/Nguyen-Van-A"), null);
  assert.equal(k("https://www.facebook.com/people/Nguyen-Van-A/"), null);
});

test("đoạn đầu toàn chữ số 3-25 chữ số -> id:<số>", () => {
  assert.equal(k("https://www.facebook.com/100012345678901"), "id:100012345678901");
  assert.equal(k("https://m.facebook.com/100012345678901/posts/1"), "id:100012345678901");
  assert.equal(k("/100012345678901"), "id:100012345678901");
  assert.equal(k("https://www.facebook.com/100012345678901/?ref=x#y"), "id:100012345678901");
  assert.equal(k("https://www.facebook.com/123"), "id:123");
  assert.equal(k("https://www.facebook.com/" + "9".repeat(25)), "id:" + "9".repeat(25));
});

test("đoạn đầu có chữ lẫn số vẫn là username", () => {
  assert.equal(k("https://www.facebook.com/abc123"), "u:abc123");
  assert.equal(k("https://www.facebook.com/123abc"), "u:123abc");
});

test("đoạn đầu toàn chữ số nhưng không phải 3-25 chữ số -> null", () => {
  assert.equal(k("https://www.facebook.com/12"), null);
  assert.equal(k("https://www.facebook.com/1"), null);
  assert.equal(k("/12"), null);
  assert.equal(k("/1"), null);
  assert.equal(k("https://www.facebook.com/" + "9".repeat(26)), null);
  assert.equal(k("https://www.facebook.com/" + "9".repeat(40)), null);
});

test("username toàn số/dấu chấm hoặc quá ngắn -> null; toàn số 3-25 chữ số là id", () => {
  assert.equal(k("https://www.facebook.com/....."), null);
  assert.equal(k("https://www.facebook.com/........"), null);
  assert.equal(k("https://www.facebook.com/1.2.3.4"), null); // không có chữ cái
  assert.equal(k("https://www.facebook.com/12345"), "id:12345");
  assert.equal(k("/12345"), "id:12345");
  assert.equal(k("https://www.facebook.com/12345.6"), null);
});

test("/p/<slug>-<số> -> id:<số> (lấy dãy số cuối)", () => {
  assert.equal(k("https://www.facebook.com/p/Thinh-Bui-100012345678901/"), "id:100012345678901");
  assert.equal(k("/p/Thinh-Bui-100012345678901/"), "id:100012345678901");
  assert.equal(k("https://www.facebook.com/p/Thinh-Bui-100012345678901"), "id:100012345678901");
  assert.equal(k("https://m.facebook.com/p/An-123456/?ref=x#y"), "id:123456");
  assert.equal(k("https://www.facebook.com/p/Nguyen-2024-Van-100012345678901/"), "id:100012345678901");
  // không có số ở cuối -> null
  assert.equal(k("https://www.facebook.com/p/Thinh-Bui/"), null);
  assert.equal(k("https://www.facebook.com/p/"), null);
  assert.equal(k("https://www.facebook.com/p"), null);
  assert.equal(k("/p"), null);
});

test("/profile/<số> -> id:<số>; thiếu số -> null", () => {
  assert.equal(k("https://www.facebook.com/profile/100012345678901"), "id:100012345678901");
  assert.equal(k("/profile/100012345678901/"), "id:100012345678901");
  assert.equal(k("https://m.facebook.com/profile/123456?ref=x"), "id:123456");
  assert.equal(k("https://www.facebook.com/profile"), null);
  assert.equal(k("https://www.facebook.com/profile/"), null);
});

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------
test("host hợp lệ: www./m./web./mbasic. facebook.com, fb.com, www.fb.com", () => {
  assert.equal(k("https://m.facebook.com/john.doe"), "u:john.doe");
  assert.equal(k("https://web.facebook.com/john.doe"), "u:john.doe");
  assert.equal(k("https://mbasic.facebook.com/john.doe"), "u:john.doe");
  assert.equal(k("https://fb.com/john.doe"), "u:john.doe");
  assert.equal(k("https://www.fb.com/john.doe"), "u:john.doe");
  assert.equal(k("https://m.facebook.com/profile.php?id=123456"), "id:123456");
  assert.equal(k("https://web.facebook.com/people/An/123456"), "id:123456");
  assert.equal(k("https://mbasic.facebook.com/profile.php?id=123456"), "id:123456");
  assert.equal(k("https://fb.com/profile.php?id=123456"), "id:123456");
});

test("host lạ -> null (facebook.com.evil.com, evilfacebook.com, ...)", () => {
  assert.equal(k("https://facebook.com.evil.com/john.doe"), null);
  assert.equal(k("https://www.facebook.com.evil.com/john.doe"), null);
  assert.equal(k("https://evilfacebook.com/john.doe"), null);
  assert.equal(k("https://notfb.com/john.doe"), null);
  assert.equal(k("https://fb.com.evil.com/john.doe"), null);
  assert.equal(k("https://evil.com/facebook.com/john.doe"), null);
  assert.equal(k("https://evil.com/john.doe?u=facebook.com/jane"), null);
  assert.equal(k("https://facebook.org/john.doe"), null);
  assert.equal(k("https://twitter.com/john.doe"), null);
  // userinfo giả mạo: host thật là evil.com
  assert.equal(k("https://www.facebook.com@evil.com/john.doe"), null);
});

// ---------------------------------------------------------------------------
// Đường dẫn tương đối
// ---------------------------------------------------------------------------
test("đường dẫn tương đối bắt đầu bằng '/' coi như trên facebook.com", () => {
  assert.equal(k("/john.doe"), "u:john.doe");
  assert.equal(k("/John.Doe/"), "u:john.doe");
  assert.equal(k("/john.doe?ref=x#y"), "u:john.doe");
  assert.equal(k("/john.doe/posts/1"), "u:john.doe");
  assert.equal(k("/profile.php?id=100012345678901"), "id:100012345678901");
  assert.equal(k("/people/An/123456"), "id:123456");
  assert.equal(k("/groups/123456"), null);
  assert.equal(k("/profile.php"), null);
});

// ---------------------------------------------------------------------------
// Từ dành riêng
// ---------------------------------------------------------------------------
const RESERVED = [
  "groups", "pages", "events", "photo", "photo.php", "photos", "watch", "hashtag",
  "story.php", "permalink.php", "reel", "reels", "share", "sharer", "login", "help",
  "notifications", "messages", "marketplace", "gaming", "friends", "settings",
  "bookmarks", "search", "ufi", "reactions", "home.php", "privacy", "policies", "ads",
  "business", "l.php", "stories", "live", "media", "saved", "memories", "fundraisers",
  "dialog", "plugins", "sharer.php", "video", "videos", "posts",
  // thêm sau review
  "me", "public", "about", "lite", "legal", "directory", "r.php", "reg", "apps", "games",
  "jobs", "offers", "places", "lists", "communities",
];

test("từ dành riêng ở đoạn đầu -> null (mọi dạng: trơn, có đoạn sau, có query)", () => {
  for (const w of RESERVED) {
    for (const path of [`/${w}`, `/${w}/`, `/${w}/123456789`, `/${w}/abc/def`, `/${w}?id=123456&x=1`]) {
      assert.equal(k(`https://www.facebook.com${path}`), null, `https://www.facebook.com${path}`);
      assert.equal(k(path), null, `đường dẫn tương đối ${path}`);
    }
  }
});

test("từ dành riêng: trên mọi host hợp lệ", () => {
  for (const host of ["facebook.com", "m.facebook.com", "web.facebook.com", "mbasic.facebook.com", "fb.com"]) {
    assert.equal(k(`https://${host}/groups/12345`), null, host);
    assert.equal(k(`https://${host}/photo.php?fbid=123`), null, host);
  }
});

test("từ dành riêng mới (p, profile khi thiếu số) -> null", () => {
  for (const w of ["p", "profile"]) {
    assert.equal(k(`https://www.facebook.com/${w}`), null, w);
    assert.equal(k(`https://www.facebook.com/${w}/`), null, w);
    assert.equal(k(`/${w}?x=1`), null, w);
  }
});

test("username chứa từ dành riêng nhưng không trùng đoạn đầu vẫn hợp lệ", () => {
  assert.equal(k("https://www.facebook.com/groupsfan"), "u:groupsfan");
  assert.equal(k("https://www.facebook.com/john.doe/groups/1"), "u:john.doe");
  assert.equal(k("https://www.facebook.com/help.me"), "u:help.me");
  assert.equal(k("https://www.facebook.com/aboutme"), "u:aboutme");
  assert.equal(k("https://www.facebook.com/public.relations"), "u:public.relations");
});

// ---------------------------------------------------------------------------
// Chuỗi rác
// ---------------------------------------------------------------------------
test("chuỗi rỗng, rác, không parse được -> null", () => {
  for (const raw of [
    "",
    "   ",
    "\n\t",
    "not a url",
    "john.doe",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://",
    "https:///john.doe",
    "https://www.facebook.com",
    "https://www.facebook.com/",
    "/",
    "//",
    "<script>alert(1)</script>",
    "https://www.facebook.com/<script>",
  ]) {
    assert.equal(k(raw), null, JSON.stringify(raw));
  }
});
