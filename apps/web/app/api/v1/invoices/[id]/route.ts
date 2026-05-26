import { ok, err, publicErrorMessage } from "@/lib/api";
import { requireVendor } from "@/lib/auth";
import { getInvoice } from "@/lib/repo/invoices";
import { captureError } from "@/lib/sentry";
import type { Hex } from "@/lib/types";

// previous version returned the
// full Invoice — including `customer.email` and `customer.name`. PII
// stripped.
// the route was still public
// (auth-less), so anyone with a 32-byte invoice id could enumerate
// vendor / amount / lineItems / status / metadataHash. Invoice IDs are
// deterministic per (vendor, dueAt, metadataHash) — a partner who
// knows a vendor's id can guess invoice IDs and pull financial line
// items for every invoice. Now requires a vendor session AND verifies
// the invoice's `vendorId` matches the caller. Buyer-facing access to
// the same invoice goes through the `/i/[id]` hosted page (server-
// rendered, no public JSON endpoint needed).
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  // F-4 (web audit): scope try/catch boundaries so a DB error
  // doesn't masquerade as 401 unauthorized. Vendor logs out, re-auths,
  // still fails — debugging hell. Auth errors get 401; everything else
  // is a 500 with the actual error in Sentry.
  let session;
  try {
    session = await requireVendor();
  } catch (e) {
    captureError(e, { route: "api.v1.invoices.GET", phase: "auth" });
    return err(401, publicErrorMessage(e, "unauthorized"));
  }
  try {
    const { id } = await ctx.params;
    const invoice = await getInvoice(id as Hex);
    if (!invoice) return err(404, "invoice_not_found");
    if (invoice.vendorId !== session.vendor.id) {
      return err(404, "invoice_not_found");
    }

    const { customer: _customer, ...rest } = invoice;
    return ok({
      invoice: {
        ...rest,
        customer: {
          hasEmail: Boolean(_customer?.email),
          hasName: Boolean(_customer?.name),
        },
      },
    });
  } catch (e) {
    captureError(e, { route: "api.v1.invoices.GET", phase: "fetch" });
    return err(500, "db_error");
  }
}
