import { test } from "node:test";
import assert from "node:assert/strict";
import { pickReminders, buildReminderEmail, isPastDeadline } from "../../src/lib/tasks/reminders.ts";
import type { ReminderRow } from "../../src/lib/tasks/reminders.ts";

const NOW = new Date("2026-11-11T01:00:00.000Z");
const H = 3600_000;
const DAY = 24 * H;

let seq = 0;
function row(dueOffsetMs: number, over: Partial<ReminderRow> = {}): ReminderRow {
  seq += 1;
  return {
    taskId: `task-${seq}`,
    memberId: `member-${seq}`,
    title: `Việc ${seq}`,
    dueAt: new Date(NOW.getTime() + dueOffsetMs).toISOString(),
    email: `m${seq}@bit.test`,
    fullName: `Thành viên ${seq}`,
    remindedBeforeAt: null,
    remindedOverdueAt: null,
    ...over,
  };
}

const ids = (rs: ReminderRow[]) => rs.map((r) => r.taskId);

// ---------------------------------------------------------------------------
// pickReminders
// ---------------------------------------------------------------------------
test("pickReminders: biên 36 giờ — đúng 36h thuộc before, thêm 1ms thì không", () => {
  const exact = row(36 * H);
  const over = row(36 * H + 1);
  const inside = row(36 * H - 1);
  const { before, overdue } = pickReminders([exact, over, inside], NOW);
  assert.deepEqual(ids(before).sort(), [exact.taskId, inside.taskId].sort());
  assert.equal(overdue.length, 0);
});

test("pickReminders: dueAt = now thuộc overdue, không thuộc before", () => {
  const r = row(0);
  const { before, overdue } = pickReminders([r], NOW);
  assert.deepEqual(ids(overdue), [r.taskId]);
  assert.equal(before.length, 0);
});

test("pickReminders: dueAt = now + 1ms thuộc before (chưa quá hạn)", () => {
  const r = row(1);
  const { before, overdue } = pickReminders([r], NOW);
  assert.deepEqual(ids(before), [r.taskId]);
  assert.equal(overdue.length, 0);
});

test("pickReminders: biên 7 ngày — đúng now-7d thì KHÔNG overdue, now-7d+1ms thì có", () => {
  const exact = row(-7 * DAY);
  const older = row(-7 * DAY - 1);
  const justInside = row(-7 * DAY + 1);
  const { before, overdue } = pickReminders([exact, older, justInside], NOW);
  assert.deepEqual(ids(overdue), [justInside.taskId]);
  assert.equal(before.length, 0);
});

test("pickReminders: việc quá hạn 30 ngày không bị nhắc", () => {
  const { before, overdue } = pickReminders([row(-30 * DAY)], NOW);
  assert.equal(before.length, 0);
  assert.equal(overdue.length, 0);
});

test("pickReminders: đã nhắc trước hạn thì bỏ khỏi before (nhưng không ảnh hưởng overdue)", () => {
  const stamp = NOW.toISOString();
  const beforeDone = row(10 * H, { remindedBeforeAt: stamp });
  const overdueRow = row(-1 * H, { remindedBeforeAt: stamp }); // đã nhắc trước, chưa nhắc quá hạn
  const { before, overdue } = pickReminders([beforeDone, overdueRow], NOW);
  assert.equal(before.length, 0);
  assert.deepEqual(ids(overdue), [overdueRow.taskId]);
});

test("pickReminders: đã nhắc quá hạn thì bỏ khỏi overdue (nhưng không ảnh hưởng before)", () => {
  const stamp = NOW.toISOString();
  const overdueDone = row(-1 * H, { remindedOverdueAt: stamp });
  const beforeRow = row(10 * H, { remindedOverdueAt: stamp });
  const { before, overdue } = pickReminders([overdueDone, beforeRow], NOW);
  assert.equal(overdue.length, 0);
  assert.deepEqual(ids(before), [beforeRow.taskId]);
});

test("pickReminders: email null thì bỏ ở cả hai nhóm", () => {
  const { before, overdue } = pickReminders(
    [row(10 * H, { email: null }), row(-1 * H, { email: null })],
    NOW,
  );
  assert.equal(before.length, 0);
  assert.equal(overdue.length, 0);
});

test("pickReminders: hạn xa hơn 36 giờ không được nhắc; danh sách rỗng trả hai mảng rỗng", () => {
  const far = pickReminders([row(5 * DAY)], NOW);
  assert.equal(far.before.length, 0);
  assert.equal(far.overdue.length, 0);
  const empty = pickReminders([], NOW);
  assert.deepEqual(empty, { before: [], overdue: [] });
});

test("pickReminders: trộn nhiều dòng phân nhóm đúng", () => {
  const b1 = row(2 * H);
  const b2 = row(30 * H);
  const o1 = row(-2 * H);
  const o2 = row(-6 * DAY);
  const skip = row(-8 * DAY);
  const { before, overdue } = pickReminders([o1, b1, skip, o2, b2], NOW);
  assert.deepEqual(ids(before).sort(), [b1.taskId, b2.taskId].sort());
  assert.deepEqual(ids(overdue).sort(), [o1.taskId, o2.taskId].sort());
});

// ---------------------------------------------------------------------------
// buildReminderEmail
// ---------------------------------------------------------------------------
const BASE = "https://bit.example.com";

test("buildReminderEmail: escape HTML trong title, fullName, clubName", () => {
  const evil = "<script>alert(1)</script>";
  const b = row(5 * H, { title: `Việc ${evil}` });
  const o = row(-1 * H, { title: `Quá hạn <img src=x onerror=alert(1)>` });
  const { html } = buildReminderEmail(`Tên ${evil}`, `CLB <b>&</b> ${evil}`, [b], [o], BASE);
  assert.ok(!html.includes("<script>"), "không được còn thẻ <script> thô");
  assert.ok(!html.includes("<img"), "không được còn thẻ <img> thô");
  assert.ok(!html.includes("<b>"), "không được còn thẻ <b> thô");
  assert.ok(html.includes("&lt;script&gt;"), "phải có dạng đã escape");
  assert.ok(html.includes("&amp;"), "ký tự & phải được escape");
});

test("buildReminderEmail: có link /me và subject không rỗng", () => {
  const { subject, html } = buildReminderEmail("An", "CLB BIT", [row(5 * H)], [], BASE);
  assert.ok(subject.trim().length > 0);
  assert.ok(html.includes(`${BASE}/me`), "html phải chứa link tới /me");
});

test("buildReminderEmail: liệt kê cả việc sắp tới hạn và quá hạn", () => {
  const b = row(5 * H, { title: "Việc sắp tới hạn AAA" });
  const o = row(-1 * H, { title: "Việc quá hạn BBB" });
  const { html } = buildReminderEmail("An", "CLB BIT", [b], [o], BASE);
  assert.ok(html.includes("Việc sắp tới hạn AAA"));
  assert.ok(html.includes("Việc quá hạn BBB"));
});

test("buildReminderEmail: chỉ có một nhóm vẫn dựng được mail", () => {
  const onlyBefore = buildReminderEmail("An", "CLB BIT", [row(5 * H, { title: "Chỉ sắp tới" })], [], BASE);
  assert.ok(onlyBefore.html.includes("Chỉ sắp tới"));
  assert.ok(onlyBefore.subject.trim().length > 0);
  const onlyOverdue = buildReminderEmail("An", "CLB BIT", [], [row(-1 * H, { title: "Chỉ quá hạn" })], BASE);
  assert.ok(onlyOverdue.html.includes("Chỉ quá hạn"));
  assert.ok(onlyOverdue.subject.trim().length > 0);
});

test("isPastDeadline: không đặt hạn thì không bao giờ quá hạn; quá hạn khi now > deadline", () => {
  assert.equal(isPastDeadline(undefined, 9e15), false);
  assert.equal(isPastDeadline(1000, 999), false);
  assert.equal(isPastDeadline(1000, 1000), false);
  assert.equal(isPastDeadline(1000, 1001), true);
});
