import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApplicantRows } from "../../src/components/data/applicationRows.ts";

const app = (email: string | null, position_id = "p1") => ({ position_id, email, full_name: "An", phone: null, student_code: null, class_name: null });

test("buildApplicantRows: loại email trùng (không phân biệt hoa thường) và đơn không có email", () => {
  const result = buildApplicantRows(
    [app("A@x.com"), app("a@x.com ", "p2"), app(null), app("  "), app("b@x.com", "p2")],
    "Gen 17",
    new Map([["p1", "Ban Nội dung"], ["p2", "Ban Sự kiện"]]),
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.duplicates, 1);
  assert.equal(result.noEmail, 2);
  assert.equal(result.rows[0].position_name, "Ban Nội dung");
  assert.equal(result.rows[0].campaign_name, "Gen 17");
  assert.equal(result.rows[1].email, "b@x.com");
});
