import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTeamIds, orderTeamIds, readTeamIds, sameTeamSet, teamsChanged, teamsErrorMessage } from "../../src/lib/admin/member-teams.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

test("normalizeTeamIds: bỏ trùng, giữ thứ tự, viết thường", () => {
  assert.deepEqual(normalizeTeamIds([B, A, B, A.toUpperCase()]), [B, A]);
  assert.deepEqual(normalizeTeamIds([]), []);
});

test("normalizeTeamIds: từ chối thứ không phải mảng chuỗi UUID", () => {
  for (const bad of [null, undefined, "x", A, {}, [1], ["abc"], [A, null], [A, ""]]) {
    assert.equal(normalizeTeamIds(bad), null, JSON.stringify(bad));
  }
});

test("readTeamIds: team_ids thắng team_id; chỉ team_id thì đường cũ; không có thì undefined", () => {
  assert.deepEqual(readTeamIds({ team_ids: [A, B], team_id: C }), [A, B]);
  assert.deepEqual(readTeamIds({ team_ids: [] , team_id: C }), []);
  assert.deepEqual(readTeamIds({ team_id: C }), [C]);
  assert.equal(readTeamIds({ team_id: "" }), undefined); // đường cũ: rỗng = bỏ qua, không xóa sạch ban
  assert.equal(readTeamIds({ team_id: null }), undefined);
  assert.equal(readTeamIds({ team_id: 5 }), null);
  assert.equal(readTeamIds({ team_id: "khong-phai-uuid" }), null);
  assert.equal(readTeamIds({ team_ids: "x" }), null);
  assert.equal(readTeamIds({}), undefined);
  assert.equal(readTeamIds(null), undefined);
});

test("sameTeamSet: không tính thứ tự", () => {
  assert.equal(sameTeamSet([A, B], [B, A]), true);
  assert.equal(sameTeamSet([A], [A, B]), false);
  assert.equal(sameTeamSet([A, B], [A, C]), false);
});

test("teamsChanged: khác tập hoặc khác ban chính", () => {
  assert.equal(teamsChanged([A, B], A, [A, B]), false);
  assert.equal(teamsChanged([A, B], A, [B, A]), true, "cùng tập nhưng ban chính đổi");
  assert.equal(teamsChanged([A], A, [A, B]), true);
  assert.equal(teamsChanged([A, B], A, [A]), true);
  assert.equal(teamsChanged([], null, []), false);
  assert.equal(teamsChanged([A], A, []), true);
  assert.equal(teamsChanged([], null, [A]), true);
});

test("orderTeamIds: ban chính đầu, còn lại theo created_at", () => {
  const rows = [
    { team_id: C, created_at: "2026-03-01T00:00:00Z" },
    { team_id: A, created_at: "2026-01-01T00:00:00Z" },
    { team_id: B, created_at: "2026-02-01T00:00:00Z" },
  ];
  assert.deepEqual(orderTeamIds(C, rows), [C, A, B]);
  assert.deepEqual(orderTeamIds(null, rows), [A, B, C]);
  assert.deepEqual(orderTeamIds(B, []), [B], "ban chính luôn có mặt");
  assert.deepEqual(orderTeamIds(null, []), []);
});

test("teamsErrorMessage: giữ message tiếng Việt, còn lại dùng câu mặc định", () => {
  assert.equal(teamsErrorMessage("Có ban không thuộc CLB của thành viên này"), "Có ban không thuộc CLB của thành viên này");
  assert.equal(teamsErrorMessage("permission denied for function"), "Không lưu được ban của thành viên.");
  assert.equal(teamsErrorMessage(undefined), "Không lưu được ban của thành viên.");
});
