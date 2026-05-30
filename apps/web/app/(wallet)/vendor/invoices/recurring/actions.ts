"use server";

import { revalidatePath } from "next/cache";
import { mockCreateRecurring, type RecurringSchedule } from "@/lib/mockData";
import { dollarsToUSDC, assertSafeUSDAmount } from "@/lib/money";
import { requireVendor, assertVendorWalletProvisioned } from "@/lib/auth";
import { captureError } from "@/lib/sentry";

export async function createRecurringAction(formData: FormData): Promise<void> {
  const session = await requireVendor();
  // mirrors createInvoiceAction
  // semantics — every fired schedule mints a new invoice routing to
  // `vendorWallet`. Without this assert a vendor with no provisioned
  // wallet sets up a $500/mo schedule and every emitted invoice routes
  // USDC to `0x000…0`.
  assertVendorWalletProvisioned(session.vendor);
  const customerEmail = String(formData.get("customerEmail") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const description = String(formData.get("description") ?? "");
  const frequencyRaw = String(formData.get("frequency") ?? "monthly");
  // frequency was cast directly
  // without runtime validation. A POST with `frequency=yearly` made
  // `days` undefined → `nextRunAt` = Invalid Date, and the schedule
  // persisted corrupted (UI later crashed when sorting by nextRunAt).
  const validFrequencies = [
    "weekly",
    "biweekly",
    "monthly",
    "quarterly",
  ] as const;
  if (!(validFrequencies as readonly string[]).includes(frequencyRaw)) {
    throw new Error(
      "frequency must be one of: weekly | biweekly | monthly | quarterly",
    );
  }
  const frequency = frequencyRaw as RecurringSchedule["frequency"];

  // QA-052: same Infinity/NaN gap fix — shared helper.
  assertSafeUSDAmount(amount);
  if (!customerEmail || !description) {
    throw new Error("validation_required_fields: customerEmail + description required");
  }

  try {
    const days = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 91 }[
      frequency
    ];
    await mockCreateRecurring({
      vendorId: session.vendor.id,
      customerEmail,
      amountUsdc: dollarsToUSDC(amount),
      description,
      frequency,
      nextRunAt: new Date(Date.now() + days * 86_400_000),
    });
    revalidatePath("/vendor/invoices/recurring");
  } catch (e) {
    captureError(e, {
      action: "recurring.create",
      vendorId: session.vendor.id,
    });
    throw e;
  }
}
