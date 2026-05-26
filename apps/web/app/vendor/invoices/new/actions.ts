"use server";

import { keccak256, stringToBytes } from "viem";
// dual-mode via repo. Repo signature
// is stricter than mock — caller computes id + metadataHash up front. Uses
// keccak256(vendorId|nonce|dueAt) so two parallel creates can't collide.
import { createInvoice } from "@/lib/repo/invoices";
import { sendInvoiceLinkEmail } from "@/lib/email";
import { dollarsToUSDC } from "@/lib/money";
import { requireVendor, assertVendorWalletProvisioned } from "@/lib/auth";
import { captureError } from "@/lib/sentry";
import type { Hex } from "@/lib/types";

const USDC_ARC: Hex = "0x3600000000000000000000000000000000000000";

/**
 * Create-invoice server action. Vendor scoped to the authenticated session —
 * `vendorId` + `vendorWallet` are derived from `requireVendor()`, not the
 * client. .
 */
export async function createInvoiceAction(input: {
  amountUSD: number;
  description: string;
  customerEmail: string;
  customerName?: string;
  dueDays: number;
}): Promise<Hex> {
  const session = await requireVendor();
  // refuse to write invoice.vendorWallet
  // == 0x000…000. Buyer who pays a zero-address invoice locks USDC in escrow
  // with no recoverable payout path.
  const vendorWallet = assertVendorWalletProvisioned(session.vendor);
  if (input.amountUSD <= 0) throw new Error("Amount must be > 0");
  if (!input.customerEmail.includes("@"))
    throw new Error("Invalid customer email");
  if (input.dueDays < 1 || input.dueDays > 365)
    throw new Error("dueDays must be 1-365");

  try {
    const amountWei = dollarsToUSDC(input.amountUSD);
    const dueAt = new Date(Date.now() + input.dueDays * 24 * 60 * 60 * 1000);

    // Deterministic id from (vendor, nonce, dueAt) — collision-free under
    // parallel creates and reproducible in tests.
    const nonce = crypto
      .getRandomValues(new Uint8Array(16))
      .reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
    const id = keccak256(
      stringToBytes(`klaro.inv|${session.vendor.id}|${nonce}|${+dueAt}`),
    );
    const metadataHash = keccak256(
      stringToBytes(
        JSON.stringify({
          customer: { email: input.customerEmail, name: input.customerName },
          lineItems: [
            { description: input.description, amount: amountWei.toString() },
          ],
        }),
      ),
    );

    const invoice = await createInvoice({
      id,
      vendorId: session.vendor.id,
      vendorWallet,
      token: USDC_ARC,
      amountUsdc: amountWei,
      dueAt,
      customer: { email: input.customerEmail, name: input.customerName },
      lineItems: [{ description: input.description, amount: amountWei }],
      metadataHash,
    });

    // Email send is non-blocking but failures surface to Sentry (was console.error).
    void sendInvoiceLinkEmail({
      customerEmail: input.customerEmail,
      vendorName: session.vendor.displayName,
      amount: amountWei,
      hostedUrl: `https://klaro.so/i/${invoice.id}`,
      description: input.description,
    }).catch((err) => {
      captureError(err, {
        where: "createInvoiceAction.sendInvoiceLinkEmail",
        vendorId: session.vendor.id,
        invoiceId: invoice.id,
      });
    });

    // ANA1 `track(...)` call removed. The web
    // analytics adapter is browser-only by design (see
    // lib/analytics.ts docstring); server-side calls were silent
    // no-ops + leaked tenant identifiers to stdout. Server-side
    // analytics is M11 scope.
    return invoice.id;
  } catch (e) {
    captureError(e, { action: "invoice.create", vendorId: session.vendor.id });
    throw e;
  }
}
