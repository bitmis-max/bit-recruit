import { test } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { isPrivateIp, assertPublicHttpsUrl } from "../../src/lib/security/safe-fetch.ts";

test("isPrivateIp: IPv4 private/reserved ranges", () => {
  const priv = [
    "0.0.0.0", "0.255.255.255",
    "10.0.0.1", "10.255.255.255",
    "100.64.0.1", "100.127.255.255",
    "127.0.0.1", "127.255.255.254",
    "169.254.169.254", "169.254.0.1",
    "172.16.0.1", "172.31.255.255",
    "192.168.0.1", "192.168.255.255",
    "198.18.0.1", "198.19.255.255",
    "192.0.0.192", "192.0.2.1", "198.51.100.1", "203.0.113.1",
    "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255",
  ];
  for (const ip of priv) assert.equal(isPrivateIp(ip), true, `${ip} phải bị chặn`);
});

test("isPrivateIp: IPv4 public / sát biên dải private", () => {
  const pub = [
    "8.8.8.8", "1.1.1.1", "93.184.216.34",
    "100.63.255.255", "100.128.0.1",
    "172.15.255.255", "172.32.0.1",
    "192.167.255.255", "192.169.0.1",
    "198.17.255.255", "198.20.0.1",
    "169.253.255.255", "169.255.0.1",
    "192.0.1.1", "203.0.114.1",
    "11.0.0.1", "223.255.255.255",
  ];
  for (const ip of pub) assert.equal(isPrivateIp(ip), false, `${ip} phải được phép`);
});

test("isPrivateIp: IPv6 private/reserved", () => {
  const priv = ["2002::1", "2001:db8::1", "::", "::1", "fc00::1", "fd12:3456:789a::1", "fe80::1", "febf::1", "ff00::1", "ff02::1"];
  for (const ip of priv) assert.equal(isPrivateIp(ip), true, `${ip} phải bị chặn`);
});

test("isPrivateIp: IPv6 public", () => {
  for (const ip of ["2606:4700::1", "2001:4860:4860::8888", "2a00:1450:4001::200e"]) {
    assert.equal(isPrivateIp(ip), false, `${ip} phải được phép`);
  }
});

test("isPrivateIp: IPv4-mapped IPv6 xét theo phần IPv4", () => {
  for (const ip of ["::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:192.168.1.1", "::ffff:169.254.169.254", "::FFFF:127.0.0.1"]) {
    assert.equal(isPrivateIp(ip), true, `${ip} phải bị chặn`);
  }
  assert.equal(isPrivateIp("::ffff:8.8.8.8"), false);
});

async function hasNetwork(): Promise<boolean> {
  try {
    await dns.lookup("example.com");
    return true;
  } catch {
    return false;
  }
}

async function assertRejects(url: string) {
  await assert.rejects(() => assertPublicHttpsUrl(url), (e: unknown) => {
    assert.ok(e instanceof Error, "phải throw Error");
    assert.ok(e.message.length > 0, "message không được rỗng");
    return true;
  }, `${url} phải bị chặn`);
}

test("assertPublicHttpsUrl: chặn http", async () => {
  await assertRejects("http://example.com/file.pdf");
});

test("assertPublicHttpsUrl: chặn user:pass@", async () => {
  await assertRejects("https://user:pass@example.com/file.pdf");
  await assertRejects("https://user@example.com/file.pdf");
});

test("assertPublicHttpsUrl: chặn cổng khác 443", async () => {
  await assertRejects("https://example.com:8443/file.pdf");
});

test("assertPublicHttpsUrl: chặn localhost và IP private/literal", async () => {
  await assertRejects("https://localhost/");
  await assertRejects("https://127.0.0.1/");
  await assertRejects("https://169.254.169.254/latest/meta-data/");
  await assertRejects("https://[::1]/");
  await assertRejects("https://10.0.0.1/");
  await assertRejects("https://[::ffff:127.0.0.1]/");
});

test("assertPublicHttpsUrl: chặn URL rác và scheme khác", async () => {
  await assertRejects("not a url");
  await assertRejects("ftp://example.com/x");
  await assertRejects("file:///etc/passwd");
});

test("assertPublicHttpsUrl: https://example.com hợp lệ", async (t) => {
  if (!(await hasNetwork())) return t.skip("không có mạng (DNS lookup thất bại)");
  const u = await assertPublicHttpsUrl("https://example.com/path?q=1");
  assert.ok(u instanceof URL);
  assert.equal(u.protocol, "https:");
  assert.equal(u.hostname, "example.com");
});

test("assertPublicHttpsUrl: cổng 443 tường minh hợp lệ", async (t) => {
  if (!(await hasNetwork())) return t.skip("không có mạng (DNS lookup thất bại)");
  const u = await assertPublicHttpsUrl("https://example.com:443/");
  assert.equal(u.hostname, "example.com");
});
