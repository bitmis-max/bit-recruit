import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseCsvText, parseWorkbook } from "../../src/lib/files/parse.ts";

test("CSV một cột không báo lỗi", () => {
  const result = parseCsvText("email\na@b.com\nc@d.com\n");
  assert.deepEqual(result.columns, ["email"]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].email, "c@d.com");
});

test("CSV nhiều cột, có BOM, giữ số 0 đầu", () => {
  const result = parseCsvText("﻿email,phone\na@b.com,0912345678\n");
  assert.deepEqual(result.columns, ["email", "phone"]);
  assert.equal(result.rows[0].phone, "0912345678");
});

test("CSV dòng lệch cột chỉ cảnh báo, không chặn", () => {
  const result = parseCsvText("email,name\na@b.com,An\nc@d.com\n");
  assert.equal(result.rows.length, 2);
  assert.ok(result.warnings && /không khớp/.test(result.warnings[0]));
});

test("CSV hỏng dấu ngoặc kép thì báo lỗi tiếng Việt", () => {
  assert.throws(() => parseCsvText('email,name\na@b.com,"An\n'), /File CSV bị lỗi định dạng/);
});

test("XLSX giữ số 0 đầu và chữ hiển thị", () => {
  const ws = XLSX.utils.aoa_to_sheet([["email", "phone"], ["a@b.com", "0912345678"]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "S");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const result = parseWorkbook(buffer);
  assert.equal(result.rows[0].phone, "0912345678");
  assert.deepEqual(result.columns, ["email", "phone"]);
});
