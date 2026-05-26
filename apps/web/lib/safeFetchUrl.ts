/**
 * SSRF guard for any vendor-supplied URL Klaro's server then fetches.
 * closure. Previously `createWebhookAction` accepted any
 * http(s) URL and stored it; the worker `deliver()` and the test-ping
 * path then ran `fetch(url, ...)` from the Klaro server with HMAC-signed
 * headers + body. A vendor (authenticated, low-trust) could submit
 * `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
 * (AWS IMDS), `http://localhost:6379` (Redis), `http://supabase-internal`,
 * etc. — Klaro's server probes its own infra and ships the response back
 * via the webhook delivery audit row (or surfaces the failure to the
 * vendor as diagnostic info).
 * Defense-in-depth: validate at store time so obvious internal targets
 * never persist, then revalidate at fetch time so DNS-rebinding attacks
 * (legitimate-looking host that resolves to a private IP at fetch time)
 * also fail closed.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_V4 = [
  // RFC1918
  { prefix: [10], bits: 8 },
  { prefix: [172, 16], bits: 12 },
  { prefix: [192, 168], bits: 16 },
  // Loopback
  { prefix: [127], bits: 8 },
  // Link-local + AWS IMDS / Azure / GCP metadata
  { prefix: [169, 254], bits: 16 },
  // CGNAT
  { prefix: [100, 64], bits: 10 },
  // "this network"
  { prefix: [0], bits: 8 },
] as const;

function v4InRange(parts: number[], prefix: readonly number[], bits: number) {
  // Compare the first `bits` of the address against `prefix`.
  const full = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
  let pfx = 0;
  for (let i = 0; i < 4; i += 1) {
    pfx = (pfx << 8) | (prefix[i] ?? 0);
  }
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (full & mask) >>> 0 === (pfx & mask) >>> 0;
}

function isPrivateV4(ip: string): boolean {
  const parts = ip.split(".").map((s) => Number(s));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true; // be paranoid
  for (const r of PRIVATE_V4) {
    if (v4InRange(parts, r.prefix, r.bits)) return true;
  }
  return false;
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower === "::") return true;
  // fc00::/7 (unique local) and fe80::/10 (link-local)
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  // IPv4-mapped IPv6: ::ffff:a.b.c.d — check the embedded v4
  const mapped = lower.match(/^::ffff:([0-9.]+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return false;
}

export class SsrfBlockedError extends Error {
  constructor(public reason: string) {
    super(`url_blocked_for_ssrf: ${reason}`);
    this.name = "SsrfBlockedError";
  }
}

/**
 * Validate that a URL points to a public, http(s), non-internal target.
 * Throws SsrfBlockedError otherwise. DNS lookup is performed so we catch
 * `http://attacker.com` that resolves to 10.x via custom DNS.
 */
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
  // userinfo bypasses some firewalls / lets attackers stuff phishing creds
  if (u.username || u.password) {
    throw new SsrfBlockedError("userinfo_disallowed");
  }
  const host = u.hostname;
  if (!host) throw new SsrfBlockedError("empty_host");

  // Literal IPs — block private ranges directly without DNS.
  const ipKind = isIP(host);
  if (ipKind === 4 && isPrivateV4(host)) {
    throw new SsrfBlockedError(`private_v4:${host}`);
  }
  if (ipKind === 6 && isPrivateV6(host)) {
    throw new SsrfBlockedError(`private_v6:${host}`);
  }
  if (ipKind !== 0) return; // public literal IP — accept

  // Domain: resolve and check every A/AAAA. Reject if ANY address is private
  // (a multi-A record with one private entry is a rebinding sled).
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
