/**
 * Daily sanctions list refresh.
 * OFAC is now REAL: fetches the US Treasury SDN crypto-address list (free, no
 * account) into the in-memory screen cache that screenAndSettle uses. EU / UN
 * remain simulated until a free parser for those lists is wired.
 */
import { startWorker } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";
import { refreshOfacAddresses } from "../ofac.js";

export function startSanctionsRefresh() {
  startWorker<{ source: "OFAC" | "EU" | "UN" }>(
    "sanctions-refresh",
    async (job) => {
      const source = job.data.source;
      let status = "simulated";
      let reason: string | null = null;
      let count: number | null = null;

      if (source === "OFAC") {
        // REAL: pull the OFAC SDN crypto-address list into the screen cache.
        try {
          count = await refreshOfacAddresses();
          status = "ok";
          log.info("sanctions.refresh.ok", { source, count });
        } catch (e) {
          status = "error";
          reason = (e as Error).message;
          log.error("sanctions.refresh.failed", { source, err: reason });
          // Re-throw so BullMQ retries + the DLQ/alert fires — a stale sanctions
          // list is an operational incident, not a silent skip.
          throw e;
        }
      } else {
        // EU / UN: no free parser wired yet — honest simulated marker.
        reason = `${source} list parser not yet wired`;
        log.warn("[SIMULATED] sanctions.refresh.skipped", { source, reason });
      }

      // Structured audit row so the operator can confirm the cron fired:
      // `select * from sanctions_refresh_runs order by ran_at desc`.
      const { error } = await sb().from("sanctions_refresh_runs").insert({
        source,
        status,
        reason: reason ?? (count !== null ? `${count} addresses` : null),
      });
      if (error) {
        log.warn("sanctions.refresh.audit_row_failed", {
          source,
          err: error.message,
        });
      }
    },
    2,
  );
}
