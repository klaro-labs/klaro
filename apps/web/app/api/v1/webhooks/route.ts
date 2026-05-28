import { handle, handleGet } from "@/lib/api";
import { WebhookCreateReq } from "@/lib/apiSchemas";
import { requireVendor } from "@/lib/auth";
import { supabaseLive } from "@/lib/env";

// previously stored subscriptions
// in a process-level Map. On Vercel cold start (every ~15 min of idle)
// every vendor's webhook subscription disappeared silently — the POST
// kept returning 201 with a fake `wh_xxx` id while the GET listed
// nothing. Vendors' downstream services stopped receiving events with
// zero warning, in violation of (overclaiming live behavior).
// Until the persistence wiring lands (Supabase insert + per-vendor
// secret encryption per Workstream G), the route refuses in live mode
// and returns simulated rows tagged `simulated: true` in dev so the
// settings UI can render an honest "not yet available — track on the
// roadmap" banner.
const _webhooks = new Map<
  string,
  Array<{ id: string; url: string; events: string[]; createdAt: Date }>
>();

function liveModeNotAvailable(): never {
  throw new Error(
    "webhooks_not_yet_available: subscription persistence + secret encryption are pending; the in-memory stub does not survive serverless cold starts",
  );
}

export const GET = handleGet(async () => {
  const session = await requireVendor();
  if (supabaseLive()) liveModeNotAvailable();
  const list = _webhooks.get(session.vendor.id) ?? [];
  return { webhooks: list, simulated: true };
});

export const POST = handle(WebhookCreateReq, async (input) => {
  const session = await requireVendor();
  if (supabaseLive()) liveModeNotAvailable();
  const id = "wh_" + Math.random().toString(36).slice(2, 12);
  const row = {
    id,
    url: input.url,
    events: input.events,
    createdAt: new Date(),
  };
  const arr = _webhooks.get(session.vendor.id) ?? [];
  arr.push(row);
  _webhooks.set(session.vendor.id, arr);
  return { webhook: row, simulated: true };
});
