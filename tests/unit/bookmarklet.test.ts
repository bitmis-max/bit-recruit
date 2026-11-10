import { test } from "node:test";
import assert from "node:assert/strict";
import { facebookProfileKey } from "../../src/lib/facebook/profile-key.ts";
import { ringSignature } from "../../src/lib/facebook/frame-signature.ts";
import {
  scanFacebookPage,
  buildBookmarklet,
  parseScanPayload,
} from "../../src/lib/facebook/bookmarklet.ts";

// Dựng lại hàm từ toString() trong phạm vi global (không thấy biến/import của module):
// chạy được nghĩa là hàm tự đóng gói, đúng cách bookmarklet nhúng chúng vào trang Facebook.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rebuild(fn: (...args: any[]) => unknown): any {
  return new Function("return " + fn.toString())();
}

// ---------------------------------------------------------------------------
// Tự đóng gói
// ---------------------------------------------------------------------------
test("facebookProfileKey dựng lại bằng new Function vẫn cho kết quả y hệt", () => {
  const f = rebuild(facebookProfileKey);
  assert.equal(typeof f, "function");
  const inputs = [
    "https://www.facebook.com/John.Doe/",
    "https://m.facebook.com/profile.php?id=100012345678901&ref=x",
    "https://web.facebook.com/people/An/123456/",
    "https://fb.com/zuckerberg?x=1#y",
    "/john.doe/posts/1",
    "/groups/123",
    "/profile.php",
    "https://facebook.com.evil.com/john.doe",
    "https://evilfacebook.com/john.doe",
    "",
    "rác",
  ];
  for (const raw of inputs) {
    assert.equal(f(raw), facebookProfileKey(raw), JSON.stringify(raw));
  }
  assert.equal(f("https://www.facebook.com/John.Doe/"), "u:john.doe");
  assert.equal(f("https://www.facebook.com/profile.php?id=123456"), "id:123456");
});

test("ringSignature dựng lại bằng new Function vẫn cho kết quả y hệt", () => {
  const f = rebuild(ringSignature);
  assert.equal(typeof f, "function");
  const size = 32;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = (i * 7) % 256;
    rgba[i * 4 + 1] = (i * 13) % 256;
    rgba[i * 4 + 2] = (i * 29) % 256;
    rgba[i * 4 + 3] = 255;
  }
  const got = f(rgba, size);
  assert.equal(got.length, 72);
  assert.deepEqual(Array.from(got), ringSignature(rgba, size));
});

test("scanFacebookPage dựng lại bằng new Function không lỗi cú pháp và là function", () => {
  const f = rebuild(scanFacebookPage);
  assert.equal(typeof f, "function");
});

// Heuristic: bookmarklet chạy trên trình duyệt người dùng nên chỉ dùng cú pháp ES2017 cơ bản.
function stripLiterals(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""')
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("cả ba hàm không dùng cú pháp mới (spread, ?., ??, async/await, class)", () => {
  const fns: [string, (...args: never[]) => unknown][] = [
    ["facebookProfileKey", facebookProfileKey],
    ["ringSignature", ringSignature],
    ["scanFacebookPage", scanFacebookPage],
  ];
  for (const [name, fn] of fns) {
    const src = stripLiterals(fn.toString());
    assert.ok(!/\.\.\./.test(src), `${name}: spread/rest`);
    assert.ok(!/\?\./.test(src), `${name}: optional chaining`);
    assert.ok(!/\?\?/.test(src), `${name}: nullish coalescing`);
    assert.ok(!/\basync\b/.test(src), `${name}: async`);
    assert.ok(!/\bawait\b/.test(src), `${name}: await`);
    assert.ok(!/\bclass\b/.test(src), `${name}: class`);
    assert.ok(!/\bimport\b/.test(src), `${name}: import`);
  }
});

// ---------------------------------------------------------------------------
// buildBookmarklet
// ---------------------------------------------------------------------------
test("buildBookmarklet: bắt đầu bằng javascript:, giải mã ra code chứa siteOrigin, parse được", () => {
  const origin = "https://clb.example.com";
  const url = buildBookmarklet(origin);
  assert.ok(url.startsWith("javascript:"));
  const encoded = url.slice("javascript:".length);
  assert.ok(encoded.length > 0);
  assert.ok(/^[A-Za-z0-9\-_.!~*'()%]*$/.test(encoded), "phần sau javascript: phải là encodeURIComponent");
  const decoded = decodeURIComponent(encoded);
  assert.ok(decoded.includes(JSON.stringify(origin)));
  assert.ok(decoded.includes(scanFacebookPage.toString()));
  assert.ok(decoded.includes(facebookProfileKey.toString()));
  assert.ok(decoded.includes(ringSignature.toString()));
  assert.doesNotThrow(() => new Function(decoded)); // chỉ biên dịch, không chạy
});

test("buildBookmarklet: origin có ký tự đặc biệt vẫn được escape, code vẫn biên dịch được", () => {
  const origin = 'http://localhost:3000/"; alert(1); //';
  const decoded = decodeURIComponent(buildBookmarklet(origin).slice("javascript:".length));
  assert.ok(decoded.includes(JSON.stringify(origin)));
  assert.doesNotThrow(() => new Function(decoded));
});

// ---------------------------------------------------------------------------
// parseScanPayload
// ---------------------------------------------------------------------------
const SIG = Array.from({ length: 72 }, (_, i) => i * 3);
const validPayload = () => ({
  v: 1,
  source: "https://www.facebook.com/groups/1/posts/2",
  scannedAt: "2026-11-12T01:02:03.000Z",
  items: [
    { key: "u:john.doe", name: "John Doe", sig: SIG },
    { key: "id:100012345678901", name: "Nguyễn Văn Á", sig: null },
  ],
});
const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));

test("parseScanPayload: payload hợp lệ, có và không có tiền tố '#'", () => {
  const p = validPayload();
  const expected = { source: p.source, scannedAt: p.scannedAt, items: p.items };
  assert.deepEqual(parseScanPayload(enc(p)), expected);
  assert.deepEqual(parseScanPayload("#" + enc(p)), expected);
});

test("parseScanPayload: sig null được giữ nguyên; sig biên 0 và 255 hợp lệ", () => {
  const p = validPayload();
  p.items = [
    { key: "u:a", name: "A", sig: null },
    { key: "u:b", name: "B", sig: Array.from({ length: 72 }, (_, i) => (i % 2 ? 255 : 0)) },
  ];
  const r = parseScanPayload("#" + enc(p));
  assert.ok(r);
  assert.equal(r.items[0].sig, null);
  assert.equal(r.items[1].sig?.length, 72);
});

test("parseScanPayload: items rỗng vẫn hợp lệ", () => {
  const r = parseScanPayload("#" + enc({ ...validPayload(), items: [] }));
  assert.ok(r);
  assert.deepEqual(r.items, []);
});

test("parseScanPayload: rỗng, '#', JSON hỏng, giải mã lỗi -> null (không ném lỗi)", () => {
  assert.equal(parseScanPayload(""), null);
  assert.equal(parseScanPayload("#"), null);
  assert.equal(parseScanPayload("#" + encodeURIComponent("{broken json")), null);
  assert.equal(parseScanPayload("#%7Bbroken"), null);
  assert.equal(parseScanPayload("#%E0%A4%A"), null); // percent-encoding hỏng
  assert.equal(parseScanPayload("#" + encodeURIComponent("null")), null);
  assert.equal(parseScanPayload("#" + encodeURIComponent("[]")), null);
  assert.equal(parseScanPayload("#" + encodeURIComponent("123")), null);
  assert.equal(parseScanPayload("#" + encodeURIComponent('"text"')), null);
});

test("parseScanPayload: v khác 1 hoặc thiếu -> null", () => {
  const base = validPayload();
  assert.equal(parseScanPayload("#" + enc({ ...base, v: 2 })), null);
  assert.equal(parseScanPayload("#" + enc({ ...base, v: 0 })), null);
  assert.equal(parseScanPayload("#" + enc({ ...base, v: "1" })), null);
  const { v: _v, ...noV } = base;
  void _v;
  assert.equal(parseScanPayload("#" + enc(noV)), null);
});

test("parseScanPayload: items không phải mảng -> null", () => {
  const base = validPayload();
  assert.equal(parseScanPayload("#" + enc({ ...base, items: "x" })), null);
  assert.equal(parseScanPayload("#" + enc({ ...base, items: {} })), null);
  assert.equal(parseScanPayload("#" + enc({ ...base, items: null })), null);
  const { items: _i, ...noItems } = base;
  void _i;
  assert.equal(parseScanPayload("#" + enc(noItems)), null);
});

test("parseScanPayload: key sai định dạng -> null (chỉ cần một item sai là bỏ cả payload)", () => {
  const bad = [
    "",
    "john.doe",
    "u:",
    "u:John", // chữ hoa
    "u:john doe",
    "u:john_doe",
    "u:" + "a".repeat(81),
    "id:",
    "id:12", // ít hơn 3 chữ số
    "id:" + "1".repeat(26), // nhiều hơn 25 chữ số
    "id:abc",
    "x:abc",
    "U:abc",
    "ID:123456",
    "u:abc\n",
  ];
  for (const key of bad) {
    const p = validPayload();
    p.items = [...p.items, { key, name: "X", sig: null }];
    assert.equal(parseScanPayload("#" + enc(p)), null, JSON.stringify(key));
  }
  const p = validPayload();
  // @ts-expect-error key sai kiểu
  p.items = [{ key: 123456, name: "X", sig: null }];
  assert.equal(parseScanPayload("#" + enc(p)), null);
});

test("parseScanPayload: key ở biên hợp lệ được nhận", () => {
  const p = validPayload();
  p.items = [
    { key: "id:123", name: "A", sig: null },
    { key: "id:" + "9".repeat(25), name: "B", sig: null },
    { key: "u:" + "a".repeat(80), name: "C", sig: null },
    { key: "u:a.b.c1", name: "D", sig: null },
  ];
  const r = parseScanPayload("#" + enc(p));
  assert.ok(r);
  assert.equal(r.items.length, 4);
});

test("parseScanPayload: name dài hơn 100 ký tự hoặc không phải chuỗi -> null; đúng 100 thì nhận", () => {
  const withName = (name: unknown) => {
    const p = validPayload();
    p.items = [{ key: "u:a", name: name as string, sig: null }];
    return parseScanPayload("#" + enc(p));
  };
  assert.ok(withName("x".repeat(100)));
  assert.equal(withName("x".repeat(101)), null);
  assert.equal(withName(123), null);
  assert.equal(withName(null), null);
  assert.equal(withName(undefined), null);
});

test("parseScanPayload: đúng 3000 item thì nhận, 3001 thì null", () => {
  const mk = (n: number) => ({
    ...validPayload(),
    items: Array.from({ length: n }, (_, i) => ({ key: `id:${100000 + i}`, name: `Người ${i}`, sig: null })),
  });
  const ok = parseScanPayload("#" + enc(mk(3000)));
  assert.ok(ok);
  assert.equal(ok.items.length, 3000);
  assert.equal(parseScanPayload("#" + enc(mk(3001))), null);
});

test("parseScanPayload: sig độ dài khác 72 -> null", () => {
  for (const len of [0, 1, 23, 24, 25, 48, 71, 73, 144]) {
    const p = validPayload();
    p.items = [{ key: "u:a", name: "A", sig: Array.from({ length: len }, () => 10) }];
    assert.equal(parseScanPayload("#" + enc(p)), null, `len=${len}`);
  }
});

test("parseScanPayload: sig chứa NaN, Infinity, âm, > 255, không phải số -> null", () => {
  const withSig = (mutate: (s: unknown[]) => void) => {
    const s: unknown[] = Array.from({ length: 72 }, () => 100);
    mutate(s);
    const p = validPayload();
    p.items = [{ key: "u:a", name: "A", sig: s as number[] }];
    return parseScanPayload("#" + enc(p));
  };
  // JSON.stringify biến NaN/Infinity thành null => phần tử không phải số hữu hạn
  assert.equal(withSig((s) => (s[3] = NaN)), null, "NaN");
  assert.equal(withSig((s) => (s[0] = Infinity)), null, "Infinity");
  assert.equal(withSig((s) => (s[71] = -Infinity)), null, "-Infinity");
  assert.equal(withSig((s) => (s[5] = -1)), null, "âm");
  assert.equal(withSig((s) => (s[5] = -0.0001)), null, "âm nhỏ");
  assert.equal(withSig((s) => (s[7] = 256)), null, "256");
  assert.equal(withSig((s) => (s[7] = 1000)), null, "1000");
  assert.equal(withSig((s) => (s[1] = "100")), null, "chuỗi");
  assert.equal(withSig((s) => (s[1] = null)), null, "null");
  assert.equal(withSig((s) => (s[1] = true)), null, "boolean");
  assert.ok(withSig(() => {}), "đối chứng: sig hợp lệ vẫn nhận");
});

test("parseScanPayload: sig không phải mảng và không phải null -> null", () => {
  for (const sig of ["abc", 5, {}, true]) {
    const p = validPayload();
    p.items = [{ key: "u:a", name: "A", sig: sig as unknown as number[] }];
    assert.equal(parseScanPayload("#" + enc(p)), null, JSON.stringify(sig));
  }
});

test("parseScanPayload: item không phải object -> null", () => {
  for (const item of [null, "x", 5, [], undefined]) {
    const p = { ...validPayload(), items: [item] };
    assert.equal(parseScanPayload("#" + enc(p)), null, JSON.stringify(item));
  }
});
