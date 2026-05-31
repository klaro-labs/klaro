import { handle } from "@/lib/api";
import { DisputeOpenReq } from "@/lib/apiSchemas";
import { requireVendor } from "@/lib/auth";
import { keccak256, stringToBytes } from "viem";
import {
  mockGetStream,
  type DisputeContext,
} from "@/lib/mockData";
import * as disputesRepo from "@/lib/repo/disputes";
import { getJob as getAgentJob } from "@/lib/repo/agentJobs";
import { getCashout } from "@/lib/repo/cashouts";
import { dollarsToUSDC } from "@/lib/money";
import type { Hex } from "@/lib/types";

/**
 * Open a dispute. previous version returned
 * a random caseId and never wrote to the repo. Now persists via mockOpenDispute
 * with a deterministic caseId derived from `(vendor, sourceId, ts)` so the
 * same caller can correlate requests across retries.
 * the route used to accept ANY
 * `sourceId` and persist a case with the caller's vendorId as claimant
 * — letting an attacker mass-create disputes against other tenants'
 * cashouts/jobs/streams, poisoning case files cross-tenant. Now the
 * source object is resolved + the underlying record's `vendorId` MUST
 * equal the session vendor before the case is opened.
 */
export const POST = handle(DisputeOpenReq, async (input) => {
  const session = await requireVendor();
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.sourceId)) {
    throw new Error(
      "sourceId must be 0x + 64 hex chars (cashoutId / agentJobId / streamId)",
    );
  }

  // Ownership gate per source type. Anything missing or owned by another
  // tenant is rejected before any state is written.
  // exhaustiveness guard. If a future zod schema author
  // adds a 4th source kind (e.g. "invoice", "agent_job") and forgets
  // to update this file, the new source-type submission previously
  // bypassed every ownership check entirely and wrote a dispute
  // against an arbitrary sourceId. The `_exhaustive: never = source`
  // line forces a TS compile error in that case so the bug is caught
  // at type-check time, not at runtime against a real tenant.
  let respondentKind: "lp" | "system" = "system";
  let respondentId = "system";
  if (input.source === "cashout") {
    const c = await getCashout(input.sourceId as Hex);
    if (!c || c.vendorId !== session.vendor.id) {
      throw new Error("source_not_owned_by_caller");
    }
    if (c.lpId) {
      respondentKind = "lp";
      respondentId = c.lpId;
    }
  } else if (input.source === "agent") {
    const j = await getAgentJob(input.sourceId);
    if (!j || j.vendorId !== session.vendor.id) {
      throw new Error("source_not_owned_by_caller");
    }
  } else if (input.source === "retainer") {
    const s = await mockGetStream(input.sourceId as Hex);
    if (!s || s.vendorId !== session.vendor.id) {
      throw new Error("source_not_owned_by_caller");
    }
  } else {
    const _exhaustive: never = input.source;
    throw new Error(`validation: unknown dispute source ${_exhaustive}`);
  }

  const caseId = keccak256(
    stringToBytes(
      `dispute:${session.vendor.id}:${input.source}:${input.sourceId}:${Date.now()}`,
    ),
  ) as Hex;
  // F-1 (web audit): the DisputeOpenReq schema accepts
  // "retainer" but DisputeContext is "cashout"|"invoice"|"agent"|"stream".
  // Cast-as previously wrote `context: "retainer"` to the mock store,
  // which neither admin/disputes/actions.ts nor lp/disputes/actions.ts
  // matched on — orphan case that nobody could resolve. Map the API's
  // user-facing "retainer" to the internal "stream" context here so
  // the existing schema doesn't break SDK clients while the store
  // gets a value the resolvers actually handle.
  const context: DisputeContext =
    input.source === "retainer" ? "stream" : (input.source as DisputeContext);
  await disputesRepo.openDispute({
    caseId,
    context,
    contextRefId: input.sourceId as Hex,
    vendorId: session.vendor.id,
    claimantLabel: `${session.vendor.displayName} (vendor)`,
    respondentLabel: "Counterparty",
    amountUsdc: dollarsToUSDC(0),
    openingNote: input.evidenceMd,
    openingHash: keccak256(stringToBytes(input.evidenceMd)),
    respondentKind,
    respondentId,
  });
  return {
    dispute: {
      caseId,
      source: input.source,
      sourceId: input.sourceId,
      claimantId: session.vendor.id,
      status: "OPENED",
      openedAt: new Date().toISOString(),
    },
  };
});
