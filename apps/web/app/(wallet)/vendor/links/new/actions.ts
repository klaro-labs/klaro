"use server";

import { dollarsToUSDC, assertSafeUSDAmount } from "@/lib/money";
import { requireVendor, assertVendorWalletProvisioned } from "@/lib/auth";
import { createLink } from "@/lib/repo/links";
import { generateSlug } from "@/lib/slugs";
import { getArcPublicClient } from "@/lib/arcClient";
import { LINK_AUTH_EIP712_TYPES, ARC_USDC_ADDRESS } from "@/lib/abi";
import { INVOICE_ESCROW_ADDRESS, ARC_TESTNET_CHAIN_ID } from "@/lib/env";
import { captureError } from "@/lib/sentry";
import type { Hex } from "@/lib/types";

/** The vendor's on-chain link authorization, signed in their wallet client-side
 *  and verified here before storage. Optional in simulator mode (no contracts).*/
export interface LinkAuthInput {
  vendorWallet: Hex;
  linkChainId: Hex; // random bytes32 the auth is bound to
  authDeadline: number; // unix seconds
  vendorAuthSig: Hex;
}

const MAX_AUTH_WINDOW_S = 800 * 24 * 60 * 60; // ~2.2y — comfortably past any link expiry

/**
 * Create a Klaro Link. Vendor-scoped via requireVendor(); the wallet that a
 * future buyer pays is the vendor's provisioned wallet (asserted now so we
 * never mint a link that resolves to the zero address). No customer is known at
 * creation time — the backing invoice is created when someone pays.
 *
 * When contracts are live the vendor must include a LinkInvoiceAuthorization
 * signature, which we verify here (recovers to the vendor's wallet, binds the
 * exact amount/token) before storing. The relayer later presents it to
 * createInvoiceFor at pay time. In simulator mode the signature is skipped.
 * Returns the link id for the post-create redirect.
 */
export async function createLinkAction(input: {
  amountUSD: number;
  label?: string;
  expireDays?: number;
  auth?: LinkAuthInput;
}): Promise<string> {
  const session = await requireVendor();
  const vendorWallet = assertVendorWalletProvisioned(session.vendor);
  assertSafeUSDAmount(input.amountUSD);
  if (input.label && input.label.length > 200) {
    throw new Error("validation_label_too_long");
  }
  let expiresAt: Date | null = null;
  if (input.expireDays != null) {
    if (!Number.isInteger(input.expireDays) || input.expireDays < 1 || input.expireDays > 365) {
      throw new Error("validation_expire_days_out_of_range: 1-365");
    }
    expiresAt = new Date(Date.now() + input.expireDays * 24 * 60 * 60 * 1000);
  }

  try {
    const amountWei = dollarsToUSDC(input.amountUSD);
    const label = input.label?.trim() || null;

    // ─── On-chain authorization (live mode only) ───
    const isLive = Boolean(INVOICE_ESCROW_ADDRESS);
    let linkChainId: Hex | null = null;
    let vendorAuthSig: Hex | null = null;
    let authDeadline: bigint | null = null;

    if (isLive) {
      const a = input.auth;
      if (!a) throw new Error("link_authorization_required");
      if (a.vendorWallet.toLowerCase() !== vendorWallet.toLowerCase()) {
        throw new Error("validation_auth_wallet_mismatch");
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(a.linkChainId)) {
        throw new Error("validation_auth_bad_link_id");
      }
      if (!/^0x[0-9a-fA-F]+$/.test(a.vendorAuthSig)) {
        throw new Error("validation_auth_bad_signature");
      }
      const nowS = Math.floor(Date.now() / 1000);
      if (!Number.isInteger(a.authDeadline) || a.authDeadline < nowS + 60) {
        throw new Error("validation_auth_deadline_too_soon");
      }
      if (a.authDeadline > nowS + MAX_AUTH_WINDOW_S) {
        throw new Error("validation_auth_deadline_too_far");
      }
      if (expiresAt && a.authDeadline < Math.floor(expiresAt.getTime() / 1000)) {
        throw new Error("validation_auth_deadline_before_expiry");
      }

      // Verify the signature recovers to the vendor's wallet over the EXACT
      // terms (EOA + EIP-1271 via the public client). The on-chain
      // createInvoiceFor re-checks this, but rejecting here gives the vendor an
      // immediate, honest error instead of a silent dud link.
      const ok = await getArcPublicClient().verifyTypedData({
        address: vendorWallet as Hex,
        domain: {
          name: "Klaro Invoice",
          version: "1",
          chainId: ARC_TESTNET_CHAIN_ID,
          verifyingContract: INVOICE_ESCROW_ADDRESS as Hex,
        },
        types: LINK_AUTH_EIP712_TYPES,
        primaryType: "LinkInvoiceAuthorization",
        message: {
          vendor: vendorWallet as Hex,
          token: ARC_USDC_ADDRESS,
          amount: amountWei,
          linkId: a.linkChainId,
          authDeadline: BigInt(a.authDeadline),
        },
        signature: a.vendorAuthSig,
      });
      if (!ok) throw new Error("validation_bad_link_authorization");

      linkChainId = a.linkChainId;
      vendorAuthSig = a.vendorAuthSig;
      authDeadline = BigInt(a.authDeadline);
    }

    // Generate slug; retry once on the unique-index collision (vanishingly rare).
    const mk = (slug: string) =>
      createLink({
        vendorId: session.vendor.id,
        slug,
        amountUsdc: amountWei,
        label,
        expiresAt,
        linkChainId,
        vendorAuthSig,
        authDeadline,
      });
    let link;
    try {
      link = await mk(generateSlug());
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!/duplicate|unique|already exists|conflict/i.test(msg)) throw e;
      link = await mk(generateSlug());
    }
    return link.id;
  } catch (e) {
    captureError(e, { action: "link.create", vendorId: session.vendor.id });
    throw e;
  }
}
