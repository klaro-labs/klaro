/**
 * Daily sanctions list refresh. Pulls OFAC / EU / UN lists, hashes each entry,
 * upserts into counterparty_screen_cache so InvoiceEscrow.fund() pre-check can
 * reject suspect buyers immediately.
 * M1: stub (logs intent). M5: real list fetch + diff + Bloom-filter index.
 */
import { startWorker } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";

export function startSanctionsRefresh() {
  startWorker<{ source: "OFAC" | "EU" | "UN" }>(
    "sanctions-refresh",
    async (job) => {
      // [SIMULATED] Chainalysis / TRM credentials are not yet wired. We still
      // emit a structured log so the operator sees the cron fired and the
      // next-step is clearly "wire credentials", not "fix code".
      log.warn("[SIMULATED] sanctions.refresh.skipped", {
        source: job.data.source,
        reason: "CHAINALYSIS_API_KEY unset",
      });
      // Write a structured "tried" row so the missing-data debug surface
      // works without grepping stdout. Operator queries
      // `select * from sanctions_refresh_runs order by ran_at desc`
      // to confirm the cron has been firing. Best-effort — if the table
      // does not exist, log and move on.
      const { error } = await sb().from("sanctions_refresh_runs").insert({
        source: job.data.source,
        status: "simulated",
        reason: "CHAINALYSIS_API_KEY unset",
      });
      if (error) {
        log.warn("sanctions.refresh.audit_row_failed", {
          source: job.data.source,
          err: error.message,
        });
      }
    },
    2,
  );
}
