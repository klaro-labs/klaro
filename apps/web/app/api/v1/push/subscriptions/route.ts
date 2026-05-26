import { ok, err, publicErrorMessage } from "@/lib/api";
import { requireVendor } from "@/lib/auth";
import { serviceDb } from "@/lib/db";
import { captureError } from "@/lib/sentry";
import { z } from "zod";
import crypto from "node:crypto";

/**
 * Push subscription registration. `lib/push.ts`
 * POSTed here but the route didn't exist. Adding the round-trip closes the
 * silent-failure path — opt-in works or the user sees an error.
 */
const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(20),
    auth: z.string().min(20),
  }),
});

export async function POST(req: Request) {
  try {
    const session = await requireVendor();
    const body = await req.json();
    const sub = SubscribeBody.parse(body);

    const ua = req.headers.get("user-agent") ?? "";
    const userAgentHash = crypto
      .createHash("sha256")
      .update(ua)
      .digest("hex")
      .slice(0, 32);

    // `onConflict: "endpoint"`
    // with a single-column UNIQUE let Vendor B overwrite Vendor A's
    // subscription by replaying A's endpoint string — and route
    // notifications for A to B's browser. Migration 0015 swaps the
    // unique to (vendor_id, endpoint); the conflict target must match.
    const { error } = await serviceDb().from("push_subscriptions").upsert(
      {
        vendor_id: session.vendor.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent_hash: userAgentHash,
      },
      { onConflict: "vendor_id,endpoint" },
    );
    if (error) throw error;

    return ok({ subscribed: true });
  } catch (e) {
    captureError(e, { route: "push.subscriptions.POST" });
    // was leaking raw Error.message — now sanitized.
    captureError(e, { where: "push.subscriptions" });
    return err(400, publicErrorMessage(e, "subscribe_failed"));
  }
}

const UnsubscribeBody = z.object({ endpoint: z.string().url() });

export async function DELETE(req: Request) {
  try {
    const session = await requireVendor();
    const body = await req.json();
    const sub = UnsubscribeBody.parse(body);
    const { error } = await serviceDb()
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", sub.endpoint)
      .eq("vendor_id", session.vendor.id);
    if (error) throw error;
    return ok({ unsubscribed: true });
  } catch (e) {
    captureError(e, { route: "push.subscriptions.DELETE" });
    // was leaking raw Error.message — now sanitized.
    captureError(e, { where: "push.subscriptions" });
    return err(400, publicErrorMessage(e, "subscribe_failed"));
  }
}
