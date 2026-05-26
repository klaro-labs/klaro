/**
 * Tiny health server. Railway hits /healthz; status page hits /status.
 * Intentionally raw Node http to avoid pulling in Express/Fastify.
 */
import http from "node:http";
import { redis } from "./redis.js";
import { sb } from "./db.js";
import { env } from "./env.js";
import { log } from "./log.js";

export function startHttp(): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/healthz") {
        const r = await redis()
          .ping()
          .catch(() => null);
        const ok = r === "PONG";
        res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok, redis: r }));
        return;
      }
      if (req.url === "/status") {
        const redisOk = await Promise.resolve(redis().ping())
          .then((r) => r === "PONG")
          .catch(() => false);
        // previously `.then(() => true, () => false)`
        // resolved true for every PostgREST `{error}` response (RLS
        // denial, missing schema, key rotation, 5xx) — only network
        // rejections hit the error arm. Health probes lied to Railway.
        // Same swallow class as -85 sweep, just at the health
        // endpoint that the sweep missed.
        const dbOk = await sb()
          .from("audit_logs")
          .select("id", { count: "exact", head: true })
          .then(
            (r) => !r.error,
            () => false,
          );
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            ok: redisOk && dbOk,
            redis: redisOk,
            supabase: dbOk,
            at: new Date().toISOString(),
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    } catch (e) {
      log.error("http.handler", { err: (e as Error).message });
      res.writeHead(500);
      res.end();
    }
  });
  server.listen(env.PORT, () => log.info("http.listening", { port: env.PORT }));
  return server;
}
