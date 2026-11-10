import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../../src/lib/auth/safe-next.ts";

test("safeNextPath: chấp nhận đường dẫn nội bộ hợp lệ", () => {
  for (const p of ["/", "/me", "/me/x", "/manage-clubs", "/manage-clubs/terms?x=1"]) {
    assert.equal(safeNextPath(p), p, `${p} phải được giữ nguyên`);
  }
});

test("safeNextPath: trả fallback cho giá trị nguy hiểm hoặc không biết", () => {
  const bad: Array<string | null | undefined> = [
    null, undefined, "", "//evil.com", "/\evil.com", "/\t/evil.com", "/\n/evil.com",
    "https://evil.com", "/meet", "/manage-clubsX", "/login",
  ];
  for (const p of bad) assert.equal(safeNextPath(p), "/manage-clubs", `${JSON.stringify(p)} phải bị thay bằng fallback`);
});

test("safeNextPath: fallback tùy chỉnh được dùng", () => {
  assert.equal(safeNextPath(null, "/me"), "/me");
  assert.equal(safeNextPath("//evil.com", "/"), "/");
  assert.equal(safeNextPath("/me", "/"), "/me");
});
