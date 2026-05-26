/**
 * Public health probe — returns 200 if the web app can render + reach Supabase.
 * Vercel + Better Stack heartbeat both hit this.
 */
import { ok, err } from "@/lib/api";
import { tryDb } from "@/lib/db";
import { captureError } from "@/lib/sentry";

export async function GET() {
  const c = await tryDb();
  if (!c) return ok({ ok: true, mode: "mock", at: new Date().toISOString() });
  const { error } = await c
    .from("audit_logs")
    .select("id", { count: "exact", head: true });
  if (error) {
    // previously returned
    // `err(503, "db_unreachable", { detail: error.message })` — public
    // unauthenticated endpoint leaking PostgREST schema/table context.
    // Sentry captures the real error; HTTP response is the sanitized code.
    captureError(error, { where: "health.dbReachability" });
    return err(503, "db_unreachable");
  }
  return ok({ ok: true, mode: "live", at: new Date().toISOString() });
}
