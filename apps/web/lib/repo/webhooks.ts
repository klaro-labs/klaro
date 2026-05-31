/**
 * Webhook-endpoint repository — dual-mode (Supabase live · mockData fallback).
 * Create goes through the webhook_create RPC (0035) so the signing secret is
 * generated + encrypted with the vault key server-side and revealed once.
 * List/get never expose the stored secret. Delivery signs with the global
 * WEBHOOK_HMAC_SECRET (per-endpoint routing is M11).
 */
import { tryDb } from "../db";
import {
  mockListWebhooks,
  mockCreateWebhook,
  mockGetWebhook,
  mockRecordWebhookDelivery,
  mockDeactivateWebhook,
  type WebhookEndpoint,
} from "../mockData";

type Row = Record<string, unknown>;
const HIDDEN = "whsec_•••• (shown once at creation)";

// supabase-js is typed against generated tables; webhook_create is a new RPC
// not yet in database.types.ts, so call it through a narrow structural cast.
type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function fromRow(row: Row): WebhookEndpoint {
  return {
    id: String(row.id),
    vendorId: String(row.vendor_id),
    url: String(row.url),
    events: (row.events as string[]) ?? [],
    signingSecret: HIDDEN,
    active: String(row.status) === "active",
    createdAt: new Date(String(row.created_at)),
  };
}

const SELECT = "id,vendor_id,url,events,status,created_at";

export async function listWebhooks(
  vendorId: string,
): Promise<WebhookEndpoint[]> {
  const c = await tryDb();
  if (!c) return mockListWebhooks(vendorId);
  const { data, error } = await c
    .from("webhooks")
    .select(SELECT)
    .eq("vendor_id", vendorId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function getWebhook(id: string): Promise<WebhookEndpoint | null> {
  const c = await tryDb();
  if (!c) return mockGetWebhook(id);
  const { data, error } = await c
    .from("webhooks")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : null;
}

export async function createWebhook(input: {
  vendorId: string;
  url: string;
  events: string[];
}): Promise<WebhookEndpoint> {
  const c = await tryDb();
  if (!c) return mockCreateWebhook(input);
  const { data, error } = await (c as unknown as RpcClient).rpc(
    "webhook_create",
    {
      p_vendor_id: input.vendorId,
      p_url: input.url,
      p_events: input.events,
    },
  );
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as {
    id: string;
    signing_secret: string;
  };
  return {
    id: row.id,
    vendorId: input.vendorId,
    url: input.url,
    events: input.events,
    signingSecret: row.signing_secret,
    active: true,
    createdAt: new Date(),
  };
}

/** Soft-delete an endpoint the vendor owns (status='deleted', filtered out of
 * listWebhooks). The "webhooks vendor scope" ALL RLS policy gates the UPDATE to
 * the owning vendor; the explicit vendor_id match is defense-in-depth. */
export async function deactivateWebhook(
  id: string,
  vendorId: string,
): Promise<void> {
  const c = await tryDb();
  if (!c) return void mockDeactivateWebhook(id);
  const { error } = await c
    .from("webhooks")
    .update({ status: "deleted" })
    .eq("id", id)
    .eq("vendor_id", vendorId);
  if (error) throw error;
}

/** Best-effort audit row for a test ping. The HTTP ping itself already ran and
 * its result is returned to the caller directly; persisting the delivery row is
 * non-critical and may be denied by RLS (the delivery worker owns this table
 * via the service role), so failures are swallowed. */
export async function recordDelivery(
  id: string,
  status: "ok" | "fail",
): Promise<void> {
  const c = await tryDb();
  if (!c) return void mockRecordWebhookDelivery(id, status);
  try {
    await c.from("webhook_deliveries").insert({
      webhook_id: id,
      event: "test.ping",
      payload_json: {},
      status: status === "ok" ? "success" : "failed",
      attempts: 1,
      delivered_at: status === "ok" ? new Date().toISOString() : null,
      idempotency_key: `testping-${Date.now()}`,
    });
  } catch {
    /* best-effort */
  }
}
