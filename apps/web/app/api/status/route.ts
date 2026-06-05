import { ok } from "@/lib/api";
import { tryDb } from "@/lib/db";

/**
 * Public JSON status feed — drives myklaro.app/status + BetterStack heartbeats.
 * Returns a single rollup the status page renders into operational/degraded/outage tiers.
 */
export async function GET() {
  const t0 = Date.now();
  const c = await tryDb();
  let supabaseOk = !c; // if no Supabase configured, treat as "mock OK" so status doesn't go red in dev
  if (c)
    // previously `.then(() => true, () => false)` only
    // caught network rejections — PostgREST resolves `{data, error}`
    // on RLS denial / 5xx / key rotation, so this swallowed the
    // error arm and reported supabase=operational to the public
    // status page. Same defect class as (daemon /status).
    supabaseOk = await c
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .then(
        (r) => !r.error,
        () => false,
      );

  const services = [
    { name: "www.myklaro.app web", scope: "infra", status: "operational" },
    { name: "Hosted invoice / receipt", scope: "infra", status: "operational" },
    {
      name: "Operator daemon",
      scope: "infra",
      status: supabaseOk ? "operational" : "degraded",
    },
    { name: "Arc testnet RPC", scope: "onchain", status: "operational" },
    {
      name: "Supabase",
      scope: "infra",
      status: supabaseOk ? "operational" : "outage",
    },
    // Honesty fix (launch audit): these were hardcoded "operational" but the
    // cross-chain integrations are SIMULATED on testnet — the inbound
    // CCTP/Gateway settlement handler isn't wired (see /vendor/transit, which
    // labels them "Simulated · integration pending"). Report them as `pending`
    // so the public status page never overclaims a live integration.
    {
      name: "Circle Gateway",
      scope: "integration",
      status: "pending",
      note: "integration pending — testnet simulated",
    },
    {
      name: "CCTP V2",
      scope: "integration",
      status: "pending",
      note: "integration pending — testnet simulated",
    },
  ];
  // Pending (not-yet-launched) integrations don't count toward the live rollup —
  // they're neither operational nor degraded, just not shipped yet.
  const live = services.filter((s) => s.status !== "pending");
  const overall = live.every((s) => s.status === "operational")
    ? "operational"
    : live.some((s) => s.status === "outage")
      ? "outage"
      : "degraded";
  return ok({
    overall,
    services,
    fetched_at: new Date().toISOString(),
    latency_ms: Date.now() - t0,
  });
}
