"use server";

// Intentionally `mockGetInvoice` — this entire action is the simulator-only
// path (see file-level docstring below). Switching to the dual-mode repo
// would silently no-op in live mode because the mutation pattern requires
// the in-memory map. Grandfathered in `noMockInProductionPathsGuard`.
import { mockGetInvoice, mockGetVendor } from "@/lib/mockData";
import { sendSettledEmail } from "@/lib/email";
import { formatUSDC } from "@/lib/money";
import { captureError } from "@/lib/sentry";
import { isLiveOnChain } from "@/lib/arcClient";
import type { Hex } from "@/lib/types";

/**
 * simulatePaymentAction — fake "the buyer paid" for the simulator path.
 * Wired only when `NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS` is unset (the
 * `PayWithUSDC` client component decides). Updates the mock store status
 * + fires the same downstream email the live operator would. Returns a
 * fake tx hash for the success UI.
 * Live mode: this function is never called — the client component runs
 * the real EIP-712 sign + USDC approve + acceptAndPay flow on Arc.
 */
export async function simulatePaymentAction(
  invoiceId: Hex,
  buyer: Hex,
): Promise<Hex> {
  // fail loud if this ever runs in a
  // live-contract environment. The function is supposed to be
  // unreachable when `NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS` is set — the
  // client component routes to the real EIP-712 flow instead. But a
  // client-side regression could send a real buyer here and silently
  // mutate nothing (the mock map doesn't exist in prod RAM). Fail-closed
  // instead so the buyer sees a clear error.
  if (isLiveOnChain()) {
    captureError(
      new Error(
        "simulatePaymentAction reached in live-contract mode - client routing regression",
      ),
      {
        invoiceId,
        buyer,
      },
    );
    throw new Error("simulator_path_unavailable_in_live_mode");
  }
  try {
    const inv = await mockGetInvoice(invoiceId);
    if (!inv) throw new Error("Invoice not found");

    // Mutate the mock record in place.
    inv.status = "SETTLED";
    inv.acceptedBy = buyer;
    inv.acceptedAt = new Date();
    inv.paidTx = ("0x" +
      crypto
        .getRandomValues(new Uint8Array(32))
        .reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")) as Hex;
    inv.settledTx = inv.paidTx;
    inv.receiptHash = invoiceId; // simulator uses invoiceId as the receipt hash so /receipt/[hash] resolves

    // the previous version
    // hardcoded `vendorEmail: "asha@klaro.demo"` — every buyer's "you
    // got paid" email fired to the demo vendor regardless of which
    // vendor actually owned the invoice. In a multi-vendor demo
    // environment this misroutes notifications. Resolve from the
    // invoice's vendorId.
    const vendor = await mockGetVendor(inv.vendorId);
    if (vendor?.email) {
      void sendSettledEmail({
        vendorEmail: vendor.email,
        amount: inv.amount,
        customerName: inv.customer.name ?? inv.customer.email,
        receiptUrl: `https://klaro.so/receipt/${invoiceId}`,
      }).catch((e) =>
        captureError(e, { where: "i.simulatePayment.email", invoiceId }),
      );
    } else {
      captureError(new Error("simulatePayment.vendor_email_missing"), {
        where: "i.simulatePayment",
        invoiceId,
        vendorId: inv.vendorId,
      });
    }

    // [SIMULATOR] trace — kept as Sentry breadcrumb instead of stdout so it
    // shows up in incident traces with the same shape live payments take.
    captureError(new Error("[SIMULATOR] payment landed"), {
      invoiceId,
      amount: formatUSDC(inv.amount),
      buyer,
      severity: "info",
    });

    return inv.paidTx;
  } catch (e) {
    captureError(e, { action: "buyer.simulatePayment", invoiceId, buyer });
    throw e;
  }
}
