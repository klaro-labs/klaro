/**
 * StableFX adapter worker — handles FX execution against Circle's FxEscrow
 * (live with TEST access) or MockStableFXAdapter (default M1).
 * Consumes queue('fx-execute'); writes settlement back to Supabase + emits event.
 */
import { startWorker } from "../queue.js";
import { log } from "../log.js";

export interface FxExecuteJob {
  vendorId: string;
  quoteHash: string;
  src: "USDC" | "EURC" | "USYC";
  dst: "USDC" | "EURC" | "USYC";
  srcAmount: string;
  dstAmount: string;
}

export function startStableFxAdapter() {
  startWorker<FxExecuteJob>(
    "fx-execute",
    async (job) => {
      const { vendorId, src, dst, srcAmount, dstAmount } = job.data;
      log.warn("[SIMULATED] fx.execute.skipped", {
        vendorId,
        src,
        dst,
        srcAmount,
        dstAmount,
        reason: "Circle FxEscrow TEST access pending",
      });
    },
    2,
  );
}
