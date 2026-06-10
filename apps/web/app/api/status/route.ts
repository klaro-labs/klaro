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

  // Real daemon liveness: the worker beats ops_heartbeats.service='daemon'
  // every ~60s (it has no public URL on DO, so the beat is the only signal).
  // <5m fresh → operational; <30m → degraded; older/missing → outage. Without
  // this, daemon status was inferred from Supabase reachability — wrong signal,
  // a dead worker reported green while paid invoices sat unsettled.
  // Default: mock/dev (no DB) → operational; DB configured but unreachable →
  // degraded (heartbeat unknowable). The block below overwrites with the real
  // beat-derived value when the DB is reachable.
  let daemonStatus: "operational" | "degraded" | "outage" = c
    ? "degraded"
    : "operational";
  let daemonNote: string | undefined;
  if (c && supabaseOk) {
    // ops_heartbeats is newer than the generated Database types; narrow cast
    // (same pattern as erp_connections reads on the ERP page).
    const hbClient = c as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (
            col: string,
            val: string,
          ) => {
            maybeSingle: () => Promise<{ data: { beat_at: string } | null }>;
          };
        };
      };
    };
    const { data: hb } = await hbClient
      .from("ops_heartbeats")
      .select("beat_at")
      .eq("service", "daemon")
      .maybeSingle();
    const beatAt = hb?.beat_at ? Date.parse(hb.beat_at as string) : NaN;
    const ageSec = Number.isFinite(beatAt)
      ? Math.round((Date.now() - beatAt) / 1000)
      : null;
    daemonStatus =
      ageSec !== null && ageSec < 300
        ? "operational"
        : ageSec !== null && ageSec < 1800
          ? "degraded"
          : "outage";
    daemonNote =
      ageSec === null
        ? "no heartbeat on record"
        : `last heartbeat ${ageSec}s ago`;
  }

  const services = [
    { name: "www.myklaro.app web", scope: "infra", status: "operational" },
    { name: "Hosted invoice / receipt", scope: "infra", status: "operational" },
    {
      name: "Operator daemon",
      scope: "infra",
      status: daemonStatus,
      ...(daemonNote ? { note: daemonNote } : {}),
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
