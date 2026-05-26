/**
 * Env reading + feature flags.
 * Klaro's M4 strategy: every external integration (Supabase, Circle Wallets,
 * Resend, MoonPay) has a real impl behind an env-gated flag and a clearly-
 * labeled mock fallback. UI never knows which is active;
 * forbids silent mock/live mixing — `isLive()` consumers must surface a
 * "simulated" badge when this returns false.
 * **Never read `process.env` directly elsewhere** — it bypasses the audit
 * trail this file gives us.
 */

const required = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env var: ${k}`);
  return v;
};

/** Returns env var or undefined — used by adapters to choose live vs mock. */
const opt = (k: string): string | undefined =>
  process.env[k] && process.env[k]!.length > 0 ? process.env[k] : undefined;

// ─── Supabase (M4 auth + DB) ─────────────────────────────────────────
export const SUPABASE_URL = opt("SUPABASE_URL");
export const SUPABASE_ANON_KEY = opt("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const SUPABASE_SERVICE_ROLE_KEY = opt("SUPABASE_SERVICE_ROLE_KEY");
export const supabaseLive = (): boolean =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// ─── Circle Wallets (M4 vendor onboarding + signing) ─────────────────
export const CIRCLE_CLIENT_KEY = opt("NEXT_PUBLIC_CIRCLE_CLIENT_KEY");
export const CIRCLE_API_KEY = opt("CIRCLE_API_KEY");
export const CIRCLE_ENTITY_SECRET = opt("CIRCLE_ENTITY_SECRET");
/** Circle Modular Wallets endpoint (per docs). */
export const CIRCLE_MODULAR_URL =
  process.env.CIRCLE_MODULAR_URL ??
  "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";
export const circleVendorLive = (): boolean => Boolean(CIRCLE_CLIENT_KEY);
export const circleOperatorLive = (): boolean =>
  Boolean(CIRCLE_API_KEY && CIRCLE_ENTITY_SECRET);

// ─── Resend (M4 transactional + lifecycle emails) ────────────────────
export const RESEND_API_KEY = opt("RESEND_API_KEY");
export const RESEND_FROM =
  process.env.RESEND_FROM ?? "Klaro <noreply@klaro.local>";
export const resendLive = (): boolean => Boolean(RESEND_API_KEY);

// ─── Arc network (constants — same on every env) ─────────────────────
export const ARC_TESTNET_RPC_URL =
  process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ??
  "https://rpc.testnet.arc.network";
export const ARC_TESTNET_CHAIN_ID = 5_042_002;

// ─── Klaro contract addresses (set after `forge create`) ─────────────
export const INVOICE_ESCROW_ADDRESS = opt("NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS");
export const AUDIT_RECEIPT_ADDRESS = opt("NEXT_PUBLIC_AUDIT_RECEIPT_ADDRESS");
export const REFUND_PROTOCOL_ADDRESS = opt(
  "NEXT_PUBLIC_REFUND_PROTOCOL_ADDRESS",
);
export const FEE_SPLITTER_ADDRESS = opt("NEXT_PUBLIC_FEE_SPLITTER_ADDRESS");
export const ROUTE_POLICY_ADDRESS = opt("NEXT_PUBLIC_ROUTE_POLICY_ADDRESS");

// ─── BullMQ + Upstash (M7 queue infra) ───────────────────────────────
export const REDIS_URL = opt("REDIS_URL");
export const BULLMQ_PREFIX = process.env.BULLMQ_PREFIX ?? "klaro";
export const queueLive = (): boolean => Boolean(REDIS_URL);

// ─── Webhook delivery (M7) ───────────────────────────────────────────
export const WEBHOOK_HMAC_SECRET = opt("WEBHOOK_HMAC_SECRET");

// ─── Apple Wallet PKPass (M9) ────────────────────────────────────────
export const APPLE_WALLET_CERT_B64 = opt("APPLE_WALLET_CERT_B64");
export const APPLE_WALLET_KEY_B64 = opt("APPLE_WALLET_KEY_B64");
export const APPLE_WALLET_PASS_TYPE_ID = opt("APPLE_WALLET_PASS_TYPE_ID");
export const APPLE_WALLET_TEAM_ID = opt("APPLE_WALLET_TEAM_ID");
export const appleWalletLive = (): boolean =>
  Boolean(
    APPLE_WALLET_CERT_B64 &&
    APPLE_WALLET_KEY_B64 &&
    APPLE_WALLET_PASS_TYPE_ID &&
    APPLE_WALLET_TEAM_ID,
  );

// ─── Google Wallet pass (M9) ─────────────────────────────────────────
export const GOOGLE_WALLET_ISSUER_ID = opt("GOOGLE_WALLET_ISSUER_ID");
export const GOOGLE_WALLET_SERVICE_ACCOUNT_B64 = opt(
  "GOOGLE_WALLET_SERVICE_ACCOUNT_B64",
);
export const googleWalletLive = (): boolean =>
  Boolean(GOOGLE_WALLET_ISSUER_ID && GOOGLE_WALLET_SERVICE_ACCOUNT_B64);

// ─── x402 nanopayments (M10) ─────────────────────────────────────────
// Circle Gateway facilitator URL (verified iter session 2026-05-24 via Circle MCP).
export const X402_FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ?? "https://gateway-api-testnet.circle.com";
/** Set to "1" to enable the live BatchFacilitatorClient. Without it x402
 * middleware serves a simulated 402 negotiation so the demo flow works
 * without a Circle Gateway Wallet balance. */
export const X402_ENABLED = opt("X402_ENABLED") === "1";
export const x402Live = (): boolean => X402_ENABLED;

/** Klaro's USDC receiver for fee collection. Required when X402_ENABLED=1
 * — otherwise the 402 body would advertise a zero-address recipient and
 * any paid call would burn the USDC. Audit fix (loop ). */
export const KLARO_FEE_RECEIVER = opt("NEXT_PUBLIC_KLARO_FEE_RECEIVER");

// ─── MoonPay sandbox (M10) ───────────────────────────────────────────
export const MOONPAY_PUBLIC_KEY = opt("NEXT_PUBLIC_MOONPAY_PUBLIC_KEY");
export const MOONPAY_SECRET_KEY = opt("MOONPAY_SECRET_KEY");
export const moonpayLive = (): boolean => Boolean(MOONPAY_PUBLIC_KEY);

// ─── Observability (M11) ─────────────────────────────────────────────
// SENTRY_ENV defaults to "testnet" (matching the prior
// hardcoded fallback in sentry.{server,edge}.config.ts before
// centralized env reads). Klaro is testnet-only; tagging prod-deployed
// Sentry events with environment=production would mislead the
// dashboards. Operators explicitly set SENTRY_ENV when mainnet lands.
export const SENTRY_DSN = opt("SENTRY_DSN");
export const SENTRY_ENV = process.env.SENTRY_ENV ?? "testnet";
export const sentryLive = (): boolean => Boolean(SENTRY_DSN);

export const POSTHOG_KEY = opt("NEXT_PUBLIC_POSTHOG_KEY");
export const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
export const posthogLive = (): boolean => Boolean(POSTHOG_KEY);

export const GROWTHBOOK_HOST = opt("NEXT_PUBLIC_GROWTHBOOK_HOST");
export const GROWTHBOOK_CLIENT_KEY = opt("NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY");
export const growthbookLive = (): boolean =>
  Boolean(GROWTHBOOK_HOST && GROWTHBOOK_CLIENT_KEY);

// ─── Cron secret ──────────────────────────────────────────────────────
export const CRON_SECRET = opt("CRON_SECRET");

// ─── Web Push ─────────────────────────────────────────────────────────
// The consumer (`subscribePush()` in lib/push.ts) is wired but currently
// not invoked from any UI surface. Declaring the env here keeps the import
// type-safe for when the "Enable notifications" CTA lands.
export const VAPID_PUBLIC_KEY = opt("NEXT_PUBLIC_VAPID_PUBLIC_KEY");

// ─── ReputationManager ────────────────────
// Set post-deploy alongside other contract addresses; arcClient's
// readReputationScore() flips from honest-simulated to live chain read
// when this is present.
export const REPUTATION_MANAGER_ADDRESS = opt(
  "NEXT_PUBLIC_REPUTATION_MANAGER_ADDRESS",
);

// ─── CounterpartyRegistry ─────────────────
// Set post-deploy so /admin/sanctions can enumerate the on-chain denylist
// via getLogs(DenylistAdded). Same honesty→feature ladder pattern as
// ReputationManager.
export const COUNTERPARTY_REGISTRY_ADDRESS = opt(
  "NEXT_PUBLIC_COUNTERPARTY_REGISTRY_ADDRESS",
);

// ─── Screening provider credentials (loop ) ─────────────
// `/admin/sanctions` previously read these directly from `process.env`,
// bypassing the env.ts audit trail. Declare them here so the drift-guard
// + .env.example sweep catches future drift. All four flip the matching
// provider's `live` row in the admin UI; daemon's `screenAndSettle`
// adopts the live results once any of these is set (M11 wiring).
export const CHAINALYSIS_API_KEY = opt("CHAINALYSIS_API_KEY");
export const TRM_API_KEY = opt("TRM_API_KEY");
export const SUMSUB_APP_TOKEN = opt("SUMSUB_APP_TOKEN");
export const ELLIPTIC_API_KEY = opt("ELLIPTIC_API_KEY");

// ─── Inbound webhook secrets (loop ) ────────────────────
// `lib/webhookReceiver.ts` previously read these via `process.env[opts.envVar]`
// — string-keyed lookups bypass both env.ts and the drift-guard test. Declare
// here so a future env-rename surfaces at boot, not at first signed-delivery.
export const STRIPE_WEBHOOK_SECRET = opt("STRIPE_WEBHOOK_SECRET");
export const CIRCLE_WEBHOOK_SECRET = opt("CIRCLE_WEBHOOK_SECRET");
export const CCTP_WEBHOOK_SECRET = opt("CCTP_WEBHOOK_SECRET");
export const GATEWAY_WEBHOOK_SECRET = opt("GATEWAY_WEBHOOK_SECRET");
export const ERP_WEBHOOK_SECRET = opt("ERP_WEBHOOK_SECRET");

// ─── Public origin for shareable links (loop ) ──────────
// `/vendor/invoices/[id]` builds shareable hosted URLs from this. Preview
// deploys without it silently fall back to `https://klaro.so`, so a
// preview-branch copy-link shows a prod URL. Declare in env.ts so the
// drift-guard + .env.example pick it up.
export const PUBLIC_ORIGIN =
  process.env.NEXT_PUBLIC_PUBLIC_ORIGIN ?? "https://klaro.so";

// ─── Queue worker flag (loop ) ──────────────────────────
// Web (Vercel serverless) leaves this unset — handlers run in the daemon's
// long-lived process. Daemon sets it to "1" to actually drain queues.
// Previously read directly in lib/queue.ts; typo (e.g. `..WORKERS`)
// silently left jobs in Redis with no drainer.
export const KLARO_RUN_QUEUE_WORKER = opt("KLARO_RUN_QUEUE_WORKER");

// ─── Mock-auth escape hatch (loop ) ───────────────────────────
// Dev / preview-only: grants the seeded mock vendor session even when
// NODE_ENV=production. Previously read directly in lib/auth.ts +
// middleware.ts → 2 sites, easy to typo. Centralized here.
// NEVER set this on a real deployment — it gives every visitor full
// vendor session. Lib/auth and middleware re-assert IS_PROD on top.
export const KLARO_ALLOW_MOCK_AUTH = process.env.KLARO_ALLOW_MOCK_AUTH === "1";

// ─── Client-side Sentry (loop ) ─────────────────────────
// Browser Sentry uses `NEXT_PUBLIC_*` names since Next.js only inlines
// those into client bundles. Server-side `SENTRY_DSN` / `SENTRY_ENV` are
// distinct vars (lines 114-117). Without declaring both surfaces here,
// setting only the server var leaves browser telemetry off with no
// warning. Direct `process.env.X` literal so Next.js inlines on build,
// matching the PUBLIC_ORIGIN W83-2 pattern.
export const NEXT_PUBLIC_SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ?? null;
export const NEXT_PUBLIC_SENTRY_ENV =
  process.env.NEXT_PUBLIC_SENTRY_ENV ?? "testnet";

// ─── WebAuthn ─────────────────────────────
// Real passkey verification via @simplewebauthn/server. RP_ID is the
// domain (no scheme, no port — must match the cookie origin). EXPECTED_
// ORIGIN is the full URL including scheme. RP_NAME is the display name
// in the OS-native passkey prompt.
export const WEBAUTHN_RP_ID = opt("WEBAUTHN_RP_ID") ?? "localhost";
export const WEBAUTHN_RP_NAME = opt("WEBAUTHN_RP_NAME") ?? "Klaro";
export const WEBAUTHN_EXPECTED_ORIGIN =
  opt("WEBAUTHN_EXPECTED_ORIGIN") ?? "http://localhost:3000";

export { required };
