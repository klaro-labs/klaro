"use server";

// dual-mode via repo so live Supabase
// path is exercised; previously mock-only. Money-flow critical surface.
import { createCashout, advanceCashout, getCashout } from "@/lib/repo/cashouts";
import { mockOpenDispute } from "@/lib/mockData";
import { getCorridor } from "@/lib/corridors";
import { requireVendor, assertVendorWalletProvisioned } from "@/lib/auth";
import { captureError } from "@/lib/sentry";
import { computeQuoteHash } from "@/lib/cashoutQuote";
import { parseSafeUsdcBigint } from "@/lib/money";
import { quoteCashout } from "@/lib/corridors";
import { isLiveOnChain } from "@/lib/arcClient";
import { supabaseLive } from "@/lib/env";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { keccak256, stringToBytes } from "viem";
import type { Hex } from "@/lib/types";

/**
 * Cashout flow. Live path (M11+) calls `CashoutOrderProcessor.requestAndLock`
 * + the operator daemon advances state from Arc events. Until then a
 * cashout-advance worker (see lib/queue.ts) handles the same transitions
 * via a real queue, not a server-action setTimeout (which doesn't survive
 * serverless invocation boundaries — ).
 */

interface Input {
  usdcAmount: string; // bigint string
  payoutMinor: string; // bigint string
  currency: string;
  klaroFeeUsdc: string;
  lpSpreadUsdc: string;
  quoteRate: number;
  quoteExpiresAtIso: string;
  /** When set, action verifies the recomputed hash matches before persisting. */
  expectedQuoteHash?: Hex;
}

// hash computation moved to
// `lib/cashoutQuote.ts` so the quotes API + this action can't disagree on
// what a quote means. The action now also verifies the client-supplied
// `quoteHash` matches the recomputed one — without this, a partner could
// craft any quote params and submit.

export async function createCashoutAction(input: Input): Promise<Hex> {
  // F-4 (web audit): rename throw to match 's
  // `_not_yet_(available|persistent|live)` classifier so live-mode SDK
  // clients receive a 503 (deferred) instead of a 500 (server crash).
  if (supabaseLive() || isLiveOnChain()) {
    throw new Error(
      "cashout_submission_not_yet_live: vendor-signing flow lands M11; simulator writes are disabled in live mode",
    );
  }
  const session = await requireVendor();
  const vendorWallet = assertVendorWalletProvisioned(session.vendor);

  const cor = getCorridor(input.currency);
  if (!cor) throw new Error(`Unknown corridor ${input.currency}`);

  // QA-050: centralised raw-USDC bigint parsing in lib/money.ts:
  // parseSafeUsdcBigint handles the BigInt(Infinity)-throws + negative
  // bigint defects in one place so future amount-handling code can't
  // miss either.
  const usdcAmount = parseSafeUsdcBigint(input.usdcAmount);

  const expiresAt = new Date(input.quoteExpiresAtIso);
  if (Number.isNaN(+expiresAt) || expiresAt < new Date()) {
    throw new Error("quote expired — request a fresh quote");
  }

  const quoteHash = computeQuoteHash({
    vendor: vendorWallet,
    usdcAmount,
    payoutMinor: BigInt(input.payoutMinor),
    currency: input.currency,
    klaroFeeUsdc: BigInt(input.klaroFeeUsdc),
    lpSpreadUsdc: BigInt(input.lpSpreadUsdc),
    expiresAtSecs: BigInt(Math.floor(+expiresAt / 1000)),
  });

  // Audit fix (loop ): when the caller supplies the hash it negotiated
  // at quote time, refuse to proceed if it doesn't match what we just recomputed.
  // The /api/v1/cashouts route forwards it; the UI doesn't strictly need to, but
  // doing so removes the partner-tampering vector.
  if (
    input.expectedQuoteHash &&
    input.expectedQuoteHash.toLowerCase() !== quoteHash.toLowerCase()
  ) {
    throw new Error(
      "quote_hash_mismatch: client-supplied hash does not match recomputed value",
    );
  }

  const order = await createCashout({
    vendorId: session.vendor.id,
    vendorWallet,
    usdcAmount,
    payoutMinor: BigInt(input.payoutMinor),
    currency: input.currency,
    klaroFeeUsdc: BigInt(input.klaroFeeUsdc),
    lpSpreadUsdc: BigInt(input.lpSpreadUsdc),
    quoteRate: input.quoteRate,
    quoteHash,
    quoteExpiresAt: expiresAt,
  });

  // Schedule the simulator advance through the real queue so serverless invocation
  // doesn't kill the in-flight setTimeout. The cashout-advance worker (live in M11
  // Phase B daemon) processes these jobs with idempotency + retry.
  // queue name was "cashout-advancer" (with trailing r) —
  // daemon registers worker on "cashout-advance" (no r). Inconsistency
  // was hidden because createCashoutAction throws in live mode (line 46),
  // so this enqueue only runs in mock mode where the inline createQueue
  // also registers the worker on the same name. Renamed to match the
  // daemon's canonical name so a future live-mode wire-up (which would
  // be the same defect class as for the `release` branch)
  // doesn't fall into an orphan queue.
  try {
    const { createQueue } = await import("@/lib/queue");
    const advancer = createQueue<{ orderId: Hex }>(
      "cashout-advance",
      async (job) => {
        const o = await getCashout(job.orderId);
        if (!o || o.status !== "LOCKED") return;
        await advanceCashout(
          job.orderId,
          "CLAIMED",
          {
            kind: "lp_assigned",
            at: new Date(),
            detail: "Demo LP assigned · Aakash · LP3",
          },
          { lpId: "lp-aakash", lpName: "Aakash · LP3" },
        );
        const utr = "UTR" + Math.floor(Math.random() * 1e10).toString();
        await advanceCashout(
          job.orderId,
          "PROOF_SUBMITTED",
          {
            kind: "proof_submitted",
            at: new Date(),
            detail: `Demo proof submitted · ${utr}`,
          },
          { utrReference: utr, proofHash: quoteHash },
        );
      },
    );
    await advancer.enqueue(
      { orderId: order.id },
      { idempotencyKey: `cashout-advance:${order.id}` },
    );
  } catch (e) {
    captureError(e, {
      where: "createCashoutAction.advancer.enqueue",
      orderId: order.id,
    });
  }

  // ANA1 `track(...)` call removed.
  // analytics.ts is browser-only by design; server-side track was a
  // no-op + leaked tenant identifiers. Server-side analytics is M11.
  return order.id;
}

export async function createMobileCashoutAction(): Promise<void> {
  const quote = quoteCashout(2_400_000_000n, "INR");
  if (!quote) throw new Error("INR cashout quote is unavailable.");
  await createCashoutAction({
    usdcAmount: quote.usdcAmount.toString(),
    payoutMinor: quote.payoutMinor.toString(),
    currency: quote.corridor.currency,
    klaroFeeUsdc: quote.klaroFeeUsdc.toString(),
    lpSpreadUsdc: quote.lpSpreadUsdc.toString(),
    quoteRate: quote.corridor.rate,
    quoteExpiresAtIso: quote.expiresAt.toISOString(),
  });
  redirect("/vendor/cashout");
}

export async function confirmReceivedAction(id: Hex): Promise<void> {
  // previously threw in live mode. The daemon's
  // `cashout-advance:release` branch was wired to sign confirmReceived
  // on-chain via the operator wallet but had ZERO producers
  // — both web actions threw and arcSubscriber never enqueued it,
  // making the release path completely dead in live mode. Vendor's
  // USDC would stay stuck in escrow forever. The operator-signs-on-
  // behalf model matches the rest of the daemon's design (SMB vendors
  // don't have their own signing infra). Now wire the daemon enqueue:
  // mock mode flips DB directly via advanceCashout (legacy demo path);
  // live mode enqueues to daemon which signs + flips + notifies LP.
  const session = await requireVendor();
  const order = await getCashout(id);
  if (!order || order.vendorId !== session.vendor.id) {
    throw new Error("cashout not found in your tenant");
  }
  if (order.status !== "PROOF_SUBMITTED") {
    throw new Error("cashout is not waiting for receipt confirmation");
  }

  if (supabaseLive() || isLiveOnChain()) {
    // Live: hand off to daemon. confirmReceivedAction is the sole
    // producer for cashout-advance:release in live mode. Deterministic
    // jobId so an accidental double-press collapses; daemon worker
    // is also idempotent (skips when DB already RELEASED).
    const { createQueue } = await import("@/lib/queue");
    const releaseQueue = createQueue<{ orderId: Hex; kind: "release" }>(
      "cashout-advance",
      // Inline worker is a no-op stub; the real worker lives in
      // apps/daemon/src/workers/cashoutAdvancer.ts. Inline-mode
      // callers (dev without REDIS_URL) shouldn't reach this code
      // path since supabaseLive() would be false; if they do, the
      // stub keeps the action observable.
      async () => {},
    );
    await releaseQueue.enqueue(
      { orderId: id, kind: "release" },
      { idempotencyKey: `cashout-advance:release:${id}` },
    );
    revalidatePath("/vendor/cashout");
    revalidatePath(`/vendor/cashout/${id}`);
    return;
  }

  // Mock mode: legacy direct DB advance for the simulator demo path.
  const advanced = await advanceCashout(
    id,
    "RELEASED",
    {
      kind: "confirmed",
      at: new Date(),
      detail: "Vendor completed simulated payout outcome",
    },
    undefined,
    "PROOF_SUBMITTED",
  );
  if (!advanced) {
    const fresh = await getCashout(id);
    throw new Error(
      `cashout state changed (now ${fresh?.status ?? "unknown"}) — refresh + retry`,
    );
  }
  revalidatePath("/vendor/cashout");
  revalidatePath(`/vendor/cashout/${id}`);
}

export async function openDisputeAction(id: Hex): Promise<void> {
  if (supabaseLive() || isLiveOnChain()) {
    throw new Error(
      "Live dispute opening requires an onchain transaction; simulator writes are disabled in live mode.",
    );
  }
  const session = await requireVendor();
  const order = await getCashout(id);
  if (!order || order.vendorId !== session.vendor.id) {
    throw new Error("cashout not found in your tenant");
  }
  if (order.status !== "PROOF_SUBMITTED" && order.status !== "CLAIMED") {
    throw new Error("cashout cannot be disputed from its current status");
  }
  const openingNote =
    "Vendor reports that the simulated local-currency payout has not arrived. Demo state remains unresolved for admin review.";
  const caseId = keccak256(
    stringToBytes(`cashout-dispute:${id}:${Date.now()}`),
  );
  const priorStatus = order.status;
  const advanced = await advanceCashout(
    id,
    "DISPUTED",
    {
      kind: "disputed",
      at: new Date(),
      detail: "Demo dispute opened by vendor · pending admin review",
    },
    undefined,
    priorStatus,
  );
  if (!advanced) {
    const fresh = await getCashout(id);
    throw new Error(
      `cashout state changed (now ${fresh?.status ?? "unknown"}) — refresh + retry`,
    );
  }
  await mockOpenDispute({
    caseId,
    context: "cashout",
    contextRefId: id,
    vendorId: session.vendor.id,
    claimantLabel: `${session.vendor.displayName} (vendor)`,
    respondentLabel: order.lpName ?? "Assigned payout partner",
    amountUsdc: order.usdcAmount,
    openingNote,
    openingHash: keccak256(stringToBytes(openingNote)),
  });
  revalidatePath("/vendor/cashout");
  revalidatePath(`/vendor/cashout/${id}`);
  revalidatePath("/vendor/disputes");
  revalidatePath("/admin/disputes");
  // end of the dead-end UX. Vendor lands on the case page where
  // they can add evidence + see admin status, not back at the cashout
  // list with no obvious next step.
  redirect(`/vendor/disputes/${caseId}`);
}
