"use server";

import { revalidatePath } from "next/cache";
import {
  mockCreateStream,
  mockGetStream,
  mockWithdrawFromStream,
  mockCancelStream,
} from "@/lib/mockData";
import { requireVendor, assertVendorWalletProvisioned } from "@/lib/auth";
import { captureError } from "@/lib/sentry";
import { record as auditRecord } from "@/lib/auditLog";
import { dollarsToUSDC, assertSafeUSDAmount } from "@/lib/money";
import type { Hex } from "@/lib/types";

/**
 * Retainer stream actions.
 * - `createStreamAction` used `getCurrentSession()` (no role check) and
 * wrote `recipientAddress = session.vendor.wallet` without the provisioned
 * check → vendor with no Circle Wallets setup would stream to 0x000…000.
 * - `withdrawStreamAction` + `cancelStreamAction` had **zero auth** — any
 * URL fired the money move. Same class as the bills/delegations P0
 * closed in workstream A.
 * Now all three actions:
 * - require a vendor session,
 * - own the stream (vendor_id match),
 * - assert wallet is provisioned where the stream pays them out,
 * - bubble failures through captureError + auditRecord.
 */

export async function createStreamAction(formData: FormData): Promise<void> {
  const session = await requireVendor();
  const vendorWallet = assertVendorWalletProvisioned(session.vendor);
  const payerLabel = String(formData.get("payerLabel") ?? "");
  const payerAddress = String(formData.get("payerAddress") ?? "") as Hex;
  const amount = Number(formData.get("amount") ?? 0);
  const days = Number(formData.get("days") ?? 30);
  if (!payerLabel) throw new Error("payer label required");
  if (!/^0x[0-9a-fA-F]{40}$/.test(payerAddress))
    throw new Error("invalid payer address");
  assertSafeUSDAmount(amount); // QA-052: shared validator family.
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new Error("validation_days_out_of_range: days must be integer 1-365");

  try {
    const stream = await mockCreateStream({
      vendorId: session.vendor.id,
      payerLabel,
      payerAddress,
      recipientAddress: vendorWallet,
      depositUsdc: dollarsToUSDC(amount),
      startAt: new Date(),
      endAt: new Date(Date.now() + days * 86_400_000),
    });
    auditRecord({
      actor: session.vendor.id,
      action: "retainer.create",
      subjectKind: "vendor",
      subjectId: session.vendor.id,
      noteMd: `Created retainer stream ${stream.streamId} from ${payerLabel}`,
    });
    revalidatePath("/vendor/retainer");
  } catch (e) {
    captureError(e, { action: "retainer.create", vendorId: session.vendor.id });
    throw e;
  }
}

export async function withdrawStreamAction(
  streamId: Hex,
  amountUsdcMicro: bigint,
): Promise<void> {
  const session = await requireVendor();
  try {
    const stream = await mockGetStream(streamId);
    if (!stream) throw new Error("stream not found");
    if (stream.vendorId !== session.vendor.id)
      throw new Error("stream belongs to a different vendor");
    await mockWithdrawFromStream(streamId, amountUsdcMicro);
    auditRecord({
      actor: session.vendor.id,
      action: "retainer.withdraw",
      subjectKind: "vendor",
      subjectId: session.vendor.id,
      noteMd: `Withdrew ${amountUsdcMicro}µUSDC from stream ${streamId}`,
    });
    revalidatePath("/vendor/retainer");
  } catch (e) {
    captureError(e, {
      action: "retainer.withdraw",
      vendorId: session.vendor.id,
      streamId,
    });
    throw e;
  }
}

export async function cancelStreamAction(streamId: Hex): Promise<void> {
  const session = await requireVendor();
  try {
    const stream = await mockGetStream(streamId);
    if (!stream) throw new Error("stream not found");
    if (stream.vendorId !== session.vendor.id)
      throw new Error("stream belongs to a different vendor");
    await mockCancelStream(streamId);
    auditRecord({
      actor: session.vendor.id,
      action: "retainer.cancel",
      subjectKind: "vendor",
      subjectId: session.vendor.id,
      noteMd: `Cancelled retainer stream ${streamId}`,
    });
    revalidatePath("/vendor/retainer");
  } catch (e) {
    captureError(e, {
      action: "retainer.cancel",
      vendorId: session.vendor.id,
      streamId,
    });
    throw e;
  }
}
