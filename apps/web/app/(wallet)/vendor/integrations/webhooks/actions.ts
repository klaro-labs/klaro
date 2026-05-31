"use server";

import { revalidatePath } from "next/cache";
import * as webhooksRepo from "@/lib/repo/webhooks";
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

/** Result surfaced to the client by `useActionState`. On success `secret` is the
 * plaintext signing secret — generated + encrypted at rest by the webhook_create
 * RPC and returned EXACTLY ONCE here; it can never be retrieved again, so the UI
 * must show it now. Returned (not thrown) so the form renders it / the error
 * inline instead of crashing the page. */
export interface CreateWebhookState {
  ok: boolean;
  error?: string;
  secret?: string;
  url?: string;
}

export async function createWebhookAction(
  _prev: CreateWebhookState | null,
  formData: FormData,
): Promise<CreateWebhookState> {
  const session = await requireVendor();
  const url = String(formData.get("url") ?? "").trim();
  if (!/^https?:\/\//.test(url)) {
    return { ok: false, error: "URL must start with http:// or https://" };
  }
  // SSRF guard. Without this a vendor can store
  // `http://169.254.169.254/...` (AWS IMDS) or `http://localhost:6379`
  // and the worker `deliver()` will probe Klaro's own infra. Validated
  // at store time (here) AND again at fetch time inside `deliver()`
  // to catch DNS rebinding.
  try {
    await assertPublicHttpUrl(url);
  } catch {
    return {
      ok: false,
      error:
        "That URL isn't reachable as a public endpoint — localhost and internal IPs are blocked.",
    };
  }

  try {
    const created = await webhooksRepo.createWebhook({
      vendorId: session.vendor.id,
      url,
      events: ALL_EVENTS,
    });
    revalidatePath("/vendor/integrations/webhooks");
    return { ok: true, secret: created.signingSecret, url: created.url };
  } catch (e) {
    captureError(e, { action: "webhook.create", vendorId: session.vendor.id });
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Couldn't create the endpoint.",
    };
  }
}

/** Soft-delete an endpoint. Requires a vendor session + ownership; the repo's
 * UPDATE is additionally RLS-scoped to the owning vendor. */
export async function deactivateWebhookAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireVendor();
  try {
    const webhook = await webhooksRepo.getWebhook(id);
    if (!webhook) return { ok: false, error: "Endpoint not found" };
    if (webhook.vendorId !== session.vendor.id) {
      return { ok: false, error: "Endpoint belongs to a different account" };
    }
    await webhooksRepo.deactivateWebhook(id, session.vendor.id);
    revalidatePath("/vendor/integrations/webhooks");
    return { ok: true };
  } catch (e) {
    captureError(e, {
      action: "webhook.deactivate",
      vendorId: session.vendor.id,
      webhookId: id,
    });
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Couldn't remove the endpoint.",
    };
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
    const webhook = await webhooksRepo.getWebhook(id);
    if (!webhook) throw new Error("webhook not found");
    if (webhook.vendorId !== session.vendor.id)
      throw new Error("webhook belongs to a different vendor");
    // web P2: pass vendorId so test-ping webhookId is per-tenant
    // (was hardcoded "test-ping" → cross-tenant collision on same URL).
    const res = await sendTestPing(webhook.url, session.vendor.id);
    await webhooksRepo.recordDelivery(id, res.ok ? "ok" : "fail");
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
