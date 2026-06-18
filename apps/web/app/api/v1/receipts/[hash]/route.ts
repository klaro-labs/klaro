import { ok, err } from "@/lib/api";
import { getByHash } from "@/lib/repo/receipts";
import type { Hex } from "@/lib/types";

// Public, read-only receipt verification endpoint — the data source for the
// embeddable receipt-badge + the SDK, which run on THIRD-PARTY origins. Without
// CORS the cross-origin fetch is blocked and the badge can never read 200/404,
// so it falls back to an "error" state on every external site. Receipts are
// public (anchors + hashes, no PII), so `*` is the correct, safe origin.
function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Cache-Control", "public, max-age=60");
  return res;
}

export async function OPTIONS() {
  return cors(new Response(null, { status: 204 }));
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ hash: string }> },
) {
  const { hash } = await ctx.params;
  // Audit fix (loop ): reject malformed input fast — avoids hitting the
  // DB for `?hash=javascript:alert(1)` style probes + saves a round trip.
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return cors(err(400, "invalid_receipt_hash", { expected: "0x + 64 hex chars" }));
  }
  const receipt = await getByHash(hash as Hex);
  if (!receipt) return cors(err(404, "receipt_not_found"));
  return cors(ok({ receipt }));
}
