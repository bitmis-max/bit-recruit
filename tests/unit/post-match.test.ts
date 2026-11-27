import { test } from "node:test";
import assert from "node:assert/strict";
import { samePost } from "../../src/components/admin/scan/postMatch.ts";

test("samePost: cùng bài dù khác query hoặc dấu / cuối", () => {
  assert.equal(samePost("https://www.facebook.com/bitclb/posts/1234567890123?ref=share", "https://facebook.com/bitclb/posts/1234567890123/"), true);
  assert.equal(samePost("https://m.facebook.com/groups/abc/posts/998877665544/", "https://www.facebook.com/groups/abc/posts/998877665544/?comment_id=1"), true);
});

test("samePost: nhận ra cùng id giữa dạng permalink.php và /posts/", () => {
  assert.equal(samePost("https://facebook.com/permalink.php?story_fbid=1234567890123&id=55555", "https://facebook.com/bitclb/posts/1234567890123"), true);
});

test("samePost: khác bài thì false", () => {
  assert.equal(samePost("https://facebook.com/bitclb/posts/1111111111", "https://facebook.com/bitclb/posts/2222222222"), false);
  assert.equal(samePost("https://facebook.com/bitclb/posts/1111111111", "https://facebook.com/"), false);
});

test("samePost: không xác định được thì coi là khác", () => {
  assert.equal(samePost("không phải link", "https://facebook.com/bitclb/posts/1111111111"), false);
  assert.equal(samePost("https://example.com/bitclb/posts/1111111111", "https://facebook.com/bitclb/posts/1111111111"), false);
});

test("samePost: link không có id thì so đường dẫn", () => {
  assert.equal(samePost("https://facebook.com/bitclb/videos/abc", "https://facebook.com/bitclb/videos/abc?x=1"), true);
  assert.equal(samePost("https://facebook.com/bitclb/videos/abc", "https://facebook.com/bitclb/videos/xyz"), false);
});
