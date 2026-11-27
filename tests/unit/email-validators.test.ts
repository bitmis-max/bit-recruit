import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFromHeader, checkEmailLimits, parseSingleRecipient } from "../../src/lib/email/validators.ts";

test("parseSingleRecipient: nhận đúng một địa chỉ", () => {
  assert.equal(parseSingleRecipient("  a@b.com "), "a@b.com");
  assert.equal(parseSingleRecipient("a@b.com, c@d.com"), null);
  assert.equal(parseSingleRecipient("a@b.com;c@d.com"), null);
  assert.equal(parseSingleRecipient("Tên <a@b.com>"), null);
  assert.equal(parseSingleRecipient('"a"@b.com'), null);
  assert.equal(parseSingleRecipient("a b@c.com"), null);
  assert.equal(parseSingleRecipient("a@b.com\r\nBcc: x@y.com"), null);
  assert.equal(parseSingleRecipient(""), null);
  assert.equal(parseSingleRecipient(undefined), null);
  assert.equal(parseSingleRecipient(42), null);
});

test("buildFromHeader: bỏ địa chỉ client, giữ tên hiển thị", () => {
  assert.equal(buildFromHeader('"CLB Bit" <evil@x.com>', "me@g.com"), '"CLB Bit" <me@g.com>');
  assert.equal(buildFromHeader("CLB Bit <evil@x.com>", "me@g.com"), '"CLB Bit" <me@g.com>');
  assert.equal(buildFromHeader("evil@x.com", "me@g.com"), "me@g.com");
  assert.equal(buildFromHeader(undefined, "me@g.com"), "me@g.com");
  assert.equal(buildFromHeader("<evil@x.com>", "me@g.com"), "me@g.com");
});

test("buildFromHeader: làm sạch xuống dòng, nháy và dấu gạch chéo", () => {
  const header = buildFromHeader('Ten\r\nBcc: x@y.com "q" \\ <a@b.com>', "me@g.com");
  assert.ok(!/[\r\n]/.test(header));
  assert.ok(header.endsWith("<me@g.com>"));
  assert.ok(header.includes('\\"q\\"'));
  assert.ok(header.includes("\\\\"));
});

test("buildFromHeader: tên quá dài bị cắt", () => {
  const header = buildFromHeader(`${"a".repeat(500)} <x@y.com>`, "me@g.com");
  assert.ok(header.length < 130);
});

test("checkEmailLimits: tiêu đề, nội dung, ảnh", () => {
  const ok = { subject: "Hi", html: "<p>x</p>" };
  assert.equal(checkEmailLimits(ok), null);
  assert.match(checkEmailLimits({ ...ok, subject: "a".repeat(301) }) ?? "", /Tiêu đề/);
  assert.equal(checkEmailLimits({ ...ok, subject: "a".repeat(300) }), null);
  assert.match(checkEmailLimits({ ...ok, html: "a".repeat(500 * 1024 + 1) }) ?? "", /Nội dung/);
  const image = { filename: "a.png", content: "AAAA", contentType: "image/png" };
  assert.equal(checkEmailLimits({ ...ok, imageAttachment: image }), null);
  assert.match(checkEmailLimits({ ...ok, imageAttachment: { ...image, content: "a".repeat(7 * 1024 * 1024 + 1) } }) ?? "", /7 MB/);
  assert.match(checkEmailLimits({ ...ok, imageAttachment: { ...image, filename: "a".repeat(201) } }) ?? "", /Tên tệp/);
  assert.match(checkEmailLimits({ ...ok, imageAttachment: { ...image, contentType: "application/pdf" } }) ?? "", /ảnh/);
  assert.match(checkEmailLimits({ ...ok, imageAttachment: { ...image, contentType: undefined } }) ?? "", /ảnh/);
  assert.match(checkEmailLimits({ ...ok, imageAttachment: { filename: 1, content: 2 } }) ?? "", /không hợp lệ/);
});
