"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
// dual-mode via repo for the 3 wrapped
// mocks. `mockListReputationEvents` has no repo yet — kept as-is.
import { mockListReputationEvents } from "@/lib/mockData";
import { listInvoicesForVendor } from "@/lib/repo/invoices";
import { listForVendor as listCashoutsForVendor } from "@/lib/repo/cashouts";
import { getVendorById } from "@/lib/repo/vendors";
import { record as auditRecord } from "@/lib/auditLog";
import { captureError } from "@/lib/sentry";

/** Build a GDPR-style export bundle for the current vendor. */
export async function exportMyDataAction(): Promise<{ json: string }> {
  const session = await getCurrentSession();
  if (!session) throw new Error("not signed in");
  const vendor = (await getVendorById(session.vendor.id)) ?? session.vendor;
  const invoices = await listInvoicesForVendor(session.vendor.id);
  const cashouts = await listCashoutsForVendor(session.vendor.id);
  const repEvents = await mockListReputationEvents(session.vendor.id);
  const payload = {
    schemaVersion: "klaro.privacy-export.v1",
    generatedAt: new Date().toISOString(),
    vendor: {
      id: vendor.id,
      email: vendor.email,
      displayName: vendor.displayName,
      country: vendor.country,
      // vendor.wallet is `Hex | null` after .
      // Emit explicit walletStatus + only include wallet when set, so
      // consumers (compliance team, regulator) don't read `null` as
      // an authoritative value.
      wallet: vendor.wallet ?? undefined,
      walletStatus: vendor.wallet ? "provisioned" : "not_yet_provisioned",
      brandColor: vendor.brandColor,
      brandLogoUrl: vendor.brandLogoUrl,
    },
    invoices: invoices.map((i) => ({
      id: i.id,
      status: i.status,
      amountUsdc: i.amount.toString(),
      createdAt: i.createdAt.toISOString(),
      customer: { email: i.customer.email, name: i.customer.name ?? null },
    })),
    cashouts: cashouts.map((c) => ({
      id: c.id,
      status: c.status,
      usdcAmount: c.usdcAmount.toString(),
      currency: c.currency,
      requestedAt: c.requestedAt.toISOString(),
    })),
    reputation: repEvents.map((e) => ({
      id: e.id,
      kind: e.kind,
      weight: e.weight,
      note: e.note,
      at: e.at.toISOString(),
    })),
  };
  return { json: JSON.stringify(payload, null, 2) };
}

/** Mock-delete the vendor's account. In live mode this kicks the 30-day
 * retention countdown + queues subprocessor erasure requests. */
export async function deleteMyAccountAction(): Promise<void> {
  const session = await getCurrentSession();
  if (!session) throw new Error("not signed in");
  try {
    // #15: persist the soft-delete + AML retention deadline. The vendor row is
    // marked deleted_at = now and aml_retention_until = now + 30d; a daemon
    // purge (privacy-purge cron) hard-deletes/anonymizes after that instant.
    // The vendors-self-update RLS policy allows the caller to set their own row.
    const { tryDb } = await import("@/lib/db");
    const c = await tryDb();
    const now = new Date();
    const retentionUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (c) {
      const { error } = await c
        .from("vendors")
        .update({
          deleted_at: now.toISOString(),
          aml_retention_until: retentionUntil.toISOString(),
        })
        .eq("id", session.vendor.id);
      if (error) throw error;
    }
    auditRecord({
      actor: session.vendor.id,
      action: "vendor.lockout",
      subjectKind: "vendor",
      subjectId: session.vendor.id,
      noteMd: `Privacy delete requested — account soft-deleted; AML retention until ${retentionUntil.toISOString().slice(0, 10)}, then purge.`,
    });
    revalidatePath("/account/privacy");
  } catch (e) {
    captureError(e, { action: "privacy.delete", vendorId: session.vendor.id });
    throw e;
  }
}
