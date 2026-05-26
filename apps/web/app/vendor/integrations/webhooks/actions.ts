"use server";

import { revalidatePath } from "next/cache";
import {
  mockCreateWebhook,
  mockGetWebhook,
  mockRecordWebhookDelivery,
} from "@/lib/mockData";
import { requireVendor } from "@/lib/auth";
import { captureError } from "@/lib/sentry";
import { sendTestPing } from "@/lib/webhooks";
import { assertPublicHttpUrl } from "@/lib/safeFetchUrl";

const ALL_EVENTS = [
  "invoice.created",
  "invoice.accepted",
  "invoice.paid",
  "invoice.settled",
  "invoice.cancelled",
  "cashout.requested",
  "cashout.released",
  "cashout.disputed",
  "refund.executed",
];

export async function createWebhookAction(formData: FormData): Promise<void> {
  const session = await requireVendor();
  const url = String(formData.get("url") ?? "");
  if (!/^https?:\/\//.test(url)) throw new Error("URL must be http(s)");
  // SSRF guard. Without this a vendor can store
  // `http://169.254.169.254/...` (AWS IMDS) or `http://localhost:6379`
  // and the worker `deliver()` will probe Klaro's own infra. Validated
  // at store time (here) AND again at fetch time inside `deliver()`
  // to catch DNS rebinding.
  await assertPublicHttpUrl(url);

  try {
    await mockCreateWebhook({
      vendorId: session.vendor.id,
      url,
      events: ALL_EVENTS,
    });
    revalidatePath("/vendor/integrations/webhooks");
  } catch (e) {
    captureError(e, { action: "webhook.create", vendorId: session.vendor.id });
    throw e;
  }
}

/** Send a test ping for an existing webhook. Audit fix (loop iter 9):
 * previously had **zero auth** + accepted an attacker-controlled `url`,
 * which let any client SSRF Klaro's server outbound to any URL and write
 * a delivery row against a webhook id they didn't own. Now requires vendor
 * session, looks up the webhook by id, verifies ownership, AND uses the
 * stored URL (ignores the form-supplied one to close the SSRF). */
export async function testWebhookAction(id: string) {
  const session = await requireVendor();
  try {
    const webhook = await mockGetWebhook(id);
    if (!webhook) throw new Error("webhook not found");
    if (webhook.vendorId !== session.vendor.id)
      throw new Error("webhook belongs to a different vendor");
    // web P2: pass vendorId so test-ping webhookId is per-tenant
    // (was hardcoded "test-ping" → cross-tenant collision on same URL).
    const res = await sendTestPing(webhook.url, session.vendor.id);
    await mockRecordWebhookDelivery(id, res.ok ? "ok" : "fail");
    revalidatePath("/vendor/integrations/webhooks");
    return res;
  } catch (e) {
    captureError(e, {
      action: "webhook.test",
      vendorId: session.vendor.id,
      webhookId: id,
    });
    throw e;
  }
}
