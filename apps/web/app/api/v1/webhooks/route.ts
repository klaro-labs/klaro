import { handle, handleGet } from "@/lib/api";
import { WebhookCreateReq } from "@/lib/apiSchemas";
import { requireVendor } from "@/lib/auth";
import { supabaseLive } from "@/lib/env";
import { assertPublicHttpUrl } from "@/lib/safeFetchUrl";
import * as webhooksRepo from "@/lib/repo/webhooks";

/**
 * Build #8: the REST webhooks surface now persists to Supabase via the same
 * repo the vendor settings UI uses (lib/repo/webhooks.ts — table + per-vendor
 * encrypted signing secret, migration 0035). Previously this route kept
 * subscriptions in a process-level Map that vanished on every Vercel cold start
 * and 503'd in live mode. Now: real, durable, SSRF-guarded, RLS-scoped.
 */
const _devWebhooks = new Map<
  string,
  Array<{ id: string; url: string; events: string[]; createdAt: Date }>
>();

export const GET = handleGet(async () => {
  const session = await requireVendor();
  if (!supabaseLive()) {
    return {
      webhooks: _devWebhooks.get(session.vendor.id) ?? [],
      simulated: true,
    };
  }
  const webhooks = await webhooksRepo.listWebhooks(session.vendor.id);
  return { webhooks };
});

export const POST = handle(WebhookCreateReq, async (input) => {
  const session = await requireVendor();
  // SSRF guard at store time (re-checked at delivery time inside the worker) —
  // a vendor must not register http://169.254.169.254 / localhost as an endpoint.
  await assertPublicHttpUrl(input.url);

  if (!supabaseLive()) {
    const id = "wh_" + Math.random().toString(36).slice(2, 12);
    const row = {
      id,
      url: input.url,
      events: input.events,
      createdAt: new Date(),
    };
    const arr = _devWebhooks.get(session.vendor.id) ?? [];
    arr.push(row);
    _devWebhooks.set(session.vendor.id, arr);
    return { webhook: row, simulated: true };
  }

  const created = await webhooksRepo.createWebhook({
    vendorId: session.vendor.id,
    url: input.url,
    events: input.events,
  });
  // The signing secret is revealed ONCE on create (encrypted at rest thereafter).
  return {
    webhook: { id: created.id, url: created.url, events: input.events },
    secret: created.signingSecret,
  };
});
