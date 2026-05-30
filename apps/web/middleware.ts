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
  "connect-src 'self' https: wss:; " +
  "frame-src 'self' https://buy.moonpay.com https://buy-sandbox.moonpay.com; " +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'";

function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set(
    "strict-transport-security",
    "max-age=31536000; includeSubDomains; preload",
  );
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("x-frame-options", "DENY");
  res.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.headers.set("content-security-policy", CSP_DEFAULT);
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

function rateLimit(ip: string): {
  ok: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    const reset = now + RATE_WINDOW_MS;
    buckets.set(ip, { count: 1, resetAt: reset });
    return { ok: true, remaining: RATE_LIMIT - 1, resetAt: reset };
  }
  bucket.count += 1;
  return {
    ok: bucket.count <= RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - bucket.count),
    resetAt: bucket.resetAt,
  };
}

function clientIp(req: NextRequest): string {
  // Vercel sets x-forwarded-for; first hop is the client.
  return (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const host = req.headers.get("host")?.toLowerCase() ?? "";

  // Subdomain routing — rewrite Host → path prefix when not already there.
  const subPrefix = SUBDOMAIN_REWRITE[host];
  if (subPrefix && !path.startsWith(subPrefix)) {
    const url = req.nextUrl.clone();
    url.pathname = subPrefix + path;
    return applySecurityHeaders(NextResponse.rewrite(url));
  }

  // Rate limit /api/* — every environment, not just prod.
  if (path.startsWith("/api/")) {
    const { ok, remaining, resetAt } = rateLimit(clientIp(req));
    if (!ok) {
      return applySecurityHeaders(
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
    const res = NextResponse.next();
    res.headers.set("x-ratelimit-remaining", String(remaining));
    res.headers.set("x-ratelimit-reset", String(Math.ceil(resetAt / 1000)));
    if (!path.startsWith("/admin")) return applySecurityHeaders(res);
  }

  // Admin first-line redirect — fast 302 to /signin when no session cookie
  // exists at all, so the user never sees a flash of the admin shell. The
  // REAL role gate lives in `app/admin/layout.tsx` (,
  // 2026-05-25): it calls `requireOperator()` and bounces non-operators to
  // /vendor. Defence-in-depth — neither this middleware nor the layout alone
  // is the gate.
  if (process.env.NODE_ENV !== "production")
    return applySecurityHeaders(NextResponse.next());
  // read via env.ts (was a direct process.env.X === "1" string
  // compare here AND in lib/auth.ts — typo risk × 2). Single declared
  // boolean in env.ts now.
  if (KLARO_ALLOW_MOCK_AUTH) return applySecurityHeaders(NextResponse.next());
  if (!path.startsWith("/admin") && !path.startsWith("/internal"))
    return applySecurityHeaders(NextResponse.next());

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
    return applySecurityHeaders(NextResponse.redirect(url));
  }
  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  // Run on every request (we need to add security headers + subdomain rewrites
  // outside of /admin and /api too). Static asset paths skip the matcher.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|icons/|images/).*)",
  ],
};
