/**
 * Daemon env validation. All required envs surface a loud error at boot so
 * Railway shows the failure in the deploy log instead of silently running broken.
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(8787),

  // Supabase service role (RLS bypass — daemon needs to write across vendors)
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Redis (BullMQ + idempotency)
  REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),
  BULLMQ_PREFIX: z.string().default("klaro"),

  // Arc RPC for event subscriptions
  // canonical Arc testnet RPC per
  // docs.arc.io (verified via arc-docs MCP) is `rpc.testnet.arc.network`,
  // NOT `rpc-testnet.arc.io`. The web's lib/env.ts had this right; daemon
  // was wrong. Drift between web + daemon would have sent them to different
  // (possibly non-existent) endpoints.
  ARC_TESTNET_RPC_URL: z
    .string()
    .url()
    .default("https://rpc.testnet.arc.network"),

  // Contract addresses (pinned post-deploy via env so daemon doesn't need contract redeploy on address change)
  INVOICE_ESCROW_ADDRESS: z.string().optional(),
  AUDIT_RECEIPT_ADDRESS: z.string().optional(),
  CASHOUT_ORDER_PROCESSOR_ADDRESS: z.string().optional(),
  AGENT_ESCROW_ADDRESS: z.string().optional(),
  // RetainerStream escrow — the dispute→escrow fan-out resolves stream-context
  // cases against it (RetainerStream.resolveDispute(streamId)).
  RETAINER_STREAM_ADDRESS: z.string().optional(),
  DISPUTE_MANAGER_ADDRESS: z.string().optional(),
  // VendorReputation — operator-signed reputation event writes at settle/release.
  VENDOR_REPUTATION_ADDRESS: z.string().optional(),
  // StableFXAdapterRegistry — on-chain USDC<->EURC swap (mock adapter on testnet).
  STABLEFX_REGISTRY_ADDRESS: z.string().optional(),
  // EURC token (MockEURC on testnet until Circle StableFX TEST access). The FX
  // worker resolves the USDC<->EURC pair to real on-chain token addresses.
  EURC_ADDRESS: z.string().optional(),

  // QuickBooks (Intuit) ERP sync — the erpSync worker refreshes the vendor's
  // stored OAuth token + pushes invoices to their QuickBooks company.
  QUICKBOOKS_CLIENT_ID: z.string().optional(),
  QUICKBOOKS_CLIENT_SECRET: z.string().optional(),
  QUICKBOOKS_ENV: z.string().default("sandbox"),
  // Shared AES-256-GCM key (32-byte hex) — must match the web app so the daemon
  // can decrypt the OAuth tokens the callback stored.
  ERP_ENC_KEY: z.string().optional(),

  // Operator wallet (Circle Wallets or local keystore — for daemon-signed txs)
  DAEMON_OPERATOR_WALLET_ID: z.string().optional(),
  DAEMON_OPERATOR_PRIVATE_KEY: z.string().optional(),

  // Resend for outbound email
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default("Klaro <noreply@klaro.so>"),

  // Webhook delivery signing
  WEBHOOK_HMAC_SECRET: z.string().optional(),

  // Alerts
  PAGERDUTY_INTEGRATION_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),

  // Daemon-side prerequisites for de-labelling the `[SIMULATED]` workers
  // (sanctions adapter, KYB adapter, push notification sender). Declared
  // optional so the env contract stays honest before each provider's
  // consumer is implemented.
  CHAINALYSIS_API_KEY: z.string().optional(),
  SUMSUB_APP_TOKEN: z.string().optional(),
  // Web Push (build #10) — VAPID is a self-generated keypair (no account).
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:support@klaro.so"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "[daemon] env validation failed:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}
export const env = parsed.data;
export const IS_PROD = env.NODE_ENV === "production";
