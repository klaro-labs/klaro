import { handle, ok } from "@/lib/api";
import { CreateInvoice } from "@/lib/apiSchemas";
import { requireVendor, assertVendorWalletProvisioned } from "@/lib/auth";
import { createInvoice, listInvoicesForVendor } from "@/lib/repo/invoices";
import { keccak256, stringToBytes, encodePacked } from "viem";
import { dollarsToUSDC } from "@/lib/money";
import type { Hex } from "@/lib/types";

/** Deterministic invoice id from (vendor, dueAt, nonce). Audit finding #20
 * (2026-05-25): previous code used Math.random() — non-unique under load,
 * uncorrelatable across retries. Stable hash collapses to the same id when
 * the same client retries the same logical request inside one second. */
function nextInvoiceId(
  vendorId: string,
  dueAt: string,
  nonceSeed: string,
): Hex {
  return keccak256(
    encodePacked(["string", "string", "string"], [vendorId, dueAt, nonceSeed]),
  ) as Hex;
}

export async function GET() {
  const session = await requireVendor();
  const invoices = await listInvoicesForVendor(session.vendor.id);
  return ok({ invoices });
}

export const POST = handle(CreateInvoice, async (input) => {
  const session = await requireVendor();
  // without this assert the route
  // wrote `vendorWallet: 0x000…0` (the default in `getSupabaseSession`
  // when `user_metadata.wallet` is unset) into the new invoice — every
  // downstream contract call would then route to the zero address.
  // Matches the existing pattern in vendor/invoices/new/actions.ts.
  const vendorWallet = assertVendorWalletProvisioned(session.vendor);
  const metadataHash = keccak256(
    stringToBytes(
      JSON.stringify({
        customer: input.customer,
        lineItems: input.lineItems,
        notesMd: input.notesMd ?? "",
      }),
    ),
  );
  // Use the metadata hash as the nonce seed so a strict retry (same payload,
  // same dueAt) produces the same invoice id. Different payloads → different ids.
  const id = nextInvoiceId(session.vendor.id, input.dueAt, metadataHash);
  const invoice = await createInvoice({
    id,
    vendorId: session.vendor.id,
    vendorWallet,
    amountUsdc: dollarsToUSDC(parseFloat(input.amountUsdc)),
    token: "0x3600000000000000000000000000000000000000" as Hex,
    dueAt: new Date(input.dueAt),
    customer: input.customer,
    lineItems: input.lineItems.map((l) => ({
      description: l.description,
      amount: dollarsToUSDC(parseFloat(l.amountUsdc)),
    })),
    metadataHash,
    splitsHash: input.splitsHash as Hex | undefined,
    privacyMode: input.privacyMode,
    notesMd: input.notesMd,
  });
  return { invoice };
});
