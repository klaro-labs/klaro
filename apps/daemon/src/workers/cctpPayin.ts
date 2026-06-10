/**
 * cctp-payin worker — completes an inbound cross-chain payment.
 *
 * A buyer burns USDC on a source chain (e.g. Base Sepolia, domain 6) targeting
 * Arc, with the vendor's Arc wallet as mintRecipient. The web app records the
 * burn + enqueues here. This worker fetches Circle's attestation, mints native
 * USDC on Arc (operator-signed — the web app never holds the operator key), and
 * credits the invoice. The funds arrive directly in the vendor's wallet, so the
 * payment is final on mint (no escrow hold / screening leg — that path is for
 * same-chain escrow payments only).
 *
 * Idempotent: the payment_routes row gates re-entry, and the on-chain
 * MessageTransmitterV2 rejects a replayed nonce, so a retry after a successful
 * mint can't double-credit.
 */
import { z } from "zod";
import { keccak256 } from "viem";
import { startWorker } from "../queue.js";
import { sb } from "../db.js";
import { fetchAttestation, receiveOnArc } from "../cctp.js";
import { log } from "../log.js";

export const CCTP_PAYIN_QUEUE = "cctp-payin";

const Job = z.object({
  invoiceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  burnTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  sourceDomain: z.number().int().nonnegative(),
});
export type CctpPayinJob = z.infer<typeof Job>;

async function handle(payload: unknown): Promise<void> {
  const { invoiceId, burnTxHash, sourceDomain } = Job.parse(payload);
  const db = sb();

  const { data: route } = await db
    .from("payment_routes")
    .select("id,state")
    .eq("invoice_id", invoiceId)
    .eq("source_tx_hash", burnTxHash)
    .maybeSingle();
  if (route?.state === "settled") {
    log.info("cctp.payin.already_settled", { invoiceId, burnTxHash });
    return;
  }
  const routeId = route?.id;
  const setState = (state: string, patch: Record<string, unknown> = {}) =>
    routeId
      ? db.from("payment_routes").update({ state, ...patch }).eq("id", routeId)
      : Promise.resolve();

  // 1) Wait for Circle's attestation of the source-chain burn.
  await setState("attesting");
  const att = await fetchAttestation(sourceDomain, burnTxHash, { timeoutMs: 300_000 });
  if (!att) throw new Error(`cctp_payin_attestation_timeout: ${burnTxHash}`);

  // 2) Mint native USDC on Arc to the recipient fixed in the burn (the vendor).
  await setState("minting", { attestation_hash: keccak256(att.message) });
  const mintTx = await receiveOnArc(att.message, att.attestation);

  // 3) Credit the invoice + settle the route. Funds are already with the vendor.
  await db.from("invoices").update({ status: "PAID", paid_tx_hash: mintTx }).eq("id", invoiceId);
  await setState("settled", { arc_tx_hash: mintTx, settled_at: new Date().toISOString() });
  log.info("cctp.payin.settled", { invoiceId, burnTxHash, mintTx, sourceDomain });
}

export function startCctpPayin() {
  return startWorker(CCTP_PAYIN_QUEUE, async (job) => handle(job.data), 2);
}
