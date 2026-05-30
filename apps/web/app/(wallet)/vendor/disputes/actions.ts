"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { keccak256, toBytes } from "viem";
import { z } from "zod";
import {
  mockGetAgentJob,
  mockGetStream,
} from "@/lib/mockData";
import * as disputesRepo from "@/lib/repo/disputes";
import { getCashout } from "@/lib/repo/cashouts";
import { getInvoice } from "@/lib/repo/invoices";
import { requireVendor } from "@/lib/auth";
import { dollarsToUSDC, assertSafeUSDAmount } from "@/lib/money";
import { captureError } from "@/lib/sentry";
import type { Hex } from "@/lib/types";

// FormData `context` was cast straight to DisputeContext,
// so a posted `context="trolling"` persisted a case with garbage context.
// Downstream branches in admin/disputes + lp/disputes only match
// `context === "cashout"` — garbage cases became orphans the admin
// decide path silently skipped and LP defend path rejected. Storage
// grief + operator confusion. Same class as W77-1/2 / RCF1.
const DISPUTE_CONTEXT = z.enum(["cashout", "invoice", "agent", "stream"]);

/// `_hash` used to be a
/// pad-and-truncate sham (`(input + "0".repeat(64)).slice(0, 64)`) that
/// was not a digest — two notes sharing a prefix collided on caseId +
/// evidenceHash. Same broken pattern was already fixed in
/// `lp/disputes/actions.ts` . Switched to real keccak256.
function _hash(input: string): Hex {
  return keccak256(toBytes(input));
}

export async function openDisputeAction(formData: FormData): Promise<void> {
  const session = await requireVendor();
  let caseId: Hex | null = null;
  try {
    const context = DISPUTE_CONTEXT.parse(formData.get("context") ?? "cashout");
    const contextRefId = String(formData.get("contextRefId") ?? "") as Hex;
    const respondentLabel = String(
      formData.get("respondentLabel") ?? "Counterparty",
    );
    const amount = Number(formData.get("amount") ?? 0);
    const note = String(formData.get("note") ?? "");
    if (!contextRefId.startsWith("0x") || contextRefId.length !== 66)
      throw new Error("contextRefId must be 0x + 64 hex");
    assertSafeUSDAmount(amount); // QA-052: shared validator family.
    if (note.length < 20)
      throw new Error("opening note must explain what happened (≥ 20 chars)");

    // previously vendor A could POST contextRefId =
    // <vendor B's cashout/invoice/agent/stream id> and the action
    // persisted a poisoned case file with A as claimant against B's
    // record. The API path closed this (`/api/v1/disputes`)
    // but the server-action behind `/vendor/disputes` form was never
    // updated. Same defect class as cross-tenant detail-page
    // reads. Resolve source by context + verify caller owns it.
    let sourceVendorId: string | null = null;
    let respondentKind: "lp" | "system" = "system";
    let respondentId = "system";
    if (context === "cashout") {
      const co = await getCashout(contextRefId);
      sourceVendorId = co?.vendorId ?? null;
      if (co?.lpId) {
        respondentKind = "lp";
        respondentId = co.lpId;
      }
    } else if (context === "invoice") {
      const inv = await getInvoice(contextRefId);
      sourceVendorId = inv?.vendorId ?? null;
    } else if (context === "agent") {
      const aj = await mockGetAgentJob(contextRefId);
      sourceVendorId = aj?.vendorId ?? null;
    } else if (context === "stream") {
      const st = await mockGetStream(contextRefId);
      sourceVendorId = st?.vendorId ?? null;
    }
    if (!sourceVendorId) throw new Error("contextRefId not found");
    if (sourceVendorId !== session.vendor.id) {
      throw new Error("source record belongs to a different vendor");
    }

    caseId = _hash(`dispute-${contextRefId}-${Date.now()}`);
    await disputesRepo.openDispute({
      caseId,
      context,
      contextRefId,
      vendorId: session.vendor.id,
      claimantLabel: `${session.vendor.displayName} (vendor)`,
      respondentLabel,
      amountUsdc: dollarsToUSDC(amount),
      openingNote: note,
      openingHash: _hash(note),
      respondentKind,
      respondentId,
    });
    revalidatePath("/vendor/disputes");
    revalidatePath("/admin/disputes");
  } catch (e) {
    captureError(e, { action: "dispute.open", vendorId: session.vendor.id });
    throw e;
  }
  // ANA1 `track(...)` call removed.
  // analytics.ts is browser-only by design; server-side track was a
  // no-op + leaked tenant identifiers. Server-side analytics is M11.
  // used to revalidate + return,
  // leaving the vendor on the list with no obvious "what now". Cashout-
  // derived disputes redirect to the case page (/70); this path
  // now matches.
  if (caseId) redirect(`/vendor/disputes/${caseId}`);
}

export async function addEvidenceAction(
  caseId: Hex,
  note: string,
): Promise<void> {
  const session = await requireVendor();
  if (note.length < 5) throw new Error("evidence note required");
  try {
    const c = await disputesRepo.getDispute(caseId);
    if (!c) throw new Error("dispute not found");
    if (c.vendorId !== session.vendor.id)
      throw new Error("dispute belongs to a different vendor");

    await disputesRepo.addEvidence(caseId, {
      by: "claimant",
      at: new Date(),
      note,
      hash: _hash(note),
    });
    revalidatePath(`/vendor/disputes/${caseId}`);
    revalidatePath("/admin/disputes");
  } catch (e) {
    captureError(e, {
      action: "dispute.evidence",
      vendorId: session.vendor.id,
      caseId,
    });
    throw e;
  }
}
