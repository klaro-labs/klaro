/**
 * Liveness heartbeat. Upserts ops_heartbeats.service='daemon' every ~60s so
 * /api/status (web) can report REAL daemon health from beat staleness — the
 * worker has no public URL on the DO App Platform, so this row is the only
 * outside-visible liveness signal. Fail-soft: a failed beat logs and retries
 * next tick; it must never crash the daemon.
 */
import { sb } from "./db.js";
import { log } from "./log.js";

const BEAT_MS = 60_000;
let timer: NodeJS.Timeout | null = null;

async function beat(): Promise<void> {
  try {
    const { error } = await sb()
      .from("ops_heartbeats")
      .upsert({ service: "daemon", beat_at: new Date().toISOString() });
    if (error) log.warn("heartbeat.write_failed", { err: error.message });
  } catch (e) {
    log.warn("heartbeat.write_failed", { err: (e as Error).message });
  }
}

export function startHeartbeat(): void {
  void beat();
  timer = setInterval(() => void beat(), BEAT_MS);
}

export function stopHeartbeat(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
