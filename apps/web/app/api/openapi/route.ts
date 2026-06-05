/**
 * OpenAPI 3.1 spec — every route under /api is enumerated. Audit finding L8
 * (loop 2, 2026-05-25): previous version pushed the webhook receivers, health,
 * status, admin/pause, agent call, cron, moonpay routes into a non-standard
 * `x-additional-paths` map so SDK codegen + Spectral lint missed them. Now
 * they sit in `paths` properly with explicit `security: []` where they're
 * public or HMAC-gated.
 */
import { ok } from "@/lib/api";

const vendorAuth = [{ bearerAuth: [] as string[] }];
const publicNoAuth: unknown[] = [];

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Klaro API",
    version: "1.0.0-testnet",
    description:
      "Arc-native USDC invoicing, Stenn-Proof receipts, INR cashout, FX, agents.",
    contact: {
      name: "Klaro",
      url: "https://www.myklaro.app",
      email: "prateek@myklaro.app",
    },
    license: {
      name: "Apache-2.0",
      url: "https://www.apache.org/licenses/LICENSE-2.0",
    },
  },
  servers: [
    { url: "https://www.myklaro.app/api", description: "production (testnet)" },
    { url: "http://localhost:3000/api", description: "local dev" },
  ],
  paths: {
    // ─── REST (vendor-scoped) ─────────────────────────────────────────
    "/v1/invoices": {
      get: {
        summary: "List your invoices",
        security: vendorAuth,
        responses: { "200": { description: "Invoices" } },
      },
      post: {
        summary: "Create an invoice",
        security: vendorAuth,
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateInvoice" },
            },
          },
          required: true,
        },
        responses: {
          "200": { description: "Invoice" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/v1/invoices/{id}": {
      get: {
        // spec said "public" but the route was
        // hardened with requireVendor() (cross-tenant invoice-id
        // enumeration was leaking). Hosted /i/[id] uses a separate
        // unauthenticated server-component path; the SDK route is
        // vendor-only.
        summary: "Get an invoice (vendor-scoped)",
        security: vendorAuth,
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Invoice" },
          "401": { description: "Not authenticated" },
          "404": { description: "Not found" },
        },
      },
    },
    "/v1/receipts/{hash}": {
      get: {
        summary: "Get a public Stenn-Proof receipt by hash",
        parameters: [
          {
            name: "hash",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Receipt" },
          "404": { description: "Not found" },
        },
      },
    },
    "/v1/cashouts": {
      get: {
        summary: "List your cashouts",
        security: vendorAuth,
        responses: { "200": { description: "Cashouts" } },
      },
      post: {
        summary: "Create a cashout from a signed quote",
        security: vendorAuth,
        responses: {
          "200": { description: "Order" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/v1/cashouts/quotes": {
      post: {
        summary: "Get a cashout quote (USDC → local currency)",
        security: vendorAuth,
        responses: { "200": { description: "Quote" } },
      },
    },
    "/v1/fx/quotes": {
      post: {
        summary: "Get a StableFX quote (USDC ↔ EURC ↔ USYC)",
        // spec said publicNoAuth but the route was
        // -hardened with requireVendor(). SDK codegen built
        // anonymous clients that 401'd in production. Spec was the
        // lie. Same honest-label class as .
        security: vendorAuth,
        responses: { "200": { description: "Quote" } },
      },
    },
    "/v1/disputes": {
      post: {
        summary:
          "Open a dispute (cashout, agent, or retainer) — returns 503 in live mode; ships M11",
        description:
          "Iter 92 F2: in live mode the route throws `disputes_not_yet_persistent` which surfaces as 503 (iter-90 W89-4 OpenAPI pattern). Persistence + admin queue land M11.",
        security: vendorAuth,
        responses: {
          "200": { description: "Dispute (simulated in dev mode)" },
          "503": {
            description: "Returns 503 until persistent disputes ship (M11)",
          },
        },
      },
    },
    "/v1/webhooks": {
      get: {
        summary:
          "List your webhook subscriptions (returns 503 in live mode; ships M11)",
        description:
          "Iter 90 W89-4: subscription persistence + per-vendor secret encryption are M11 work. In dev (no SUPABASE_URL) returns simulated rows tagged `simulated: true`. In live mode the route currently 503s with `webhooks_not_yet_available` — do not codegen against this surface for prod until M11.",
        security: vendorAuth,
        responses: {
          "200": {
            description: "Webhooks (simulated in dev mode)",
          },
          "503": {
            description: "Returns 503 until persistent webhooks ship (M11)",
          },
        },
      },
      post: {
        summary: "Register a webhook (returns 503 in live mode; ships M11)",
        description:
          "Iter 90 W89-4: same M11-deferred surface as GET — see route description.",
        security: vendorAuth,
        responses: {
          "200": {
            description: "Webhook (simulated in dev mode)",
          },
          "503": {
            description: "Returns 503 until persistent webhooks ship (M11)",
          },
        },
      },
    },
    "/v1/push/subscriptions": {
      post: {
        summary: "Subscribe a browser push endpoint",
        security: vendorAuth,
        responses: { "200": { description: "Subscription" } },
      },
      delete: {
        summary: "Unsubscribe by endpoint",
        security: vendorAuth,
        responses: { "200": { description: "Removed" } },
      },
    },
    "/v1/webauthn/register/options": {
      post: {
        summary:
          "Get PublicKeyCredentialCreationOptions for passkey registration",
        security: vendorAuth,
        responses: { "200": { description: "Options" } },
      },
    },
    "/v1/webauthn/register/verify": {
      post: {
        summary: "Verify passkey attestation + store credential",
        security: vendorAuth,
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/webauthn/assert/options": {
      post: {
        summary:
          "Get PublicKeyCredentialRequestOptions for passkey sign-in (anonymous)",
        security: publicNoAuth,
        responses: { "200": { description: "Options" } },
      },
    },
    "/v1/webauthn/assert/verify": {
      post: {
        summary: "Verify passkey assertion + issue session",
        security: publicNoAuth,
        responses: { "200": { description: "OK" } },
      },
    },

    // ─── Agents + on-ramp ─────────────────────────────────────────────
    "/agents/{agentId}/call": {
      post: {
        summary:
          "x402-style paid call into an ERC-8004 agent (demo template; returns 503 in live x402 mode)",
        description:
          "Iter 98 web (audit): in live x402 mode the route returns 503 `agent_call_stub_not_live` because a real agent backend hasn't been wired — without this, callers would be charged USDC for a stub response (principle 8 violation). Fork this endpoint + wire your agent backend before enabling x402 live mode.",
        security: publicNoAuth,
        parameters: [
          {
            name: "agentId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Agent response (mock x402 mode)" },
          "402": { description: "Payment required" },
          "503": {
            description:
              "Returns 503 in live x402 mode until a real agent backend is wired",
          },
        },
      },
    },
    "/moonpay/buy": {
      get: {
        summary: "MoonPay → USDC on-ramp redirect builder",
        security: publicNoAuth,
        responses: { "302": { description: "Redirect" } },
      },
    },

    // ─── Inbound webhook receivers (HMAC-verified, not bearer) ───────
    "/webhooks/stripe": {
      post: {
        summary: "Inbound Stripe webhook",
        security: publicNoAuth,
        responses: {
          "200": { description: "OK" },
          "401": { description: "Bad signature" },
        },
      },
    },
    "/webhooks/circle": {
      post: {
        summary: "Inbound Circle webhook",
        security: publicNoAuth,
        responses: {
          "200": { description: "OK" },
          "401": { description: "Bad signature" },
        },
      },
    },
    "/webhooks/cctp": {
      post: {
        summary: "Inbound CCTP webhook",
        security: publicNoAuth,
        responses: {
          "200": { description: "OK" },
          "401": { description: "Bad signature" },
        },
      },
    },
    "/webhooks/gateway": {
      post: {
        summary: "Inbound Gateway webhook",
        security: publicNoAuth,
        responses: {
          "200": { description: "OK" },
          "401": { description: "Bad signature" },
        },
      },
    },
    "/webhooks/erp": {
      post: {
        summary: "Inbound ERP webhook",
        security: publicNoAuth,
        responses: {
          "200": { description: "OK" },
          "401": { description: "Bad signature" },
        },
      },
    },

    // ─── Ops ──────────────────────────────────────────────────────────
    "/health": {
      get: {
        summary: "Liveness probe",
        security: publicNoAuth,
        responses: { "200": { description: "{ ok: true }" } },
      },
    },
    "/status": {
      get: {
        summary: "Public health (myklaro.app/status)",
        security: publicNoAuth,
        responses: { "200": { description: "Status" } },
      },
    },
    "/admin/pause": {
      post: {
        summary: "Operator emergency pause toggle",
        security: vendorAuth,
        responses: {
          "200": { description: "Paused" },
          "403": { description: "Operator role required" },
        },
      },
    },
    "/cron/lifecycle-reminders": {
      get: {
        summary: "Cron-only (Bearer $CRON_SECRET)",
        security: [{ cronAuth: [] as string[] }],
        responses: {
          "200": { description: "Tick" },
          "401": { description: "Bad cron secret" },
        },
      },
    },

    "/openapi": {
      get: {
        summary: "This OpenAPI 3.1 spec",
        security: publicNoAuth,
        responses: { "200": { description: "Spec" } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      cronAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque" },
    },
    schemas: {
      CreateInvoice: {
        type: "object",
        required: ["amountUsdc", "dueAt", "customer", "lineItems"],
        properties: {
          amountUsdc: {
            type: "string",
            description: "Dollars; up to 6 decimal places",
          },
          dueAt: { type: "string", format: "date-time" },
          customer: {
            type: "object",
            required: ["email"],
            properties: {
              email: { type: "string", format: "email" },
              name: { type: "string" },
            },
          },
          lineItems: {
            type: "array",
            items: {
              type: "object",
              required: ["description", "amountUsdc"],
              properties: {
                description: { type: "string" },
                amountUsdc: { type: "string" },
              },
            },
          },
          notesMd: { type: "string" },
          privacyMode: {
            type: "string",
            enum: ["public", "hide_amount", "hide_customer"],
            default: "public",
          },
          // schema was missing splitsHash even though
          // apiSchemas.ts declares it and the route consumes it. SDK
          // consumers couldn't document or wire fee-split invoices.
          splitsHash: {
            type: "string",
            pattern: "^0x[0-9a-fA-F]{64}$",
            description:
              "Optional bytes32 hash of fee-split BPS weights; commits the splits on-chain at acceptAndPay time.",
          },
        },
      },
    },
  },
};

export async function GET() {
  return ok(spec);
}
