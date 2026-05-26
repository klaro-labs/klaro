/**
 * x402 nanopayments adapter. v2 §28 + -93.
 * **Wraps** Circle's `@circle-fin/x402-batching/server`. Sellers (resource
 * routes like `/api/agents/[id]/call`) call `requirePayment()` at the top
 * of the handler; if the request lacks a valid `Payment-Signature` header
 * it returns a `402 Payment Required` with the Klaro-side payment options.
 * Adapter pattern per :
 * - X402_ENABLED=1 + valid Gateway facilitator → live `BatchFacilitatorClient`
 * - otherwise → mock 402 negotiation (lets the buyer-side demo render the
 * full flow without a funded Gateway Wallet balance)
 * Scheme: EIP-3009 `TransferWithAuthorization` signed against the
 * `GatewayWalletBatched` domain (verified iter session 2026-05-24 via
 * Circle MCP). Signatures are zero-gas to the buyer — Klaro pays gas via
 * batched settlement on the seller side.
 */

import { X402_FACILITATOR_URL, x402Live, KLARO_FEE_RECEIVER } from "./env";
import { captureError } from "./sentry";

export interface PaymentRequirements {
  scheme: "exact-gateway-batched" | "exact-onchain";
  network: "eip155:5042002"; // Arc testnet
  recipient: string; // Klaro fee receiver wallet
  asset: string; // USDC ERC-20 on Arc
  maxAmountRequired: string; // 6-dec USDC units
  description: string;
  resource: string;
  facilitator: string;
  extra?: { name?: string };
}

export interface PaymentVerification {
  ok: boolean;
  mode: "live" | "mock";
  paidAmountUsdc?: bigint;
  txOrAuthHash?: string;
  reason?: string;
}

/** Build the canonical 402 body Klaro returns when payment is required. */
export function build402Body(
  priceUsdc: bigint,
  resource: string,
  description: string,
): { accepts: PaymentRequirements[] } {
  // previously hardcoded the zero
  // address. In live mode (X402_ENABLED=1) every paid call would burn USDC
  // to 0x0…0. Now reads from env and refuses to build a live 402 without it.
  const recipient =
    KLARO_FEE_RECEIVER ?? "0x0000000000000000000000000000000000000000";
  const asset = "0x3600000000000000000000000000000000000000"; // USDC ERC-20 on Arc
  return {
    accepts: [
      {
        scheme: "exact-gateway-batched",
        network: "eip155:5042002",
        recipient,
        asset,
        maxAmountRequired: priceUsdc.toString(),
        description,
        resource,
        facilitator: X402_FACILITATOR_URL,
        extra: { name: "GatewayWalletBatched" },
      },
      {
        scheme: "exact-onchain",
        network: "eip155:5042002",
        recipient,
        asset,
        maxAmountRequired: priceUsdc.toString(),
        description,
        resource,
        facilitator: X402_FACILITATOR_URL,
      },
    ],
  };
}

/** Inspect the `Payment-Signature` header from an x402 request.
 * previously the live path constructed a
 * `BatchFacilitatorClient` then discarded it and returned `ok: true` —
 * any header value let an agent call paid endpoints for free. The live
 * path now calls `client.verify(payload, requirements)` and propagates
 * `isValid`. Failures fail-closed (no fallback to mock).
 * the `requirements` arg used to
 * be a single value picked by the caller — but `build402Body` advertises
 * multiple schemes (gateway-batched + on-chain). Callers that handed in
 * only `accepts[0]` made the second advertised scheme unusable: a payer
 * signing the `exact-onchain` payload would have it verified against
 * `exact-gateway-batched` requirements and the facilitator would reject
 * on scheme mismatch. Now accepts the full list and matches by the
 * payload's `scheme` field.
 */
export async function verifyPaymentHeader(
  rawHeader: string | null,
  requirementsOrList: PaymentRequirements | PaymentRequirements[],
): Promise<PaymentVerification> {
  const requirementsList: PaymentRequirements[] = Array.isArray(
    requirementsOrList,
  )
    ? requirementsOrList
    : [requirementsOrList];
  if (!rawHeader) {
    return {
      ok: false,
      mode: x402Live() ? "live" : "mock",
      reason: "no Payment-Signature header",
    };
  }

  // Decode the base64 PaymentPayload. Used by both mock + live paths.
  let payload: {
    x402Version?: number;
    scheme?: string;
    payload?: Record<string, unknown>;
    accepted?: { maxAmountRequired?: string; scheme?: string };
  };
  try {
    payload = JSON.parse(Buffer.from(rawHeader, "base64").toString());
  } catch {
    return {
      ok: false,
      mode: x402Live() ? "live" : "mock",
      reason: "header is not base64-encoded JSON",
    };
  }

  // Pick the requirements entry whose scheme matches what the payer signed.
  // The payload's scheme may surface at the top level (canonical x402 spec)
  // or inside `accepted` (legacy/preview shape). Default to the first
  // advertised scheme when the payer didn't say.
  const signedScheme = payload.scheme ?? payload.accepted?.scheme;
  const requirements =
    requirementsList.find((r) => r.scheme === signedScheme) ??
    requirementsList[0];

  if (!x402Live()) {
    return {
      ok: true,
      mode: "mock",
      paidAmountUsdc: BigInt(payload?.accepted?.maxAmountRequired ?? 0),
      txOrAuthHash: "mock-auth-" + Math.random().toString(36).slice(2, 10),
    };
  }

  // Live: hand the decoded payload + requirements to the Circle facilitator.
  // Adapter shape matches `@circle-fin/x402-batching/server` Payment{Payload,Requirements}.
  try {
    const { BatchFacilitatorClient } =
      await import("@circle-fin/x402-batching/server");
    const client = new BatchFacilitatorClient({ url: X402_FACILITATOR_URL });
    const facilitatorReq = {
      scheme: requirements.scheme,
      network: requirements.network,
      asset: requirements.asset,
      amount: requirements.maxAmountRequired,
      payTo: requirements.recipient,
      maxTimeoutSeconds: 60,
      extra: requirements.extra,
    };
    const facilitatorPayload = {
      x402Version: payload.x402Version ?? 1,
      payload:
        payload.payload ?? (payload as unknown as Record<string, unknown>),
    };
    const verify = await client.verify(facilitatorPayload, facilitatorReq);
    if (!verify.isValid) {
      return {
        ok: false,
        mode: "live",
        reason: verify.invalidReason ?? "facilitator rejected signature",
      };
    }
    return {
      ok: true,
      mode: "live",
      paidAmountUsdc: BigInt(requirements.maxAmountRequired),
      txOrAuthHash: verify.payer ?? "live-verified",
    };
  } catch (e) {
    // Fail-closed — never silently degrade live → mock.
    captureError(e, { where: "x402.verifyPaymentHeader.live" });
    return {
      ok: false,
      mode: "live",
      reason: `live-verify error: ${(e as Error).message}`,
    };
  }
}

/** Convenience helper: returns a 402 Response when payment header missing,
 * null when verified. Sellers use it at the top of their resource route. */
export async function requirePayment(
  req: Request,
  opts: {
    priceUsdc: bigint;
    resource: string;
    description: string;
  },
): Promise<Response | PaymentVerification> {
  // Fail-closed: live mode without a configured fee receiver would otherwise
  // build a 402 advertising 0x000…000 as the recipient. Refuse the request
  // entirely so no payer can sign authorization for a zero-address transfer.
  if (x402Live() && !KLARO_FEE_RECEIVER) {
    captureError(
      new Error("x402.requirePayment: KLARO_FEE_RECEIVER unset in live mode"),
    );
    return new Response(
      JSON.stringify({ error: "fee_receiver_not_configured" }),
      {
        status: 503,
        headers: { "content-type": "application/json" },
      },
    );
  }
  const sig = req.headers.get("payment-signature");
  const body = build402Body(opts.priceUsdc, opts.resource, opts.description);
  // pass ALL accepted requirements; verifier picks the one
  // matching the payer's signed scheme. Was hard-coded to `accepts[0]`,
  // which silently broke the on-chain fallback path.
  const verification = await verifyPaymentHeader(sig, body.accepts);
  if (!verification.ok) {
    return new Response(
      JSON.stringify({ ...body, reason: verification.reason }),
      {
        status: 402,
        headers: {
          "content-type": "application/json",
          "payment-required": Buffer.from(JSON.stringify(body)).toString(
            "base64",
          ),
        },
      },
    );
  }
  return verification;
}
