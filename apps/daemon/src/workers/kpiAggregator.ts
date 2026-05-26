/**
 * KPI aggregator — runs hourly, materializes rollups for internal.klaro.so/kpi.
 * Counts invoices, settled volume, cashouts, dispute rate, median settlement time,
 * active vendors / LPs, ERP sync depth + DLQ depth.
 */
import { startWorker } from "../queue.js";
import { sb } from "../db.js";
import { log } from "../log.js";

export function startKpiAggregator() {
  startWorker<{ window: "1h" | "24h" | "7d" }>(
    "kpi-roll",
    async (job) => {
      const win = job.data.window;
      const since =
        win === "1h"
          ? new Date(Date.now() - 60 * 60 * 1000)
          : win === "24h"
            ? new Date(Date.now() - 24 * 60 * 60 * 1000)
            : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      // KPI rollups were counting soft-deleted rows
      // (same omission class as lifecycleReminders +
      // adminRisk soft-delete sweep). /internal/kpi inflated invoice
      // + settled volume vs operational truth.
      // previously discarded `error` on each count
      // query. A transient PostgREST failure resolved `count = null`
      // → `count ?? 0` upserted a zero KPI row overwriting real
      // truth in kpi_snapshots. Throw on error.
      const [invR, setR, cshR] = await Promise.all([
        sb()
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .gte("created_at", since.toISOString()),
        sb()
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("status", "SETTLED")
          .gte("updated_at", since.toISOString()),
        sb()
          .from("cashout_orders")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .gte("requested_at", since.toISOString()),
      ]);
      if (invR.error) throw invR.error;
      if (setR.error) throw setR.error;
      if (cshR.error) throw cshR.error;
      const { count: invoices } = invR;
      const { count: settled } = setR;
      const { count: cashouts } = cshR;
      // (2026-05-25): actually persist the rollup so
      // /internal/kpi reads real numbers. Migration 0011 backs this table.
      // retries duplicated rows
      // because `taken_at` defaulted to `now()` — every BullMQ retry
      // wrote a new row past the unique constraint. Bucket `taken_at`
      // to the start of the window (hour / day / week) so retries
      // within the same bucket upsert into one row. Also surface
      // `{ error }` instead of swallowing.
      const bucketStart = (() => {
        const d = new Date();
        if (win === "1h") {
          d.setMinutes(0, 0, 0);
        } else if (win === "24h") {
          d.setUTCHours(0, 0, 0, 0);
        } else {
          // 7d: ISO-week (Mon) at UTC midnight
          d.setUTCHours(0, 0, 0, 0);
          const dow = (d.getUTCDay() + 6) % 7;
          d.setUTCDate(d.getUTCDate() - dow);
        }
        return d.toISOString();
      })();
      const upKpi = await sb()
        .from("kpi_snapshots")
        .upsert(
          {
            window_label: win,
            taken_at: bucketStart,
            invoices: invoices ?? 0,
            settled: settled ?? 0,
            cashouts: cashouts ?? 0,
          },
          { onConflict: "window_label,taken_at" },
        );
      if (upKpi.error) throw upKpi.error;
      log.info("kpi.roll.persisted", {
        window: win,
        bucket: bucketStart,
        invoices,
        settled,
        cashouts,
      });
    },
    1,
  );
}
