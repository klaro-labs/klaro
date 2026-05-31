/**
 * Pure dispute→escrow routing policy (no I/O — unit-tested in isolation).
 * Decides, from a decided dispute's (source, outcome), whether the daemon
 * resolves it on a specific escrow, defers to a human, or skips. Kept separate
 * from disputeResolver.ts (which does the chain/DB work) so the policy is
 * verifiable without mocking redis/arc/supabase.
 */

export type ResolvePlan =
  | { action: "resolve"; target: "agent" | "cashout" | "stream" }
  | { action: "manual"; reason: string }
  | { action: "skip"; reason: string };

// Only these two outcomes are deterministic from on-chain truth — each escrow's
// resolveDispute re-derives them, so the daemon supplies no policy number it
// could get wrong. SLASH_LP / PENALIZE_VENDOR need an operator-set amount;
// MUTUAL_RESOLVED has no escrow transfer.
const DETERMINISTIC = new Set(["RELEASE_TO_CLAIMANT", "REFUND_TO_RESPONDENT"]);

export function planDisputeResolution(
  source: string | null,
  outcome: string | null,
): ResolvePlan {
  if (outcome === "SLASH_LP")
    return {
      action: "manual",
      reason:
        "SLASH_LP needs an operator-set slash amount (no on-chain default)",
    };
  if (outcome === "PENALIZE_VENDOR")
    return {
      action: "manual",
      reason:
        "PENALIZE_VENDOR needs an operator-set penalty (no on-chain default)",
    };
  if (outcome === "MUTUAL_RESOLVED")
    return {
      action: "skip",
      reason: "mutual settlement — no escrow transfer to execute",
    };
  if (!outcome || !DETERMINISTIC.has(outcome))
    return {
      action: "skip",
      reason: `outcome '${outcome ?? "unknown"}' not auto-resolvable`,
    };

  const s = (source ?? "").toLowerCase();
  if (s === "agent") return { action: "resolve", target: "agent" };
  if (s === "cashout") return { action: "resolve", target: "cashout" };
  if (s === "stream") return { action: "resolve", target: "stream" };
  if (s === "invoice")
    return {
      action: "manual",
      reason:
        "invoice disputes settle via RefundProtocol, not an escrow resolveDispute",
    };
  return { action: "skip", reason: `unknown dispute source '${source}'` };
}
