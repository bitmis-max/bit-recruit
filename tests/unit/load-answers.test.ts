import { test } from "node:test";
import assert from "node:assert/strict";
import { chunk, fetchAllPages, loadApplicationAnswers } from "../../src/components/admin/recruitment/loadAnswers.ts";

test("chunk: chia đúng kích thước lô", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 50), []);
});

test("fetchAllPages: đọc tới khi trang cuối không đầy, dừng khi lỗi", async () => {
  const calls: Array<[number, number]> = [];
  const result = await fetchAllPages<number>(async (from, to) => {
    calls.push([from, to]);
    return { data: from < 20 ? Array.from({ length: 10 }, (_, i) => from + i) : [1, 2, 3], error: null };
  }, 10);
  assert.equal(result.data.length, 23);
  assert.deepEqual(calls, [[0, 9], [10, 19], [20, 29]]);

  const failed = await fetchAllPages<number>(async (from) => from === 0 ? { data: [1], error: null } : { data: null, error: { message: "x" } }, 1);
  assert.ok(failed.error);
});

// Client giả: ghi lại các truy vấn application_answers để kiểm lô và phân trang.
function fakeClient(total: number, perApplication: number) {
  const queries: Array<{ ids: string[]; range: [number, number] }> = [];
  const all = Array.from({ length: total }, (_, a) => Array.from({ length: perApplication }, (_, q) => ({ application_id: `a${a}`, question_id: `q${q}`, answer_text: "x", answer_json: null }))).flat();
  const client = {
    from(table: string) {
      const state: { ids: string[]; range: [number, number] } = { ids: [], range: [0, 0] };
      const builder = {
        select: () => builder,
        order: () => builder,
        in(_col: string, ids: string[]) { state.ids = ids; return builder; },
        range(from: number, to: number) {
          state.range = [from, to];
          queries.push(state);
          const rows = all.filter((row) => state.ids.includes(row.application_id)).slice(from, to + 1);
          return Promise.resolve({ data: rows, error: null });
        },
        then(resolve: (value: unknown) => void) {
          // truy vấn form_questions (không có range)
          resolve({ data: state.ids.map((id) => ({ id, question_text: `Câu ${id}` })), error: null });
        },
      };
      assert.ok(table === "application_answers" || table === "form_questions");
      return builder;
    },
  };
  return { client, queries };
}

test("loadApplicationAnswers: lô ≤ 50 đơn và không cắt ở 1000 dòng", async () => {
  // 50 đơn x 30 câu = 1500 dòng trong một lô -> phải đọc 2 trang
  const { client, queries } = fakeClient(120, 30);
  const ids = Array.from({ length: 120 }, (_, i) => `a${i}`);
  const { answers, error } = await loadApplicationAnswers(client as never, ids);
  assert.equal(error, null);
  assert.equal(answers.length, 120 * 30);
  assert.ok(queries.every((q) => q.ids.length <= 50));
  assert.ok(queries.some((q) => q.range[0] === 1000));
  assert.equal(answers[0].question_text, "Câu q0");
});
