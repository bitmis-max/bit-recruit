import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ringSignature,
  ringCoverage,
  signatureDistance,
  FRAME_MATCH_THRESHOLD,
} from "../../src/lib/facebook/frame-signature.ts";

const SIZE = 48;
type RGB = [number, number, number];
const RED: RGB = [255, 0, 0];
const BLUE: RGB = [0, 0, 255];
const GREEN: RGB = [0, 255, 0];
const WHITE: RGB = [255, 255, 255];

// Bán kính tương đối của pixel (tâm ảnh = 0, mép ảnh = 1).
function rel(x: number, y: number, size = SIZE): number {
  const c = size / 2;
  return Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
}

// Ảnh vuông RGBA: vành [0.78, 1.0) tô màu ring (phủ kín vùng 0.80–0.98 của hợp đồng), còn lại tô màu bg.
function makeImage(
  ring: RGB | ((x: number, y: number) => RGB),
  bg: RGB,
  opts: { size?: number; alpha?: (x: number, y: number, r: number) => number } = {},
): Uint8ClampedArray {
  const size = opts.size ?? SIZE;
  const img = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = rel(x, y, size);
      const inRing = r >= 0.78 && r < 1.0;
      const col = inRing ? (typeof ring === "function" ? ring(x, y) : ring) : bg;
      const i = (y * size + x) * 4;
      img[i] = col[0];
      img[i + 1] = col[1];
      img[i + 2] = col[2];
      img[i + 3] = opts.alpha ? opts.alpha(x, y, r) : 255;
    }
  }
  return img;
}

// PRNG cố định để test lặp lại được.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function addNoise(img: Uint8ClampedArray, amp: number, seed: number): Uint8ClampedArray {
  const rand = rng(seed);
  const out = new Uint8ClampedArray(img);
  for (let i = 0; i < out.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      out[i + c] = Math.max(0, Math.min(255, out[i + c] + Math.round((rand() * 2 - 1) * amp)));
    }
  }
  return out;
}

const near = (a: number[], b: number[], tol = 1) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);

// Ô thứ i (0..23): dải = floor(i / 8) (0 trong -> 2 ngoài), cung = i % 8; sig có 3 số mỗi ô.
const cell = (sig: ArrayLike<number>, i: number): RGB => [sig[i * 3], sig[i * 3 + 1], sig[i * 3 + 2]];
const cellNear = (sig: ArrayLike<number>, i: number, c: RGB, tol = 1) =>
  cell(sig, i).every((v, k) => Math.abs(v - c[k]) <= tol);
const isRed = (c: RGB) => c[0] > 240 && c[1] < 15 && c[2] < 15;
const isBlue = (c: RGB) => c[2] > 240 && c[1] < 15 && c[0] < 15;
const isEmpty = (c: RGB) => c[0] === 0 && c[1] === 0 && c[2] === 0;

// Ảnh khung (PNG nền trong suốt): chỉ pixel thỏa pred(x, y, r) là đục và mang màu `color`.
function makeFrame(size: number, color: RGB, pred: (x: number, y: number, r: number) => boolean): Uint8ClampedArray {
  const img = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!pred(x, y, rel(x, y, size))) continue;
      img.set([color[0], color[1], color[2], 255], (y * size + x) * 4);
    }
  }
  return img;
}

// Avatar (ảnh đục hoàn toàn): màu `base`, pixel thỏa pred thì mang màu `ring`.
function makeAvatar(
  size: number,
  base: RGB,
  ring: RGB,
  pred: (x: number, y: number, r: number) => boolean,
): Uint8ClampedArray {
  const img = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const col = pred(x, y, rel(x, y, size)) ? ring : base;
      img.set([col[0], col[1], col[2], 255], (y * size + x) * 4);
    }
  }
  return img;
}

const BIG = 192; // kích thước canvas đo khung theo hợp đồng
const countUsable = (cov: number[]) => cov.filter((c) => c >= 0.6).length;

// ---------------------------------------------------------------------------
test("FRAME_MATCH_THRESHOLD = 60", () => {
  assert.equal(FRAME_MATCH_THRESHOLD, 60);
});

// ---------------------------------------------------------------------------
// ringSignature: 72 số (3 dải x 8 cung x RGB)
// ---------------------------------------------------------------------------
test("ringSignature: luôn trả 72 số trong khoảng 0-255", () => {
  for (const size of [20, 48, 64, 192]) {
    const sig = ringSignature(makeImage(RED, GREEN, { size }), size);
    assert.equal(sig.length, 72, `size=${size}`);
    for (const v of sig) {
      assert.ok(Number.isFinite(v) && v >= 0 && v <= 255, `giá trị ${v}`);
    }
  }
});

test("ringSignature: vành một màu cho cả 24 ô cùng màu đó", () => {
  const red = ringSignature(makeImage(RED, GREEN), SIZE);
  assert.ok(near(red, Array.from({ length: 24 }, () => RED).flat()), `đỏ: ${red.join(",")}`);
  const blue = ringSignature(makeImage(BLUE, WHITE), SIZE);
  assert.ok(near(blue, Array.from({ length: 24 }, () => BLUE).flat()), `xanh: ${blue.join(",")}`);
});

test("ringSignature: thứ tự ô là dải trong -> ngoài, mỗi dải 8 cung", () => {
  const size = 96;
  const img = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = rel(x, y, size);
      const col = r < 0.86 ? RED : r < 0.92 ? GREEN : BLUE;
      img.set([col[0], col[1], col[2], 255], (y * size + x) * 4);
    }
  }
  const sig = ringSignature(img, size);
  assert.equal(sig.length, 72);
  for (let a = 0; a < 8; a++) {
    assert.ok(cellNear(sig, a, RED), `dải trong, cung ${a}: ${cell(sig, a)}`);
    assert.ok(cellNear(sig, 8 + a, GREEN), `dải giữa, cung ${a}: ${cell(sig, 8 + a)}`);
    assert.ok(cellNear(sig, 16 + a, BLUE), `dải ngoài, cung ${a}: ${cell(sig, 16 + a)}`);
  }
});

test("ringSignature: nền không ảnh hưởng (cùng vành, khác nền -> cùng chữ ký)", () => {
  const a = ringSignature(makeImage(RED, GREEN), SIZE);
  const b = ringSignature(makeImage(RED, BLUE), SIZE);
  const c = ringSignature(makeImage(RED, WHITE), SIZE);
  assert.ok(near(a, b));
  assert.ok(near(a, c));
  assert.ok(signatureDistance(a, c) < 1);
});

test("ringSignature: nhận cả Uint8ClampedArray và mảng số thường, kết quả như nhau", () => {
  const img = makeImage(RED, GREEN);
  assert.deepEqual(ringSignature(Array.from(img), SIZE), ringSignature(img, SIZE));
});

test("ringSignature: vành chia đôi đỏ/xanh cho cả ô đỏ lẫn ô xanh", () => {
  const sig = ringSignature(makeImage((x) => (x < SIZE / 2 ? RED : BLUE), WHITE), SIZE);
  let reds = 0;
  let blues = 0;
  for (let i = 0; i < 24; i++) {
    if (isRed(cell(sig, i))) reds++;
    if (isBlue(cell(sig, i))) blues++;
  }
  assert.ok(reds >= 9, `ô đỏ thuần: ${reds}`);
  assert.ok(blues >= 9, `ô xanh thuần: ${blues}`);
});

test("ringSignature: pixel alpha < 128 bị bỏ qua", () => {
  const clean = ringSignature(makeImage(RED, GREEN), SIZE);
  const poisoned = makeImage((x, y) => (x % 5 === 0 || y % 7 === 0 ? BLUE : RED), GREEN, {
    alpha: (x, y, r) => (r >= 0.78 && r < 1.0 && (x % 5 === 0 || y % 7 === 0) ? (x % 2 ? 0 : 127) : 255),
  });
  const sig = ringSignature(poisoned, SIZE);
  assert.ok(near(sig, clean), `chữ ký phải như ảnh sạch: ${sig.join(",")}`);
});

test("ringSignature: alpha = 128 thì còn được tính (ranh giới < 128)", () => {
  const clean = ringSignature(makeImage(RED, GREEN), SIZE);
  const counted = ringSignature(
    makeImage((x, y) => (x % 5 === 0 || y % 7 === 0 ? BLUE : RED), GREEN, { alpha: () => 128 }),
    SIZE,
  );
  assert.ok(signatureDistance(counted, clean) > 5, "pixel xanh alpha 128 phải kéo chữ ký lệch khỏi đỏ thuần");
});

test("ringSignature: ô không có pixel nào (trong suốt hết) -> 0,0,0", () => {
  const empty = ringSignature(makeImage(RED, GREEN, { alpha: () => 0 }), SIZE);
  assert.equal(empty.length, 72);
  assert.deepEqual(Array.from(empty), Array.from({ length: 72 }, () => 0));

  const rightHalf = ringSignature(makeImage(RED, GREEN, { alpha: (x) => (x >= SIZE / 2 ? 255 : 0) }), SIZE);
  let zero = 0;
  let red = 0;
  for (let i = 0; i < 24; i++) {
    if (isEmpty(cell(rightHalf, i))) zero++;
    if (isRed(cell(rightHalf, i))) red++;
  }
  assert.ok(zero >= 9, `ô trống: ${zero}`);
  assert.ok(red >= 9, `ô đỏ: ${red}`);
});

// ---------------------------------------------------------------------------
// ringCoverage: 24 số 0-1
// ---------------------------------------------------------------------------
test("ringCoverage: 24 số trong 0-1; ảnh đục hoàn toàn -> 1; trong suốt hoàn toàn -> 0", () => {
  const opaque = ringCoverage(makeImage(RED, GREEN), SIZE);
  assert.equal(opaque.length, 24);
  for (const c of opaque) assert.ok(c >= 0.99 && c <= 1, `c=${c}`);

  const clear = ringCoverage(makeImage(RED, GREEN, { alpha: () => 0 }), SIZE);
  assert.equal(clear.length, 24);
  for (const c of clear) assert.equal(c, 0);
});

test("ringCoverage: tính theo alpha >= 128 (127 không tính, 128 tính)", () => {
  for (const c of ringCoverage(makeImage(RED, GREEN, { alpha: () => 127 }), SIZE)) assert.equal(c, 0);
  for (const c of ringCoverage(makeImage(RED, GREEN, { alpha: () => 128 }), SIZE)) assert.ok(c >= 0.99);
});

test("ringCoverage: nửa ảnh trong suốt -> một nửa số ô ~1, một nửa ~0", () => {
  const cov = ringCoverage(makeImage(RED, GREEN, { alpha: (x) => (x >= SIZE / 2 ? 255 : 0) }), SIZE);
  assert.ok(cov.filter((c) => c >= 0.99).length >= 9);
  assert.ok(cov.filter((c) => c <= 0.01).length >= 9);
  for (const c of cov) assert.ok(c >= 0 && c <= 1);
});

const THIN = (_x: number, _y: number, r: number) => r >= 0.925 && r <= 0.975;
// Avatar 48x48 mang vành đó: pixel thu nhỏ phủ trọn dải ngoài [0.92, 0.98].
const AVATAR_RING = (_x: number, _y: number, r: number) => r >= 0.915;

test("ringCoverage: khung chỉ có vành mỏng ở dải ngoài -> chỉ 8 ô dải ngoài đạt >= 0.6", () => {
  const cov = ringCoverage(makeFrame(BIG, RED, THIN), BIG);
  assert.equal(cov.length, 24);
  for (let i = 16; i < 24; i++) assert.ok(cov[i] >= 0.6, `dải ngoài ô ${i}: ${cov[i]}`);
  for (let i = 0; i < 16; i++) assert.ok(cov[i] < 0.1, `dải trong/giữa ô ${i}: ${cov[i]}`);
  assert.equal(countUsable(cov), 8);
});

test("ringCoverage: dựng lại bằng new Function (tự đóng gói) vẫn cho kết quả y hệt", () => {
  const f = new Function("return " + ringCoverage.toString())();
  const frame = makeFrame(BIG, RED, THIN);
  assert.deepEqual(Array.from(f(frame, BIG)), ringCoverage(frame, BIG));
});

// ---------------------------------------------------------------------------
// signatureDistance
// ---------------------------------------------------------------------------
test("signatureDistance: đỏ vs xanh lớn hơn ngưỡng", () => {
  const red = ringSignature(makeImage(RED, GREEN), SIZE);
  const blue = ringSignature(makeImage(BLUE, GREEN), SIZE);
  const d = signatureDistance(red, blue);
  assert.ok(d > FRAME_MATCH_THRESHOLD, `d=${d}`);
  assert.ok(Math.abs(d - Math.hypot(255, 255)) < 2, `d=${d}`);
});

test("signatureDistance: đỏ vs đỏ + nhiễu nhỏ (±10) dưới ngưỡng", () => {
  const base = makeImage(RED, GREEN);
  const clean = ringSignature(base, SIZE);
  for (const seed of [1, 2, 3, 4, 5]) {
    const d = signatureDistance(clean, ringSignature(addNoise(base, 10, seed), SIZE));
    assert.ok(d < FRAME_MATCH_THRESHOLD, `seed=${seed} d=${d}`);
    assert.ok(d < 10, `nhiễu ±10 sau khi lấy trung bình phải rất nhỏ, d=${d}`);
  }
});

test("signatureDistance: đỏ + nhiễu vs xanh + nhiễu vẫn lớn hơn ngưỡng", () => {
  const r = ringSignature(addNoise(makeImage(RED, GREEN), 10, 7), SIZE);
  const b = ringSignature(addNoise(makeImage(BLUE, GREEN), 10, 8), SIZE);
  assert.ok(signatureDistance(r, b) > FRAME_MATCH_THRESHOLD);
});

test("signatureDistance: giống hệt -> 0, đối xứng, trung bình Euclid theo từng ô (72 số)", () => {
  const a = Array.from({ length: 72 }, (_, i) => (i * 11) % 256);
  const b = Array.from({ length: 72 }, (_, i) => (i * 17 + 5) % 256);
  assert.equal(signatureDistance(a, a), 0);
  assert.equal(signatureDistance(a, b), signatureDistance(b, a));

  const zeros = Array.from({ length: 72 }, () => 0);
  const cell345 = Array.from({ length: 72 }, (_, i) => [3, 4, 0][i % 3]); // mỗi ô lệch (3,4,0) -> 5
  assert.ok(Math.abs(signatureDistance(zeros, cell345) - 5) < 1e-9);

  const oneCell = zeros.slice();
  oneCell[0] = oneCell[1] = oneCell[2] = 255;
  assert.ok(Math.abs(signatureDistance(zeros, oneCell) - (Math.sqrt(3) * 255) / 24) < 1e-6);

  const white = Array.from({ length: 72 }, () => 255);
  const max = signatureDistance(zeros, white);
  assert.ok(max > 441 && max < 442, `max=${max}`);
});

test("signatureDistance: coverage toàn 1 cho cùng kết quả như không truyền coverage", () => {
  const a = Array.from({ length: 72 }, (_, i) => (i * 11) % 256);
  const b = Array.from({ length: 72 }, (_, i) => (i * 17 + 5) % 256);
  const ones = Array.from({ length: 24 }, () => 1);
  assert.ok(Math.abs(signatureDistance(a, b, ones) - signatureDistance(a, b)) < 1e-9);
});

test("signatureDistance: chỉ so các ô coverage >= 0.6 (0.6 tính, 0.59 loại)", () => {
  const a = Array.from({ length: 72 }, () => 100);
  const b = a.slice();
  b[0] = 200; // chỉ ô 0 lệch (100,0,0)
  const cov: number[] = Array.from({ length: 24 }, (_, i) => (i >= 1 && i <= 4 ? 1 : 0)); // ô 1-4 dùng được
  cov[0] = 0.59;
  assert.equal(signatureDistance(a, b, cov), 0, "ô 0 (coverage 0.59) bị loại");
  cov[0] = 0.6;
  assert.ok(Math.abs(signatureDistance(a, b, cov) - 100 / 5) < 1e-9, "ô 0 (coverage 0.6) được tính, chia cho 5 ô");
});

test("signatureDistance: ít hơn 4 ô dùng được -> Infinity; đúng 4 ô thì hữu hạn", () => {
  const a = Array.from({ length: 72 }, () => 10);
  const b = Array.from({ length: 72 }, () => 20);
  const mk = (n: number) => Array.from({ length: 24 }, (_, i) => (i < n ? 1 : 0));
  assert.equal(signatureDistance(a, b, mk(0)), Infinity);
  assert.equal(signatureDistance(a, b, mk(1)), Infinity);
  assert.equal(signatureDistance(a, b, mk(3)), Infinity);
  assert.ok(Number.isFinite(signatureDistance(a, b, mk(4))));
  assert.ok(Number.isFinite(signatureDistance(a, b, mk(24))));
  const almost = Array.from({ length: 24 }, (_, i) => (i < 3 ? 1 : 0.59)); // nhiều ô sát ngưỡng nhưng < 0.6
  assert.equal(signatureDistance(a, b, almost), Infinity);
});

// ---------------------------------------------------------------------------
// Khung thật: vành mỏng, banner một phía
// ---------------------------------------------------------------------------
test("khung vành mỏng dải ngoài: avatar mang đúng vành đó (phần trong là ảnh khác màu) khớp khi dùng coverage", () => {
  const frame = makeFrame(BIG, RED, THIN);
  const frameSig = ringSignature(frame, BIG);
  const cov = ringCoverage(frame, BIG);
  assert.equal(countUsable(cov), 8);

  // avatar 48x48: cùng vành đỏ ở dải ngoài, phần trong là ảnh màu xanh lá
  const avatarSig = ringSignature(makeAvatar(SIZE, GREEN, RED, AVATAR_RING), SIZE);
  const withCov = signatureDistance(frameSig, avatarSig, cov);
  assert.ok(withCov < FRAME_MATCH_THRESHOLD, `có coverage: d=${withCov}`);

  // không coverage: 16 ô trống của khung (0,0,0) lệch với ảnh xanh lá -> trước đây sẽ fail
  const withoutCov = signatureDistance(frameSig, avatarSig);
  assert.ok(withoutCov > FRAME_MATCH_THRESHOLD, `không coverage: d=${withoutCov}`);
});

test("khung vành mỏng dải ngoài: avatar không có khung / vành màu khác -> không khớp; nhiễu nhỏ vẫn khớp", () => {
  const frame = makeFrame(BIG, RED, THIN);
  const frameSig = ringSignature(frame, BIG);
  const cov = ringCoverage(frame, BIG);

  const plain = ringSignature(makeAvatar(SIZE, GREEN, GREEN, AVATAR_RING), SIZE); // ảnh thường, không vành
  assert.ok(signatureDistance(frameSig, plain, cov) > FRAME_MATCH_THRESHOLD);

  const blueRing = ringSignature(makeAvatar(SIZE, GREEN, BLUE, AVATAR_RING), SIZE);
  assert.ok(signatureDistance(frameSig, blueRing, cov) > FRAME_MATCH_THRESHOLD);

  const noisy = ringSignature(addNoise(makeAvatar(SIZE, GREEN, RED, AVATAR_RING), 10, 3), SIZE);
  assert.ok(signatureDistance(frameSig, noisy, cov) < FRAME_MATCH_THRESHOLD, "nhiễu nhỏ vẫn khớp");
});

test("khung chỉ có banner một phía (vài ô) vẫn so được nếu >= 4 ô", () => {
  // banner đỏ ở nửa dưới, dải giữa + dải ngoài
  const BANNER = (_x: number, y: number, r: number) => y > BIG / 2 && r >= 0.865 && r <= 0.975;
  const frame = makeFrame(BIG, RED, BANNER);
  const frameSig = ringSignature(frame, BIG);
  const cov = ringCoverage(frame, BIG);
  const usable = countUsable(cov);
  assert.ok(usable >= 4 && usable <= 12, `ô dùng được: ${usable}`);

  const bannerAvatar = makeAvatar(SIZE, GREEN, RED, (_x, y, r) => y >= SIZE / 2 && r >= 0.86 && r <= 0.98);
  const d = signatureDistance(frameSig, ringSignature(bannerAvatar, SIZE), cov);
  assert.ok(Number.isFinite(d));
  assert.ok(d < FRAME_MATCH_THRESHOLD, `avatar có banner: d=${d}`);

  const plain = makeAvatar(SIZE, GREEN, GREEN, () => false);
  assert.ok(signatureDistance(frameSig, ringSignature(plain, SIZE), cov) > FRAME_MATCH_THRESHOLD);
});

test("khung chỉ có vài pixel (không ô nào đủ 0.6) -> không đoán: Infinity", () => {
  // mảng nhỏ ở bên phải, dải ngoài: chiếm rất ít của mỗi cung
  const PATCH = (x: number, y: number, r: number) =>
    r >= 0.925 && r <= 0.975 && x > BIG / 2 && Math.abs(y - BIG / 2) < BIG * 0.04;
  const frame = makeFrame(BIG, RED, PATCH);
  const cov = ringCoverage(frame, BIG);
  assert.ok(countUsable(cov) < 4, `ô dùng được: ${countUsable(cov)}`);
  const avatar = ringSignature(makeAvatar(SIZE, GREEN, RED, AVATAR_RING), SIZE);
  assert.equal(signatureDistance(ringSignature(frame, BIG), avatar, cov), Infinity);
});
