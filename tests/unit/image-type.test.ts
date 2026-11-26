import { test } from "node:test";
import assert from "node:assert/strict";
import { detectImageType } from "../../src/lib/security/image-type.ts";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

test("detectImageType: nhận JPG, PNG, WebP theo magic bytes", () => {
  assert.equal(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0))?.extension, "jpg");
  assert.equal(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))?.contentType, "image/png");
  assert.equal(detectImageType(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP"), 0))?.contentType, "image/webp");
});

test("detectImageType: từ chối HTML, SVG, GIF, RIFF không phải WebP, dữ liệu ngắn/rỗng", () => {
  assert.equal(detectImageType(new TextEncoder().encode("<html><script>alert(1)</script>")), null);
  assert.equal(detectImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(detectImageType(bytes(...ascii("GIF89a"))), null);
  assert.equal(detectImageType(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE"))), null);
  assert.equal(detectImageType(bytes(0xff, 0xd8)), null);
  assert.equal(detectImageType(bytes()), null);
});
