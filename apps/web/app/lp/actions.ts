"use server";

import { revalidatePath } from "next/cache";
import { keccak256, stringToBytes } from "viem";
// swap cashout mocks → dual-mode repo
// (live Supabase path engaged when DB is wired). LP-specific mocks have no
// repo wrapper yet and stay direct.
import { mockUpdateLP, mockCreateLPInvite } from "@/lib/mockData";
import { getCashout, advanceCashout } from "@/lib/repo/cashouts";
import { dollarsToUSDC } from "@/lib/money";
import { requireOperator, requireLp } from "@/lib/auth";
import { record as auditRecord } from "@/lib/auditLog";
import { captureError } from "@/lib/sentry";
import type { Hex } from "@/lib/types";

/**
 * LP server actions. Every mutating action derives the LP from
 * `requireLp()` — which maps `(session.vendor.id) → lp_members → lp_profiles`
 * — NOT `mockListLPs()[0]`. closed.
 */

function _hash(s: string): Hex {
  return keccak256(stringToBytes(s));
}

export async function createInviteAction(formData: FormData): Promise<void> {
  // Operator-only — LP invites are issued by Klaro BD, never self-serve.
  const session = await requireOperator();
  const email = String(formData.get("contactEmail") ?? "");
  if (!email.includes("@")) throw new Error("invalid email");
  try {
    const lp = await mockCreateLPInvite({ contactEmail: email });
    auditRecord({
      actor: session.vendor.id,
      action: "lp.admit",
      subjectKind: "lp",
      subjectId: lp.lpId,
      noteMd: `Invite sent to ${email}`,
    });
    revalidatePath("/lp");
    revalidatePath("/admin");
  } catch (e) {
    captureError(e, { action: "lp.invite", operator: session.vendor.id });
    throw e;
  }
}

export async function submitApplicationAction(
  formData: FormData,
): Promise<void> {
  const { vendor, lp } = await requireLp();
  // wallet was cast `as Hex | undefined`
  // without format check. A malformed or zero-address wallet would have
  // shipped USDC into the void at first cashout payout. Validate before write.
  const rawWallet = String(formData.get("wallet") ?? "").trim();
  if (rawWallet && !/^0x[0-9a-fA-F]{40}$/.test(rawWallet)) {
    throw new Error("Payout wallet must be a 0x-prefixed 20-byte address");
  }
  if (rawWallet && /^0x0+$/.test(rawWallet)) {
    throw new Error("Payout wallet cannot be the zero address");
  }
  try {
    await mockUpdateLP(lp.lpId, {
      legalEntityName: String(formData.get("legalEntityName") ?? ""),
      country: String(formData.get("country") ?? ""),
      wallet: (rawWallet || undefined) as Hex | undefined,
      status: "DOCS_UPLOADED",
    });
    auditRecord({
      actor: vendor.id,
      action: "lp.admit",
      subjectKind: "lp",
      subjectId: lp.lpId,
      noteMd: "Application submitted",
    });
    revalidatePath("/lp");
    revalidatePath("/lp/apply");
    revalidatePath("/lp/docs");
  } catch (e) {
    captureError(e, {
      action: "lp.submitApplication",
      vendorId: vendor.id,
      lpId: lp.lpId,
    });
    throw e;
  }
}

export async function submitDocsAction(): Promise<void> {
  const { vendor, lp } = await requireLp();
  try {
    // Real bundle hash comes from Supabase storage upload in live mode.
    const seed = `${lp.lpId}:${Date.now()}`;
    await mockUpdateLP(lp.lpId, {
      kybDocsHash: _hash(`kyb:${seed}`),
      payoutAccountHash: _hash(`payout:${seed}`),
      status: "UNDER_REVIEW",
    });
    auditRecord({
      actor: vendor.id,
      action: "lp.admit",
      subjectKind: "lp",
      subjectId: lp.lpId,
      noteMd: "KYB docs submitted",
    });
    revalidatePath("/lp");
    revalidatePath("/lp/docs");
  } catch (e) {
    captureError(e, {
      action: "lp.submitDocs",
      vendorId: vendor.id,
      lpId: lp.lpId,
    });
    throw e;
  }
}

/// action used to hardcode
/// `lpId = "lp_mudrex_in_demo"` regardless of which application was
/// being approved. With two pending LPs in the queue, operator clicked
/// Approve on LP-B and LP-A got approved instead — wrong stake routing,
/// wrong audit trail, wrong KYB attribution. Action now takes lpId
/// from form data; operator must be supplied.
export async function approveApplicationAction(
  formData: FormData,
): Promise<void> {
  const session = await requireOperator();
  const lpId = String(formData.get("lpId") ?? "").trim();
  if (!lpId) throw new Error("lpId required");
  try {
    await mockUpdateLP(lpId, { status: "APPROVED" });
    auditRecord({
      actor: session.vendor.id,
      action: "lp.admit",
      subjectKind: "lp",
      subjectId: lpId,
      reasonHash: _hash("klaro.reason.HOLD_VENDOR_KYB_PENDING"),
      noteMd: `LP application approved`,
    });
    revalidatePath("/lp");
    revalidatePath("/admin");
  } catch (e) {
    captureError(e, { action: "lp.approve", operator: session.vendor.id });
    throw e;
  }
}

export async function claimOrderAction(formData: FormData): Promise<void> {
  const { vendor, lp } = await requireLp();
  if (lp.status !== "STAKED")
    throw new Error("LP must be staked to claim orders");
  if (lp.wallet === undefined) throw new Error("LP payout wallet not set");

  const rawOrderId = String(formData.get("orderId") ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(rawOrderId)) {
    throw new Error("orderId must be 0x + 64 hex chars");
  }
  const orderId = rawOrderId as Hex;
  try {
    const order = await getCashout(orderId);
    if (!order) throw new Error("order not found");
    if (order.status !== "REQUESTED")
      throw new Error(`order already in state ${order.status}`);

    const advanced = await advanceCashout(
      orderId,
      "CLAIMED",
      {
        at: new Date(),
        kind: "lp_assigned",
        detail: `Claimed by ${lp.legalEntityName ?? lp.contactEmail} (tier T${lp.tier})`,
      },
      { lpId: lp.lpId, lpName: lp.legalEntityName },
      "REQUESTED",
    );
    if (!advanced) {
      // Lost the race: another LP claimed this order between our read and our
      // conditional update. Re-read to surface the actual winner in the error.
      const fresh = await getCashout(orderId);
      throw new Error(
        `order already claimed (current status: ${fresh?.status ?? "unknown"})`,
      );
    }

    auditRecord({
      actor: vendor.id,
      action: "lp.admit",
      subjectKind: "cashout",
      subjectId: orderId,
      noteMd: `LP ${lp.lpId} claimed cashout ${orderId}`,
    });

    revalidatePath("/lp/queue");
    revalidatePath("/vendor/cashout");
  } catch (e) {
    // "order already claimed" is benign contention
    // between concurrent LP claims — the conditional update at line
    // 165 catches it cleanly. Don't flood Sentry with these (they
    // outnumber real errors during cashout bursts and skew alerts).
    // Surface non-race errors normally.
    const msg = (e as Error).message ?? "";
    const isLostRace =
      msg.startsWith("order already claimed") ||
      msg.startsWith("order already in state");
    if (!isLostRace) {
      captureError(e, {
        action: "lp.claimOrder",
        vendorId: vendor.id,
        lpId: lp.lpId,
        orderId,
      });
    }
    throw e;
  }
}

export async function stakeAction(formData: FormData): Promise<void> {
  const { vendor, lp } = await requireLp();
  const amount = Number(formData.get("amount") ?? 0);
  if (amount < 50) throw new Error("minimum T0 stake is $50");
  if (lp.status !== "APPROVED" && lp.status !== "STAKED") {
    throw new Error("LP must be approved before staking");
  }
  try {
    const tier: 0 | 1 | 2 | 3 | 4 =
      amount >= 2000 ? 3 : amount >= 500 ? 2 : amount >= 100 ? 1 : 0;
    await mockUpdateLP(lp.lpId, {
      stakedUsdc: dollarsToUSDC(amount),
      tier,
      status: "STAKED",
    });
    auditRecord({
      actor: vendor.id,
      action: "lp.admit",
      subjectKind: "lp",
      subjectId: lp.lpId,
      noteMd: `Staked $${amount} (tier T${tier})`,
    });
    revalidatePath("/lp");
    revalidatePath("/lp/stake");
  } catch (e) {
    captureError(e, { action: "lp.stake", vendorId: vendor.id, lpId: lp.lpId });
    throw e;
  }
}
