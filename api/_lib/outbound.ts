import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

const LOCAL_FIXTURES = () => process.env.MCP_ALLOW_LOCAL_FIXTURES === "1";
const MAX_RESPONSE_BYTES = 1024 * 1024;

/**
 * Only globally routable addresses are outbound destinations. `ipaddr.js` owns
 * parsing and the IANA special-range table; the extra checks cover IPv4-mapped
 * and IPv4-compatible IPv6 spellings plus IPv6 global-unicast exceptions that
 * must never be dialed from a multi-tenant server.
 */
function ipv4Public(address: string) {
  try {
    return ipaddr.IPv4.parse(address).range() === "unicast";
  } catch {
    return false;
  }
}

function ipv4FromBytes(bytes: number[]) {
  return `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`;
}

function ipv6Public(address: string) {
  let value: ipaddr.IPv6;
  try {
    value = ipaddr.IPv6.parse(address.toLowerCase().split("%")[0]);
  } catch {
    return false;
  }
  // URL/WHATWG canonicalizes both `::ffff:127.0.0.1` and `::ffff:7f00:1`
  // to the same mapped form; `toIPv4Address` normalizes every spelling.
  if (value.isIPv4MappedAddress()) return ipv4Public(value.toIPv4Address().toString());
  const bytes = value.toByteArray();
  // IPv4-compatible `::7f00:1` is not reported as mapped by older parsers.
  if (bytes.slice(0, 12).every((byte) => byte === 0)) {
    return ipv4Public(ipv4FromBytes(bytes.slice(12)));
  }
  if (value.range() !== "unicast") return false;
  // Global unicast is 2000::/3. Anything outside it (NAT64, 6to4, ULA,
  // loopback, link-local, multicast and the IETF special-purpose blocks)
  // is not a public origin.
  if ((bytes[0] & 0xe0) !== 0x20) return false;
  // 2001::/23 IETF protocol assignments (Teredo, benchmarking, ORCHID, ...).
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && (bytes[2] & 0xfe) === 0x00) return false;
  // 2001:db8::/32 documentation.
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return false;
  // 2002::/16 6to4.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return false;
  return true;
}

function privateAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !ipv4Public(address);
  if (family === 6) return !ipv6Public(address);
  return true;
}

export type CheckedDestination = { url: URL; address: string; family: 4 | 6; hostname: string };

/** Resolve once, then pin that address for the actual request so DNS cannot rebind. */
export async function assertPublicDestination(raw: string, label = "地址"): Promise<CheckedDestination> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`${label}无效`); }
  const local = LOCAL_FIXTURES() && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1" || url.hostname === "[::1]");
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error(`${label}必须使用 HTTPS`);
  if (url.username || url.password || url.hash) throw new Error(`${label}不能包含凭据或片段`);
  if (url.port && (!/^\d{1,5}$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65535)) throw new Error(`${label}端口无效`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: { address: string; family: number }[];
  if (isIP(host)) addresses = [{ address: host, family: isIP(host) }];
  else {
    try { addresses = await lookup(host, { all: true, verbatim: true }); }
    catch { throw new Error(`${label}域名无法解析`); }
  }
  if (!addresses.length) throw new Error(`${label}域名无法解析`);
  // Every DNS answer must be public before any one of them is pinned. This
  // blocks a resolver that mixes a public and a private answer.
  if (!local && addresses.some((item) => privateAddress(item.address))) throw new Error(`${label}指向内网或保留地址`);
  const address = addresses[0];
  return { url, address: address.address, family: address.family === 6 ? 6 : 4, hostname: host };
}

export type PinnedResponse = { status: number; headers: IncomingHttpHeaders; body: string };
export function pinnedRequest(destination: CheckedDestination, options: {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
} = {}): Promise<PinnedResponse> {
  const local = LOCAL_FIXTURES() && ["127.0.0.1", "localhost", "::1"].includes(destination.hostname);
  if (!local && privateAddress(destination.address)) return Promise.reject(new Error("目标地址不允许访问"));
  return new Promise((resolve, reject) => {
    const body = options.body ?? "";
    const request = (destination.url.protocol === "http:" ? httpRequest : httpsRequest)({
      protocol: destination.url.protocol,
      hostname: destination.hostname,
      port: destination.url.port || (destination.url.protocol === "https:" ? 443 : 80),
      path: `${destination.url.pathname}${destination.url.search}`,
      method: options.method ?? "GET",
      servername: isIP(destination.hostname) ? undefined : destination.hostname,
      headers: {
        accept: "application/json",
        "user-agent": "EduFlow-MCP/1.0",
        host: destination.url.host,
        ...(body ? { "content-length": String(Buffer.byteLength(body)) } : {}),
        ...options.headers,
      },
      lookup: (_hostname, _options, callback) => callback(null, destination.address, destination.family),
      timeout: options.timeoutMs ?? 15000,
      rejectUnauthorized: true,
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > (options.maxBytes ?? MAX_RESPONSE_BYTES)) { request.destroy(new Error("响应过大")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("请求超时")));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

export async function fetchJsonPinned(raw: string, options: {
  label?: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
} = {}): Promise<{ status: number; headers: IncomingHttpHeaders; json: unknown; text: string }> {
  const destination = await assertPublicDestination(raw, options.label);
  const response = await pinnedRequest(destination, options);
  let json: unknown = null;
  try { json = response.body ? JSON.parse(response.body) : null; } catch { /* caller decides whether JSON is required */ }
  return { ...response, json, text: response.body };
}

export function publicHttpUrl(raw: string) {
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.hash ? url : null;
  } catch { return null; }
}
