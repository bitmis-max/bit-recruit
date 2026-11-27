import { test } from "node:test";
import assert from "node:assert/strict";
import { checkComposeBeforeSend, htmlHasContent } from "../../src/lib/email/template.ts";

test("htmlHasContent: bỏ thẻ rỗng và &nbsp;", () => {
  assert.equal(htmlHasContent("<p>&nbsp;</p><br>"), false);
  assert.equal(htmlHasContent("<p>Xin chào</p>"), true);
  assert.equal(htmlHasContent('<img src="a.png">'), true);
});

test("checkComposeBeforeSend: chặn tiêu đề/nội dung rỗng và quá lớn", () => {
  assert.match(checkComposeBeforeSend("  ", "<p>a</p>") ?? "", /Tiêu đề/);
  assert.match(checkComposeBeforeSend("a", "<p> </p>") ?? "", /Nội dung/);
  assert.match(checkComposeBeforeSend("x".repeat(301), "<p>a</p>") ?? "", /300/);
  assert.match(checkComposeBeforeSend("a", "x".repeat(500 * 1024 + 1)) ?? "", /500 KB/);
  assert.equal(checkComposeBeforeSend("Chào {{Name}}", "<p>Hi</p>"), null);
});

import { buildImageAttachment } from "../../src/lib/email/template.ts";

test("buildImageAttachment: luôn có contentType image/*", () => {
  const base = { name: "a", mimeType: "", source: "data:image/jpeg;base64,AAAA", isSvg: false };
  assert.equal(buildImageAttachment(base).contentType, "image/jpeg");
  assert.equal(buildImageAttachment({ ...base, name: "logo.webp", source: "AAAA" }).contentType, "image/webp");
  assert.equal(buildImageAttachment({ ...base, name: "noext", source: "AAAA" }).contentType, "image/png");
  assert.equal(buildImageAttachment({ ...base, mimeType: "image/gif" }).contentType, "image/gif");
  assert.equal(buildImageAttachment({ name: "x.svg", mimeType: "", source: "", isSvg: true, svgText: "<svg/>" }).contentType, "image/svg+xml");
});
