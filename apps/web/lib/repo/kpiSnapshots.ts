/**
 * KPI snapshot reader. Live mode pulls the latest rolled-up rows the daemon
 * persisted via the kpiAggregator worker. Dev mode returns a small in-memory
 * preview labeled `simulated` so /internal/kpi still renders something.
 */
import { tryDb } from "../db";

export interface KpiSnapshot {
  windowLabel: "1h" | "24h" | "7d";
  invoices: number;
  settled: number;
  cashouts: number;
  takenAt: Date;
  simulated: boolean;
}

export async function latestSnapshotsByWindow(): Promise<KpiSnapshot[]> {
  const c = await tryDb();
  if (!c)
    return [
      {
        windowLabel: "1h",
        invoices: 0,
        settled: 0,
        cashouts: 0,
        takenAt: new Date(),
        simulated: true,
      },
      {
        windowLabel: "24h",
        invoices: 0,
        settled: 0,
        cashouts: 0,
        takenAt: new Date(),
        simulated: true,
      },
      {
        windowLabel: "7d",
        invoices: 0,
        settled: 0,
        cashouts: 0,
        takenAt: new Date(),
        simulated: true,
      },
    ];
  const out: KpiSnapshot[] = [];
  for (const win of ["1h", "24h", "7d"] as const) {
    // previously destructured only `{data}`. A transient
    // PostgREST 5xx → data = null → the else branch labelled this
    // window simulated:true. The page renders zeros while the daemon
    // is in fact rolling real snapshots, misleading operators reading
    // /internal/kpi during an outage. Same class as iters 82-84 daemon
    // sweeps. Surface the error so the loader fails honestly.
    const { data, error } = await c
      .from("kpi_snapshots")
      .select("*")
      .eq("window_label", win)
      .order("taken_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      out.push({
        windowLabel: win,
        invoices: Number(data.invoices),
        settled: Number(data.settled),
        cashouts: Number(data.cashouts),
        takenAt: new Date(String(data.taken_at)),
        simulated: false,
      });
    } else {
      out.push({
        windowLabel: win,
        invoices: 0,
        settled: 0,
        cashouts: 0,
        takenAt: new Date(),
        simulated: true,
      });
    }
  }
  return out;
}
