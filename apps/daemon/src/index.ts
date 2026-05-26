/**
 * Klaro daemon entrypoint. Boots:
 * 1. HTTP healthcheck (/healthz, /status) for Railway
 * 2. Arc event listener (subscribes to InvoicePaid, OrderClaimed, etc.)
 * 3. 12 BullMQ workers
 * 4. Repeating crons (lifecycle reminders, KPI roll, admin risk, sanctions refresh)
 * 5. Graceful shutdown on SIGINT / SIGTERM
 */
import { env } from "./env.js";
import { log } from "./log.js";
import { startHttp } from "./http.js";
import { closeAll, queue } from "./queue.js";
import { startArcListener, stopArcListener } from "./listener/arcSubscriber.js";

import { startWebhookDelivery } from "./workers/webhookDelivery.js";
import { startScreenAndSettle } from "./workers/screenAndSettle.js";
import { startCashoutAdvancer } from "./workers/cashoutAdvancer.js";
import { startReceiptGenerate } from "./workers/receiptGenerate.js";
import { startErpSync } from "./workers/erpSync.js";
import { startNotifications } from "./workers/notifications.js";
import { startSanctionsRefresh } from "./workers/sanctionsRefresh.js";
// quoteEngine worker removed. It registered for `quote-build`
// but no producer in the codebase ever enqueued — pure dead code with
// a parallel-MOCK_RATES table that had already drifted from
// `lib/corridors.ts` (INR 83.4 vs 83.9, BRL 4.96 vs 5.06, MXN 19.8 vs
// 17.2). Re-add via a shared corridors package if a future producer
// needs daemon-side quote building.
import { startKpiAggregator } from "./workers/kpiAggregator.js";
import { startAdminRisk } from "./workers/adminRisk.js";
import { startStableFxAdapter } from "./workers/stableFxAdapter.js";
import { startProofVerifier } from "./workers/proofVerifier.js";
import { startLifecycleReminders } from "./workers/lifecycleReminders.js";
import { watchDlq, stopDlqWatch } from "./workers/_dlq.js";

async function scheduleCrons() {
  // Repeatable jobs (BullMQ schedules via cron strings). Idempotent via job-id.
  await queue("lifecycle-reminders").add(
    "tick",
    { tick: new Date().toISOString() },
    { repeat: { pattern: "0 * * * *" }, jobId: "lifecycle-reminders:hourly" },
  );
  await queue("kpi-roll").add(
    "hourly",
    { window: "1h" },
    { repeat: { pattern: "0 * * * *" }, jobId: "kpi-roll:hourly" },
  );
  await queue("kpi-roll").add(
    "daily",
    { window: "24h" },
    { repeat: { pattern: "5 0 * * *" }, jobId: "kpi-roll:daily" },
  );
  await queue("admin-risk").add(
    "scan",
    { cycle: "hourly" },
    { repeat: { pattern: "*/15 * * * *" }, jobId: "admin-risk:15min" },
  );
  await queue("sanctions-refresh").add(
    "ofac",
    { source: "OFAC" },
    { repeat: { pattern: "0 2 * * *" }, jobId: "sanctions:ofac:daily" },
  );
  await queue("sanctions-refresh").add(
    "eu",
    { source: "EU" },
    { repeat: { pattern: "0 2 * * *" }, jobId: "sanctions:eu:daily" },
  );
  await queue("sanctions-refresh").add(
    "un",
    { source: "UN" },
    { repeat: { pattern: "0 2 * * *" }, jobId: "sanctions:un:daily" },
  );
}

async function boot() {
  log.info("daemon.boot", { env: env.NODE_ENV });

  const server = startHttp();

  // Workers
  startWebhookDelivery();
  startScreenAndSettle();
  startCashoutAdvancer();
  startReceiptGenerate();
  startErpSync();
  startNotifications();
  startSanctionsRefresh();
  startKpiAggregator();
  startAdminRisk();
  startStableFxAdapter();
  startProofVerifier();
  startLifecycleReminders();

  // Arc event subscriptions (only when contract addresses are pinned in env)
  startArcListener();

  // DLQ watcher — every queue we own. .
  // 4 names diverged from the actual startWorker
  // registrations (`webhook-deliver`, `cashout-advance`, `proof-verify`,
  // `fx-execute`) and `quote-engine` was deleted in . With the
  // mismatched names, BullMQ QueueEvents attached to non-existent
  // queues, so final-failure events never fired persist() → no
  // dead_letter_jobs rows, no PagerDuty backlog count for any of those
  // worker classes. Re-anchored to the real registration names.
  watchDlq([
    "webhook-deliver",
    "screen-and-settle",
    "cashout-advance",
    "receipt-generate",
    "erp-sync",
    "notify-vendor",
    "notify-lp",
    "notify-admin",
    "notify-buyer",
    "sanctions-refresh",
    "kpi-roll",
    "admin-risk",
    "fx-execute",
    "proof-verify",
    "lifecycle-reminders",
  ]);

  // Cron schedule
  await scheduleCrons();

  log.info("daemon.ready", {
    workers: 12,
    listenerEnabled: Boolean(env.INVOICE_ESCROW_ADDRESS),
  });

  // Graceful shutdown
  const shutdown = async (sig: string) => {
    log.info("daemon.shutdown", { sig });
    // + : stop the DLQ backlog poller AND
    // close the QueueEvents subscriptions BEFORE closeAll. Otherwise
    // a late `failed` event triggers persist() → queue(...).getJob
    // against a closing Redis. stopDlqWatch is now async.
    await stopDlqWatch();
    // + : stop viem's 11 watchEvent pollers
    // AND drain any in-flight handler promises BEFORE closeAll so a
    // late RPC log doesn't try to enqueue against a draining queue
    // or claim against a closing Redis. stopArcListener is now async
    // (awaits in-flight handlers with a 5s cap).
    await stopArcListener();
    server.close();
    await closeAll();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

boot().catch((e) => {
  log.error("daemon.fatal", { err: (e as Error).message });
  process.exit(1);
});
