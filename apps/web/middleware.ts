import { NextResponse, type NextRequest } from "next/server";
import { KLARO_ALLOW_MOCK_AUTH } from "@/lib/env";

/// `applySecurityHeaders` set
/// HSTS/XCTO/XFO/Referrer/Permissions but no CSP. CSP was only attached
/// by `next.config.mjs.headers()`, which doesn't run on responses minted
/// by middleware (rate-limit 429, signin 302). Adding the same CSP body
/// here so middleware-minted responses inherit it; the next-config copy
/// remains the source of truth for the directive list — keep them in
/// sync until M10 tightens CSP further.
const CSP_DEFAULT =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https:; " +
  "font-src 'self' data:; " +
  // connect-src mirrors next.config.mjs exactly (the off-domain endpoints
  // Klaro talks to). Was 'self' https: wss:' — a wildcard that let
  // middleware-minted responses (429/302/rewrites) exfiltrate to any HTTPS
  // host. Keep in lockstep with next.config's list.
  "connect-src 'self' https://*.supabase.co https://*.supabase.in https://*.circle.com https://*.arc.network https://api.resend.com https://us.i.posthog.com https://buy-sandbox.moonpay.com https://pay.google.com wss://*.supabase.co; " +
  "frame-src 'self' https://buy.moonpay.com https://buy-sandbox.moonpay.com; " +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'";

// Hosted invoice (/i), receipt (/receipt) + link pay (/pay) pages are designed
// to be embedded by vendors (i.klaro.so widgets). The blanket frame-ancestors
// 'none' broke that. This variant drops the frame restriction for those routes
// only; the app shell everywhere else stays frame-DENY.
// Matches next.config.mjs's EMBEDDABLE_HEADERS (frame-ancestors *) so the
// middleware-minted + route-minted responses agree instead of one clobbering
// the other (the regression: middleware's frame-ancestors 'none' won).
const CSP_EMBEDDABLE = CSP_DEFAULT.replace(
  "frame-ancestors 'none'",
  "frame-ancestors *",
);

function applySecurityHeaders(
  res: NextResponse,
  embeddable = false,
): NextResponse {
  res.headers.set(
    "strict-transport-security",
    "max-age=31536000; includeSubDomains; preload",
  );
  res.headers.set("x-content-type-options", "nosniff");
  // x-frame-options has no per-origin allowlist, so for embeddable routes we
  // drop it entirely and rely on CSP frame-ancestors (omitted = allow). The app
  // shell keeps DENY to prevent clickjacking.
  if (!embeddable) {
    res.headers.set("x-frame-options", "DENY");
  }
  res.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.headers.set(
    "content-security-policy",
    embeddable ? CSP_EMBEDDABLE : CSP_DEFAULT,
  );
  return res;
}

/** Subdomain → pathname rewrites. Lets app.klaro.so/vendor/* render the same
 * pages as klaro.so/vendor/* without code duplication. Only kicks in when
 * Host matches a known klaro subdomain. */
const SUBDOMAIN_REWRITE: Record<string, string> = {
  "app.klaro.so": "/vendor",
  "i.klaro.so": "/i",
  "pay.klaro.so": "/pay",
  "receipt.klaro.so": "/receipt",
  "cashout.klaro.so": "/vendor/cashout",
  "lp.klaro.so": "/lp",
  "admin.klaro.so": "/admin",
  "fx.klaro.so": "/fx",
  "internal.klaro.so": "/internal",
  "status.klaro.so": "/status",
  "docs.klaro.so": "/docs",
};

/**
 * Edge middleware — auth + RBAC gate + per-IP rate limiting.
 * 1. `/admin/*` requires a Supabase session cookie in production. Hard auth
 * + role check still happens server-side via `requireOperator()`.
 * 2. `/api/*` is bucket-rate-limited per client IP (60 req/min default).
 * P1 (#94) — no limiter previously meant scrapers
 * + accidental retry storms hit `mockListInvoices` repeatedly.
 * Edge runtime can't reach Redis, so the limiter is in-memory per edge node.
 * Good enough to cap the long tail; the daemon should also enforce on the
 * read-DB side once Supabase RLS is wired.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(
  ip: string,
  limit: number = RATE_LIMIT,
): {
  ok: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    const reset = now + RATE_WINDOW_MS;
    buckets.set(ip, { count: 1, resetAt: reset });
    return { ok: true, remaining: limit - 1, resetAt: reset };
  }
  bucket.count += 1;
  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

// C7/I4: the in-memory bucket above is per-edge-node, so a request spread across
// N nodes effectively gets N× the limit. When Upstash REST is configured we keep
// a DURABLE shared counter (works from the edge runtime over HTTP), so the limit
// is global. Fail-OPEN: a limiter outage must never block legitimate money
// traffic, so any Upstash error falls back to the in-memory bucket.
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function durableRateLimit(
  ip: string,
  limit: number,
): Promise<{ ok: boolean; remaining: number; resetAt: number }> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return rateLimit(ip, limit);
  const windowSec = Math.floor(RATE_WINDOW_MS / 1000);
  const window = Math.floor(Date.now() / RATE_WINDOW_MS);
  const key = `klaro:rl:${ip}:${window}`;
  const resetAt = (window + 1) * RATE_WINDOW_MS;
  try {
    // One round-trip: INCR the window counter + set its TTL on first hit (NX).
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSec), "NX"],
      ]),
    });
    if (!res.ok) return rateLimit(ip, limit);
    const out = (await res.json()) as Array<{ result?: number }>;
    const count = Number(out?.[0]?.result ?? 0);
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch {
    return rateLimit(ip, limit); // fail-open
  }
}

function clientIp(req: NextRequest): string {
  // The FIRST x-forwarded-for hop is attacker-controlled — a client could send a
  // fresh spoofed IP on every request and skate straight past the per-IP rate
  // limit (the whole reason magic-link issuance is proxied through here). Vercel
  // sets x-real-ip to the true client IP (overriding any client-sent value) and
  // APPENDS the real source as the LAST x-forwarded-for hop; both are
  // trustworthy. Prefer x-real-ip, then the last xff hop.
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return "unknown";
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const host = req.headers.get("host")?.toLowerCase() ?? "";

  // Subdomain routing — rewrite Host → path prefix when not already there.
  const subPrefix = SUBDOMAIN_REWRITE[host];
  // Effective route after any subdomain rewrite (i.klaro.so/<id> -> /i/<id>), so
  // the embeddable check is correct on both the apex and the subdomain.
  const effectivePath =
    subPrefix && !path.startsWith(subPrefix) ? subPrefix + path : path;
  const embeddable = /^\/(i|receipt|pay)(\/|$)/.test(effectivePath);
  const secure = (res: NextResponse) => applySecurityHeaders(res, embeddable);

  if (subPrefix && !path.startsWith(subPrefix)) {
    const url = req.nextUrl.clone();
    url.pathname = subPrefix + path;
    return secure(NextResponse.rewrite(url));
  }

  // Rate limit /api/* AND the public, unauthenticated, money-facing pages
  // (/pay, /i, /receipt) — every environment. C7/I4: previously only /api/ was
  // throttled, so the public hosted-checkout + invoice + receipt pages were
  // wide open to scrapers / gas-drain-adjacent abuse. Durable (Upstash) when
  // configured, in-memory otherwise; fail-open on any limiter error.
  const isApi = path.startsWith("/api/");
  const isPublicMoneyPage = /^\/(pay|i|receipt)(\/|$)/.test(effectivePath);
  if (isApi || isPublicMoneyPage) {
    const { ok, remaining, resetAt } = await durableRateLimit(
      clientIp(req),
      RATE_LIMIT,
    );
    if (!ok) {
      return secure(
        new NextResponse(JSON.stringify({ error: "rate limit exceeded" }), {
          status: 429,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(Math.ceil(resetAt / 1000)),
            "retry-after": String(Math.ceil((resetAt - Date.now()) / 1000)),
          },
        }),
      );
    }
    if (isApi) {
      const res = NextResponse.next();
      res.headers.set("x-ratelimit-remaining", String(remaining));
      res.headers.set("x-ratelimit-reset", String(Math.ceil(resetAt / 1000)));
      if (!path.startsWith("/admin")) return secure(res);
    }
    // public money pages: limit passed → fall through to the security-header path.
  }

  // Admin first-line redirect — fast 302 to /signin when no session cookie
  // exists at all, so the user never sees a flash of the admin shell. The
  // REAL role gate lives in `app/admin/layout.tsx` (,
  // 2026-05-25): it calls `requireOperator()` and bounces non-operators to
  // /vendor. Defence-in-depth — neither this middleware nor the layout alone
  // is the gate.
  if (process.env.NODE_ENV !== "production") return secure(NextResponse.next());
  // read via env.ts (was a direct process.env.X === "1" string
  // compare here AND in lib/auth.ts — typo risk × 2). Single declared
  // boolean in env.ts now.
  if (KLARO_ALLOW_MOCK_AUTH) return secure(NextResponse.next());
  if (!path.startsWith("/admin") && !path.startsWith("/internal"))
    return secure(NextResponse.next());

  const hasSupabaseSession = req.cookies
    .getAll()
    .some(
      (c) =>
        c.name.startsWith("sb-") &&
        c.name.includes("auth-token") &&
        c.value.length > 0,
    );
  if (!hasSupabaseSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("from", path);
    return secure(NextResponse.redirect(url));
  }
  return secure(NextResponse.next());
}

export const config = {
  // Run on every request (we need to add security headers + subdomain rewrites
  // outside of /admin and /api too). Static asset paths skip the matcher.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|icons/|images/).*)",
  ],
};
