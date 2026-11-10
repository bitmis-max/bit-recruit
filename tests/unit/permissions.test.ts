import { test } from "node:test";
import assert from "node:assert/strict";
import { CLUB_PERMISSIONS, hasPermission, isClubPermission, permissionLabel } from "../../src/lib/admin/permissions.ts";

const CODES = ["events", "recruitment", "members", "mail", "facebook"];

test("CLUB_PERMISSIONS: đủ 5 mã theo hợp đồng, không trùng", () => {
  const codes = CLUB_PERMISSIONS.map((p) => p.code);
  assert.deepEqual([...codes].sort(), [...CODES].sort());
  assert.equal(new Set(codes).size, codes.length);
});

test("CLUB_PERMISSIONS: mỗi quyền có tên hiển thị không rỗng và không trùng", () => {
  const labels = CLUB_PERMISSIONS.map((p) => p.label);
  for (const label of labels) assert.ok(label.trim().length > 0);
  assert.equal(new Set(labels).size, labels.length);
  for (const p of CLUB_PERMISSIONS) assert.equal(permissionLabel(p.code), p.label);
});

test("isClubPermission: chỉ nhận đúng 5 mã", () => {
  for (const code of CODES) assert.equal(isClubPermission(code), true);
  for (const bad of ["", "admin", "EVENTS", "events ", null, undefined, 1, {}]) {
    assert.equal(isClubPermission(bad), false, `${String(bad)} không phải quyền`);
  }
});

test("hasPermission: owner có mọi quyền kể cả khi permissions rỗng", () => {
  for (const code of CODES) {
    assert.equal(hasPermission("owner", [], code as never), true);
    assert.equal(hasPermission("owner", null, code as never), true);
  }
});

test("hasPermission: admin chỉ có quyền được tick", () => {
  assert.equal(hasPermission("admin", ["events"], "events"), true);
  assert.equal(hasPermission("admin", ["events"], "recruitment"), false);
  assert.equal(hasPermission("admin", [], "events"), false);
  assert.equal(hasPermission("admin", null, "events"), false);
  assert.equal(hasPermission("admin", undefined, "events"), false);
});

test("hasPermission: member và vai trò lạ không có quyền nào, dù permissions có giá trị", () => {
  for (const role of ["member", "organizer", "", null, undefined]) {
    for (const code of CODES) assert.equal(hasPermission(role, CODES, code as never), false, `${String(role)}/${code}`);
  }
});
