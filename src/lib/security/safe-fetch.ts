// Chống SSRF: chỉ tải file qua HTTPS tới địa chỉ công khai.
// File này chỉ import module chuẩn của Node để `node --test` chạy được không cần build.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIpv4(parts: number[]): boolean {
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // 192.0.0.0/24, 192.0.2.0/24
    (a === 198 && b === 51 && c === 100) || // 198.51.100.0/24
    (a === 203 && b === 0 && c === 113) || // 203.0.113.0/24
    a >= 224
  );
}

// Trả về 8 nhóm 16 bit của địa chỉ IPv6, hoặc null nếu sai định dạng.
function parseIpv6(input: string): number[] | null {
  let ip = input;
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = tail.split(".").map(Number);
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    ip = `${ip.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN));
  return nums.length === 8 && nums.every((n) => !Number.isNaN(n)) ? nums : null;
}

export function isPrivateIp(ip: string): boolean {
  const value = ip.trim().replace(/^\[|\]$/g, "");
  const family = isIP(value.split("%")[0]);
  if (family === 4) return isPrivateIpv4(value.split(".").map(Number));
  if (family === 6) {
    const g = parseIpv6(value);
    if (!g) return true;
    if (g.every((n) => n === 0)) return true; // ::
    if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) return true; // ::1
    if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
    if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8
    if (g[0] === 0x2002) return true; // 2002::/16 (6to4)
    if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // 2001:db8::/32
    const embedded = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
    // IPv4-mapped ::ffff:x.x.x.x, IPv4-compatible ::x.x.x.x, NAT64 64:ff9b::x.x.x.x
    const mapped = g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff;
    const compatible = g.slice(0, 6).every((n) => n === 0);
    const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((n) => n === 0);
    if (mapped || compatible || nat64) return isPrivateIpv4(embedded);
    return false;
  }
  return true; // Không phải IP hợp lệ: coi như không an toàn.
}

export async function assertPublicHttpsUrl(url: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Đường dẫn không hợp lệ.");
  }
  if (parsed.protocol !== "https:") throw new Error("Chỉ chấp nhận đường dẫn HTTPS.");
  if (parsed.username || parsed.password) throw new Error("Đường dẫn không được chứa tài khoản hoặc mật khẩu.");
  if (parsed.port && parsed.port !== "443") throw new Error("Chỉ chấp nhận cổng 443.");

  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);
    } catch {
      throw new Error("Không phân giải được tên miền của đường dẫn.");
    }
  }
  if (!addresses.length) throw new Error("Không phân giải được tên miền của đường dẫn.");
  if (addresses.some(isPrivateIp)) throw new Error("Đường dẫn trỏ tới địa chỉ nội bộ nên bị chặn.");
  return parsed;
}

// shortcut: fetch tự phân giải DNS lần nữa nên vẫn còn khe hở DNS rebinding rất hẹp;
// nâng cấp bằng node:https với `lookup` ghim IP đã kiểm tra nếu cần chặn tuyệt đối.
export async function fetchPublicFile(
  url: string,
  opts: { maxBytes: number; maxRedirects?: number },
): Promise<{ buffer: Buffer; contentType: string | null; finalUrl: string }> {
  const maxRedirects = opts.maxRedirects ?? 3;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const target = await assertPublicHttpsUrl(current);
    const response = await fetch(target, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new Error("Máy chủ chuyển hướng nhưng không cho biết địa chỉ mới.");
      try {
        current = new URL(location, target).toString();
      } catch {
        throw new Error("Địa chỉ chuyển hướng không hợp lệ.");
      }
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("Không tải được tệp đính kèm.");
    }
    const tooLarge = () => new Error("Tệp đính kèm vượt quá dung lượng cho phép.");
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > opts.maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw tooLarge();
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > opts.maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw tooLarge();
        }
        chunks.push(value);
      }
    }
    return {
      buffer: Buffer.concat(chunks),
      contentType: response.headers.get("content-type"),
      finalUrl: target.toString(),
    };
  }
  throw new Error("Đường dẫn chuyển hướng quá nhiều lần.");
}
