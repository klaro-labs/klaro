import { NextRequest } from "next/server";
import { z } from "zod";
import { serviceDb } from "@/lib/db";
import { getPublicInvoice } from "@/lib/repo/invoices";
import { createQueue } from "@/lib/queue";
import type { Hex } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Complete an inbound cross-chain payment. The buyer has already burned USDC on
 * a source chain (CCTP V2) targeting Arc with the vendor's wallet as recipient;
 * this records the route and enqueues the operator daemon to fetch the Circle
 * attestation, mint on Arc, and credit the invoice. Public, like the pay page:
 * the burn fixed the mint recipient on-chain, so a caller cannot redirect funds
 * — the worst case is triggering settlement of a real burn, the intended path.
 */
const Body = z.object({
  invoiceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  burnTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  sourceChain: z.enum(["base"]).default("base"),
});
const DOMAIN: Record<string, number> = { base: 6 };

/** Poll the cross-chain payment state for an invoice (buyer checkout uses this
 *  to flip to "paid" once the daemon mints on Arc). */
export async function GET(req: NextRequest) {
  const invoiceId = new URL(req.url).searchParams.get("invoiceId");
  if (!invoiceId || !/^0x[0-9a-fA-F]{64}$/.test(invoiceId)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const db = serviceDb();
  const { data } = await db
    .from("payment_routes")
    .select("state,state_detail,arc_tx_hash,source_tx_hash")
    .eq("invoice_id", invoiceId)
    .eq("route_kind", "cctp-v2")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const inv = await getPublicInvoice(invoiceId as Hex);
  return Response.json({
    state: data?.state ?? "none",
    arcTxHash: data?.arc_tx_hash ?? null,
    sourceTxHash: data?.source_tx_hash ?? null,
    invoiceStatus: inv?.status ?? null,
  });
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { invoiceId, burnTxHash, sourceChain } = body;

  const invoice = await getPublicInvoice(invoiceId as Hex);
  if (!invoice) return Response.json({ error: "invoice_not_found" }, { status: 404 });
  if (invoice.status === "PAID" || invoice.status === "SETTLED") {
    return Response.json({ error: "already_paid" }, { status: 409 });
  }

  const db = serviceDb();
  const { data: existing } = await db
    .from("payment_routes")
    .select("id,state")
    .eq("invoice_id", invoiceId)
    .eq("source_tx_hash", burnTxHash)
    .maybeSingle();
  if (!existing) {
    await db.from("payment_routes").insert({
      invoice_id: invoiceId,
      route_kind: "cctp-v2",
      source_chain: sourceChain,
      destination_chain: "arc",
      source_tx_hash: burnTxHash,
      state: "attesting",
    });
  } else if (existing.state === "settled") {
    return Response.json({ error: "already_paid" }, { status: 409 });
  }

  const payinQueue = createQueue<{ invoiceId: string; burnTxHash: string; sourceDomain: number }>(
    "cctp-payin",
    async () => {
      // Inline (no-Redis) mode can't run this: minting is operator-signed and
      // the web app never holds the operator key. Requires the daemon.
      throw new Error("cctp-payin requires the operator daemon");
    },
  );
  await payinQueue.enqueue(
    { invoiceId, burnTxHash, sourceDomain: DOMAIN[sourceChain] },
    { idempotencyKey: `cctp-payin:${burnTxHash}` },
  );

  return Response.json({ ok: true, state: "attesting" });
}
