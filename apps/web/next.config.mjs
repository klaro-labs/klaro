/** @type {import('next').NextConfig} */

// Audit fix 2026-05-25 P0-8: ship a minimum-viable security header set.
// CSP is intentionally permissive for `script-src` (next/script requires
// 'unsafe-inline' for hydration in app router); tighten on a route-by-route
// basis once we have a nonce strategy. HSTS + frame guard + content-type
// guard + referrer + permissions are all hardline.
// Audit fix (loop iter 56, 2026-05-25): factor the CSP body so we can
// reuse all directives for the embeddable variants of `/i/*` and
// `/receipt/*` while only swapping `frame-ancestors`. Previously the
// route-specific overrides set ONLY frame-ancestors, dropping script-src
// + connect-src + img-src etc., which would have broken the hosted
// invoice and receipt pages entirely when the override route matched.
const CSP_DIRECTIVES_EMBEDDABLE = ["frame-ancestors *"];
const CSP_DIRECTIVES_DEFAULT = ["frame-ancestors 'none'"];

function buildCsp(frameAncestorsDirectives) {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.supabase.in https://*.circle.com https://*.arc.network https://api.resend.com https://us.i.posthog.com https://buy-sandbox.moonpay.com https://pay.google.com wss://*.supabase.co",
    ...frameAncestorsDirectives,
    "form-action 'self'",
    "base-uri 'self'",
  ].join("; ");
}

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security",    value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options",       value: "nosniff" },
  { key: "X-Frame-Options",              value: "DENY" },
  { key: "Referrer-Policy",              value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",           value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // CSP: blocks inline event handlers but allows inline <script> for hydration.
  // Connect-src enumerates the only off-domain endpoints Klaro talks to.
  { key: "Content-Security-Policy",      value: buildCsp(CSP_DIRECTIVES_DEFAULT) },
];

// Embeddable header set for /i/* and /receipt/* — same directives as the
// default set EXCEPT frame-ancestors. Drops X-Frame-Options entirely
// because (a) "ALLOWALL" is non-standard and ignored / treated as DENY by
// browsers, (b) CSP frame-ancestors supersedes XFO when both present per
// the spec, so the spec-correct way to allow embedding is to omit XFO +
// set CSP frame-ancestors to the desired sources.
const EMBEDDABLE_HEADERS = [
  { key: "Strict-Transport-Security",    value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options",       value: "nosniff" },
  { key: "Referrer-Policy",              value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",           value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy",      value: buildCsp(CSP_DIRECTIVES_EMBEDDABLE) },
];

const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  async redirects() {
    return [
      { source: "/developers", destination: "/build", permanent: true },
      { source: "/resources/brand", destination: "/brand-kit", permanent: true },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Audit fix (loop iter 56, 2026-05-25): hosted-invoice + receipt
      // pages are intentionally embeddable, but the previous overrides
      // had TWO real defects:
      //   (a) `X-Frame-Options: ALLOWALL` — non-standard value; browsers
      //       ignore or treat as DENY. The spec-correct way to allow
      //       embedding is to OMIT XFO (it would otherwise apply
      //       DENY/SAMEORIGIN from any inherited header) and rely on
      //       CSP `frame-ancestors`.
      //   (b) The route override set ONLY `Content-Security-Policy:
      //       frame-ancestors *`, dropping every other directive
      //       (script-src, connect-src, img-src...) from the page. Page
      //       would have broken in production when the override applied.
      // Now both routes get the full EMBEDDABLE_HEADERS — identical to
      // SECURITY_HEADERS except XFO is omitted and CSP `frame-ancestors`
      // is `*` instead of `'none'`.
      { source: "/i/:path*", headers: EMBEDDABLE_HEADERS },
      { source: "/receipt/:path*", headers: EMBEDDABLE_HEADERS },
    ];
  },
};

// Wrap with Sentry's plugin so the upload-source-maps + tracing hooks are
// installed automatically. No-op in builds without SENTRY_AUTH_TOKEN.
async function withOptionalSentry() {
  try {
    const { withSentryConfig } = await import("@sentry/nextjs");
    return withSentryConfig(nextConfig, {
      silent: !process.env.SENTRY_AUTH_TOKEN,
      org:    process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      hideSourceMaps: true,
      tunnelRoute: "/monitoring-tunnel",
    });
  } catch {
    return nextConfig;
  }
}

export default await withOptionalSentry();
