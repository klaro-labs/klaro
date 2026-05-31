/**
 * Live-branch repo test harness. The web repos are dual-mode — every existing
 * unit test forces `tryDb()→null` (mock branch), so the live SQL (real column
 * names, joins, RLS, atomic preconditions) is NEVER exercised. These helpers let
 * a test point a repo's `tryDb()` at a REAL Supabase client against the live
 * project: a service-role client for seed/cleanup, and an RLS-scoped client
 * authenticated AS the test vendor (so policies actually apply).
 *
 * Gated: tests use `describe.skipIf(!liveEnv().available)` so the default
 * `pnpm test` (no .env.local / no network) skips them cleanly; they run here
 * (and anywhere .env.local + network exist). vitest doesn't auto-load
 * .env.local, so we read it ourselves like the e2e fixtures.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function readEnvLocal(): Record<string, string> {
  try {
    const o: Record<string, string> = {};
    for (const l of readFileSync(path.resolve(".env.local"), "utf8").split(
      /\r?\n/,
    )) {
      if (!l || l.startsWith("#")) continue;
      const i = l.indexOf("=");
      if (i < 0) continue;
      o[l.slice(0, i).trim()] = l
        .slice(i + 1)
        .trim()
        .replace(/^"|"$/g, "");
    }
    return o;
  } catch {
    return {};
  }
}

export function liveEnv() {
  const e = readEnvLocal();
  const url = e.SUPABASE_URL ?? e.NEXT_PUBLIC_SUPABASE_URL;
  const anon = e.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? e.SUPABASE_ANON_KEY;
  const svc = e.SUPABASE_SERVICE_ROLE_KEY;
  // Opt-in: these hit live Supabase (network + creds + a shared DB) and are NOT
  // part of the hermetic unit gate. Run with `KLARO_LIVE_DB_TESTS=1 pnpm test`
  // (sequentially, see README) to exercise the live repo branches.
  const optIn = process.env.KLARO_LIVE_DB_TESTS === "1";
  return { url, anon, svc, available: Boolean(url && anon && svc && optIn) };
}

export function serviceClient(): SupabaseClient {
  const { url, svc } = liveEnv();
  return createClient(url!, svc!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** An anon Supabase client authenticated AS `email` (RLS applies). Mints a
 * magic link via the admin API, verifies it to obtain a session access token,
 * and binds that token to a fresh client — exactly the cookie the middleware
 * would carry for a logged-in vendor, but usable from a node test. */
export async function rlsClientForEmail(
  email: string,
): Promise<SupabaseClient> {
  const { url, anon, svc } = liveEnv();
  const admin = createClient(url!, svc!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(url!, anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Retry/backoff: when several live test files run in parallel they mint magic
  // links for the same user near-simultaneously and can hit the auth rate
  // limit; a couple of backed-off retries makes the opt-in run robust.
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (!error && data.properties?.hashed_token) {
      const { data: verified, error: vErr } = await anonClient.auth.verifyOtp({
        type: "magiclink",
        token_hash: data.properties.hashed_token,
      });
      if (!vErr && verified.session) {
        return createClient(url!, anon!, {
          global: {
            headers: {
              Authorization: `Bearer ${verified.session.access_token}`,
            },
          },
          auth: { persistSession: false, autoRefreshToken: false },
        });
      }
      lastErr = `verifyOtp failed: ${vErr?.message}`;
    } else {
      lastErr = `generateLink failed: ${error?.message}`;
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`rlsClientForEmail(${email}): ${lastErr}`);
}

export const TEST_VENDOR = {
  email: "xprtqk@gmail.com",
  id: "989f0a85-82e8-409b-b7d3-206e73118113",
  userId: "37adac16-1a23-4887-b822-baed0339de5b",
  wallet: "0x4743FAeFbB829C01E91e73EaeC16150DBDd6F677",
};
