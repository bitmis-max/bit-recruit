// Chữ ký màu của vành tròn quanh avatar, dùng để đoán avatar có đang mang khung hay không.
// ringSignature và ringCoverage TỰ ĐÓNG GÓI (bookmarklet nhúng bằng `toString()`), nên không dùng hằng số bên ngoài.
// Vành bán kính tương đối [0.80, 0.98] chia 24 ô = 3 dải bán kính (trong -> ngoài) x 8 cung.
// Chỉ số ô = dải * 8 + cung.

// Ảnh vuông size x size (RGBA). Trả 72 số: trung bình R,G,B (làm tròn) của mỗi ô.
// Bỏ pixel alpha < 128; ô không có pixel cho 0,0,0.
export function ringSignature(rgba: ArrayLike<number>, size: number): number[] {
  const CELLS = 24;
  const sums: number[] = [];
  const counts: number[] = [];
  for (let k = 0; k < CELLS; k++) {
    sums.push(0, 0, 0);
    counts.push(0);
  }
  const center = size / 2;
  const twoPi = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const radius = Math.sqrt(dx * dx + dy * dy) / center;
      if (radius < 0.8 || radius > 0.98) continue;
      const offset = (y * size + x) * 4;
      if (rgba[offset + 3] < 128) continue;
      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += twoPi;
      let arc = Math.floor((angle / twoPi) * 8);
      if (arc > 7) arc = 7;
      let band = Math.floor((radius - 0.8) / 0.06);
      if (band > 2) band = 2;
      const cell = band * 8 + arc;
      sums[cell * 3] += rgba[offset];
      sums[cell * 3 + 1] += rgba[offset + 1];
      sums[cell * 3 + 2] += rgba[offset + 2];
      counts[cell] += 1;
    }
  }
  const result: number[] = [];
  for (let c = 0; c < CELLS; c++) {
    const n = counts[c];
    result.push(
      n ? Math.round(sums[c * 3] / n) : 0,
      n ? Math.round(sums[c * 3 + 1] / n) : 0,
      n ? Math.round(sums[c * 3 + 2] / n) : 0,
    );
  }
  return result;
}

// Trả 24 số 0-1: tỉ lệ pixel alpha >= 128 trong mỗi ô (dùng cho ảnh khung).
export function ringCoverage(rgba: ArrayLike<number>, size: number): number[] {
  const CELLS = 24;
  const opaque: number[] = [];
  const total: number[] = [];
  for (let k = 0; k < CELLS; k++) {
    opaque.push(0);
    total.push(0);
  }
  const center = size / 2;
  const twoPi = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const radius = Math.sqrt(dx * dx + dy * dy) / center;
      if (radius < 0.8 || radius > 0.98) continue;
      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += twoPi;
      let arc = Math.floor((angle / twoPi) * 8);
      if (arc > 7) arc = 7;
      let band = Math.floor((radius - 0.8) / 0.06);
      if (band > 2) band = 2;
      const cell = band * 8 + arc;
      total[cell] += 1;
      if (rgba[(y * size + x) * 4 + 3] >= 128) opaque[cell] += 1;
    }
  }
  const result: number[] = [];
  for (let c = 0; c < CELLS; c++) result.push(total[c] ? opaque[c] / total[c] : 0);
  return result;
}

// Trung bình khoảng cách Euclid RGB (0-441) theo từng ô, chỉ trên ô có coverage >= 0.6
// (không truyền coverage thì mọi ô). Ít hơn 4 ô dùng được thì trả Infinity.
export function signatureDistance(a: number[], b: number[], coverage?: number[]): number {
  const cells = Math.floor(Math.min(a.length, b.length) / 3);
  let used = 0;
  let total = 0;
  for (let i = 0; i < cells; i++) {
    if (coverage && !(coverage[i] >= 0.6)) continue;
    const dr = a[i * 3] - b[i * 3];
    const dg = a[i * 3 + 1] - b[i * 3 + 1];
    const db = a[i * 3 + 2] - b[i * 3 + 2];
    total += Math.sqrt(dr * dr + dg * dg + db * db);
    used++;
  }
  return used < 4 ? Infinity : total / used;
}

export const FRAME_MATCH_THRESHOLD = 60;
