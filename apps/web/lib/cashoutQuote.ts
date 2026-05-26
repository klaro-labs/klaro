/**
 * Canonical cashout-quote hash. SINGLE source of truth so the quote endpoint
 * and the create action can't disagree.
 * previously `app/api/v1/cashouts/quotes`
 * and `app/vendor/cashout/actions.computeQuoteHash` packed DIFFERENT fields in
 * DIFFERENT order. A quote returned by the API could never be honoured by the
 * action — but the action wasn't verifying the input hash either, so it
 * silently recomputed a fresh hash and wrote it to the order. Net result: the
 * "quote integrity" claim was unbacked. This module fixes both sides.
 * Hash inputs cover everything that, if changed by a relayer/proxy between
 * the quote and the create call, would change the economics: vendor wallet
 * (so quote can't be swapped to a different recipient), amount in, amount
 * out, currency, klaro fee, LP spread, expiry timestamp.
 */
import { keccak256, encodePacked } from "viem";
import type { Hex } from "./types";

export interface QuoteHashInputs {
  vendor: Hex; // vendor wallet (address), NOT id — binds the quote to the wallet
  usdcAmount: bigint;
  payoutMinor: bigint;
  currency: string;
  klaroFeeUsdc: bigint;
  lpSpreadUsdc: bigint;
  expiresAtSecs: bigint; // unix seconds, NOT milliseconds
}

export function computeQuoteHash(a: QuoteHashInputs): Hex {
  return keccak256(
    encodePacked(
      [
        "address",
        "uint256",
        "uint256",
        "string",
        "uint256",
        "uint256",
        "uint64",
      ],
      [
        a.vendor,
        a.usdcAmount,
        a.payoutMinor,
        a.currency,
        a.klaroFeeUsdc,
        a.lpSpreadUsdc,
        a.expiresAtSecs,
      ],
    ),
  );
}
