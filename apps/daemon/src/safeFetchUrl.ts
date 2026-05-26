/**
 * SSRF guard — daemon-side port of apps/web/lib/safeFetchUrl.ts.
 * added the SSRF guard on the web app's
 * `lib/webhooks.ts` `deliver()` path (and at store time in
 * `createWebhookAction`), but the daemon's `workers/webhookDelivery.ts`
 * is the worker that actually drains in production (web worker only
 * runs with `KLARO_RUN_QUEUE_WORKER=1`, which the daemon sets and the
 * web doesn't). Without revalidation here, a subscriber URL whose
 * DNS A-record flips between store and fetch (rebinding) reaches
 * AWS IMDS / Redis / RFC1918 from the daemon with a signed Klaro
 * HMAC body. Same rule set as the web copy.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_V4 = [
  { prefix: [10], bits: 8 },
  { prefix: [172, 16], bits: 12 },
  { prefix: [192, 168], bits: 16 },
  { prefix: [127], bits: 8 },
  { prefix: [169, 254], bits: 16 },
  { prefix: [100, 64], bits: 10 },
  { prefix: [0], bits: 8 },
] as const;

function v4InRange(parts: number[], prefix: readonly number[], bits: number) {
  const full =
    ((parts[0] ?? 0) << 24) |
    ((parts[1] ?? 0) << 16) |
    ((parts[2] ?? 0) << 8) |
    (parts[3] ?? 0);
  let pfx = 0;
  for (let i = 0; i < 4; i += 1) {
    pfx = (pfx << 8) | (prefix[i] ?? 0);
  }
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (full & mask) >>> 0 === (pfx & mask) >>> 0;
}

function isPrivateV4(ip: string): boolean {
  const parts = ip.split(".").map((s) => Number(s));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  for (const r of PRIVATE_V4) {
    if (v4InRange(parts, r.prefix, r.bits)) return true;
  }
  return false;
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  const mapped = lower.match(/^::ffff:([0-9.]+)$/);
  if (mapped && mapped[1]) return isPrivateV4(mapped[1]);
  return false;
}

export class SsrfBlockedError extends Error {
  constructor(public reason: string) {
    super(`url_blocked_for_ssrf: ${reason}`);
    this.name = "SsrfBlockedError";
  }
}

export async function assertPublicHttpUrl(raw: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SsrfBlockedError("malformed_url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new SsrfBlockedError(`scheme_not_http_or_https:${u.protocol}`);
  }
  if (u.username || u.password) {
    throw new SsrfBlockedError("userinfo_disallowed");
  }
  const host = u.hostname;
  if (!host) throw new SsrfBlockedError("empty_host");

  const ipKind = isIP(host);
  if (ipKind === 4 && isPrivateV4(host)) {
    throw new SsrfBlockedError(`private_v4:${host}`);
  }
  if (ipKind === 6 && isPrivateV6(host)) {
    throw new SsrfBlockedError(`private_v6:${host}`);
  }
  if (ipKind !== 0) return;

  let results: Awaited<ReturnType<typeof lookup>> | undefined;
  try {
    results = (await lookup(host, {
      all: true,
      verbatim: true,
    })) as unknown as Awaited<ReturnType<typeof lookup>>;
  } catch (e) {
    throw new SsrfBlockedError(`dns_lookup_failed:${(e as Error).message}`);
  }
  const addrs = Array.isArray(results) ? results : [results];
  if (addrs.length === 0) {
    throw new SsrfBlockedError("dns_empty");
  }
  for (const r of addrs) {
    const family =
      r.family === 4 || r.family === 6 ? r.family : isIP(r.address);
    if (family === 4 && isPrivateV4(r.address)) {
      throw new SsrfBlockedError(
        `dns_resolved_private_v4:${host}->${r.address}`,
      );
    }
    if (family === 6 && isPrivateV6(r.address)) {
      throw new SsrfBlockedError(
        `dns_resolved_private_v6:${host}->${r.address}`,
      );
    }
  }
}
