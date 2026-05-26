/**
 * ERP sync worker. Pulls erp_sync_jobs in queued state and pushes to
 * Tally / QuickBooks Online / Xero / Zoho / MYOB / freee. Idempotency key per
 * (vendor_id, provider, invoice_id, kind). Failed retries flip to dead_letter.
 * M1: each provider's push is a logged stub. M5+ wires real OAuth + SDK calls.
 * worker used to expect
 * `{ vendorId, provider, idempotencyKey }` from the job payload — but
 * the only enqueue site (`screenAndSettle`) sent only `{ invoiceId,
 * kind }`. Worker dequeued with all those fields undefined; the
 * `eq("idempotency_key", undefined)` either threw on PostgREST or
 * silently matched nothing. Every settled invoice's ERP sync was a no-
 * op without even reaching the `[SIMULATED]` log. Refactored to make
 * the worker self-contained: enqueue carries `{ invoiceId, kind }`;
 * worker resolves the invoice's `vendor_id`, looks up that vendor's
 * `erp_connections` rows, and writes one `erp_sync_jobs` row per
 * provider with a derived deterministic `idempotency_key`. Honest no-
 * op when the vendor has no ERP connections.
 */
import { createHash } from "node:crypto";
import { startWorker } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";

type ErpProvider = "tally" | "quickbooks" | "xero" | "zoho" | "myob" | "freee";

export interface ErpJob {
  invoiceId: string;
  kind: "invoice.create" | "invoice.pay" | "tax_pack";
}

interface ErpConnection {
  provider: ErpProvider;
}

function makeIdempotencyKey(
  vendorId: string,
  provider: string,
  invoiceId: string,
  kind: string,
): string {
  return createHash("sha256")
    .update(`erp:${vendorId}:${provider}:${invoiceId}:${kind}`)
    .digest("hex");
}

async function push(
  provider: ErpProvider,
  _payload: Record<string, unknown>,
): Promise<void> {
  log.warn("[SIMULATED] erp.push.skipped", {
    provider,
    reason: `${provider.toUpperCase()}_OAUTH_TOKEN unset — credentials pending`,
  });
}

export function startErpSync() {
  startWorker<ErpJob>(
    "erp-sync",
    async (job) => {
      const { invoiceId, kind } = job.data;
      if (!invoiceId) {
        log.warn("erp.sync.skipped", { reason: "invoiceId missing" });
        return;
      }

      // previously discarded `{error}`. A transient
      // PostgREST failure rendered inv as null → log "invoice not
      // found" + return success → ERP sync silently skipped per
      // settled invoice with no retry. Same class as .
      const { data: inv, error: invErr } = await sb()
        .from("invoices")
        .select("vendor_id")
        .eq("id", invoiceId)
        .maybeSingle();
      if (invErr) throw invErr;
      if (!inv?.vendor_id) {
        log.warn("erp.sync.skipped", {
          invoiceId,
          reason: "invoice not found",
        });
        return;
      }

      const { data: conns, error: connsErr } = await sb()
        .from("erp_connections")
        .select("provider")
        .eq("vendor_id", inv.vendor_id);
      if (connsErr) throw connsErr;
      const providers = (conns ?? []) as ErpConnection[];
      if (providers.length === 0) {
        log.info("erp.sync.no_connections", {
          invoiceId,
          vendorId: inv.vendor_id,
        });
        return;
      }

      for (const { provider } of providers) {
        const idempotencyKey = makeIdempotencyKey(
          inv.vendor_id,
          provider,
          invoiceId,
          kind,
        );
        // Upsert the row so retries don't duplicate-insert. Composite
        // unique on idempotency_key is implicit (it's the lookup key).
        // previously discarded `{error}`. Transient
        // read failure → `existing` undefined → skipped "already
        // success" short-circuit → upsert ran with attempts=1,
        // overwriting any real attempts counter. ed
        // 2 reads in this file but missed this one.
        const { data: existing, error: existingErr } = await sb()
          .from("erp_sync_jobs")
          .select("status,attempts")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (existingErr) throw existingErr;
        if (existing?.status === "success") continue;

        // continue the /76 {error} sweep —
        // erpSync had three swallowed writes. Without throwing, a
        // failed audit-row upsert left no record but the worker
        // logged success; a failed status-flip after a successful
        // push left the queue thinking the job was pending forever.
        // previously omitted `payload_json`, but the
        // schema declares it `not null` (migration 0005:33). First
        // attempt → INSERT branch → NOT NULL violation → throw →
        // BullMQ retried 5× all failing the same way → DLQ. Every
        // ERP sync job dropped silently. Same defect class as D89-1
        // (webhook_deliveries). Payload is reconstructible from FK
        // columns but the schema requires it explicitly.
        const upRunning = await sb()
          .from("erp_sync_jobs")
          .upsert(
            {
              idempotency_key: idempotencyKey,
              vendor_id: inv.vendor_id,
              provider,
              invoice_id: invoiceId,
              kind,
              payload_json: {
                vendorId: inv.vendor_id,
                invoiceId,
                kind,
                provider,
              },
              status: "running",
              attempts: (existing?.attempts ?? 0) + 1,
            },
            { onConflict: "idempotency_key" },
          );
        if (upRunning.error) throw upRunning.error;

        try {
          await push(provider, { vendorId: inv.vendor_id, invoiceId, kind });
          const upSuccess = await sb()
            .from("erp_sync_jobs")
            .update({
              status: "success",
              completed_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("idempotency_key", idempotencyKey);
          if (upSuccess.error) throw upSuccess.error;
        } catch (e) {
          const msg = (e as Error).message;
          const upFailed = await sb()
            .from("erp_sync_jobs")
            .update({ status: "failed", last_error: msg })
            .eq("idempotency_key", idempotencyKey);
          if (upFailed.error) {
            // Surface BOTH errors so we don't mask the original push
            // failure behind a Supabase write error. The original `e`
            // re-throw below preserves BullMQ retry semantics.
            log.error("erp.sync.failed_write_failed", {
              invoiceId,
              provider,
              originalError: msg,
              writeError: upFailed.error.message,
            });
          }
          throw e;
        }
      }
    },
    4,
  );
}
