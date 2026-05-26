import { ok, err } from "@/lib/api";
import { getByHash } from "@/lib/repo/receipts";
import type { Hex } from "@/lib/types";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ hash: string }> },
) {
  const { hash } = await ctx.params;
  // Audit fix (loop ): reject malformed input fast — avoids hitting the
  // DB for `?hash=javascript:alert(1)` style probes + saves a round trip.
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return err(400, "invalid_receipt_hash", { expected: "0x + 64 hex chars" });
  }
  const receipt = await getByHash(hash as Hex);
  if (!receipt) return err(404, "receipt_not_found");
  return ok({ receipt });
}
