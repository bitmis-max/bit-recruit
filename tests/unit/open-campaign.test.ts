import { test } from "node:test";
import assert from "node:assert/strict";
import { pickOpenCampaign } from "../../src/components/home/openCampaign.ts";

const now = new Date("2026-11-26T12:00:00Z");

test("pickOpenCampaign: không có đợt nào thì đóng", () => {
  assert.deepEqual(pickOpenCampaign([], now), { open: false, deadline: null });
  assert.deepEqual(pickOpenCampaign(null, now), { open: false, deadline: null });
});

test("pickOpenCampaign: đợt còn hạn thì mở, kèm hạn", () => {
  assert.deepEqual(pickOpenCampaign([{ end_date: "2026-12-01T00:00:00Z" }], now), { open: true, deadline: "2026-12-01T00:00:00Z" });
});

test("pickOpenCampaign: đợt không đặt hạn vẫn là đang mở", () => {
  assert.deepEqual(pickOpenCampaign([{ end_date: null }], now), { open: true, deadline: null });
});

test("pickOpenCampaign: bỏ qua đợt đã quá hạn nhưng chưa ai đóng", () => {
  assert.deepEqual(pickOpenCampaign([{ end_date: "2026-11-20T00:00:00Z" }], now), { open: false, deadline: null });
  assert.deepEqual(
    pickOpenCampaign([{ end_date: "2026-11-20T00:00:00Z" }, { end_date: "2026-12-05T00:00:00Z" }], now),
    { open: true, deadline: "2026-12-05T00:00:00Z" },
  );
});
