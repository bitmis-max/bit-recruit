import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyError } from "../../src/lib/ui/friendly-error.ts";

const FB = "Không lưu được.";

test("friendlyError: giữ thông báo tiếng Việt của hệ thống", () => {
  assert.equal(friendlyError({ message: "Ban phải thuộc CLB đang chọn." }, FB), "Ban phải thuộc CLB đang chọn.");
});

test("friendlyError: đổi lỗi Postgres/Supabase sang tiếng Việt", () => {
  assert.equal(friendlyError({ code: "23505", message: "duplicate key value violates unique constraint \"x\"" }, FB), "Dữ liệu bị trùng với một mục đã có.");
  assert.match(friendlyError({ code: "23503", message: "update or delete violates foreign key constraint" }, FB), /còn dữ liệu liên quan/);
  assert.equal(friendlyError({ message: "new row violates row-level security policy for table \"teams\"" }, FB), "Bạn không có quyền thực hiện thao tác này.");
  assert.equal(friendlyError({ message: "Invalid login credentials" }, FB), "Email hoặc mật khẩu không đúng.");
  assert.match(friendlyError(new TypeError("Failed to fetch"), FB), /Không kết nối được/);
});

test("friendlyError: lỗi ràng buộc có dữ liệu tiếng Việt vẫn không lộ chi tiết", () => {
  const leak = { code: "23505", message: "duplicate key value violates unique constraint \"form_questions_interview_availability_unique\" Key (form_id, lower(btrim(question_text)))=(1, thời gian có thể tham gia phỏng vấn) already exists." };
  assert.equal(friendlyError(leak, FB), "Dữ liệu bị trùng với một mục đã có.");
  assert.equal(friendlyError({ code: "P0001", message: "Email này đã nộp đơn cho vị trí này." }, FB), "Email này đã nộp đơn cho vị trí này.");
  assert.equal(friendlyError({ code: "42501", message: "không có quyền: bảng thành viên" }, FB), "Bạn không có quyền thực hiện thao tác này.");
});

test("friendlyError: lỗi lạ hoặc rỗng thì dùng câu dự phòng, không lộ chi tiết", () => {
  assert.equal(friendlyError({ message: "column \"foo\" of relation \"bar\" does not exist" }, FB), FB);
  assert.equal(friendlyError(null, FB), FB);
  assert.equal(friendlyError("boom", FB), FB);
});
