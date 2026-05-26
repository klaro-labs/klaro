import { handle } from "@/lib/api";
import { FxQuoteReq } from "@/lib/apiSchemas";
import { requireVendor } from "@/lib/auth";
import { keccak256, encodePacked } from "viem";

const PAIR_RATES: Record<string, number> = {
  "USDC:EURC": 0.92,
  "EURC:USDC": 1.087,
  "USDC:USYC": 1.04,
  "USYC:USDC": 0.961,
};

/** Canonical FX quote hash so a future execute path (Workstream E worker) can
 * refuse mismatched submissions. Audit fix (loop ). Mirrors the
 * `lib/cashoutQuote.ts` pattern. */
function fxQuoteHash(args: {
  src: string;
  dst: string;
  srcAmountStr: string;
  dstAmountStr: string;
  expiresAtSecs: bigint;
}) {
  return keccak256(
    encodePacked(
      ["string", "string", "string", "string", "uint64"],
      [
        args.src,
        args.dst,
        args.srcAmountStr,
        args.dstAmountStr,
        args.expiresAtSecs,
      ],
    ),
  );
}

export const POST = handle(FxQuoteReq, async (input) => {
  // route was anonymous-accessible.
  // Anyone could mass-mint signed `fxQuoteHash` values at the indicative
  // rate, which the planned execute path is supposed to trust. Wrap in
  // `requireVendor()` to mirror the pattern in `cashouts/quotes/route.ts`
  // — quote issuance is now per-authenticated-vendor.
  await requireVendor();
  const key = `${input.src}:${input.dst}`;
  const rate = PAIR_RATES[key];
  if (!rate) throw new Error(`pair_unsupported`);
  const amt = parseFloat(input.amount);
  if (!isFinite(amt) || amt <= 0) throw new Error("amount must be > 0");
  const dstAmount = (amt * rate).toFixed(6);
  const expiresAt = new Date(Date.now() + 120_000);
  const expiresAtSecs = BigInt(Math.floor(expiresAt.getTime() / 1000));
  const quoteHash = fxQuoteHash({
    src: input.src,
    dst: input.dst,
    srcAmountStr: input.amount,
    dstAmountStr: dstAmount,
    expiresAtSecs,
  });
  return {
    quote: {
      quoteHash,
      src: input.src,
      dst: input.dst,
      srcAmount: input.amount,
      dstAmount,
      rate,
      mode: "simulated" as const,
      expiresAt: expiresAt.toISOString(),
    },
  };
});
