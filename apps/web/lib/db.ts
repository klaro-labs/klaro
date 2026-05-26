/**
 * Supabase data layer for Klaro. Two clients:
 * - `db()` — RLS-aware, uses the caller's auth cookie (set by middleware
 * in server components). Use for *vendor-facing* reads/writes
 * where row-level security must apply.
 * - `serviceDb()` — bypasses RLS via the service-role key. Use ONLY from the
 * daemon, cron, webhook receivers, and operator actions that
 * have already proven authorization via `requireOperator()`.
 * Both clients are env-gated. When `SUPABASE_URL` is absent we surface a clear
 * runtime error so callers must explicitly fall back to `mockData.ts` rather
 * than silently degrading ().
 */
import { createServerClient as createSsrClient } from "@supabase/ssr";
import {
  createClient as createPlainClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
// `cookies` from `next/headers` is a
// Server-Component-only import. When imported at module load, every consumer
// (transitively `auth.ts`, `repo/lpMembers.ts`, `signin/page.tsx`) inherits
// the constraint — and webpack fails the production build with
// "You're importing a component that needs next/headers". Moving the
// import inside the function that actually uses it lets `tryDb()` short-
// circuit in mock mode without triggering the constraint check on import.
// This was a real `pnpm build` failure not caught by `pnpm typecheck` alone.
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  supabaseLive,
} from "./env";

export function isLive(): boolean {
  return supabaseLive();
}

/** RLS-scoped client. Reads the caller's auth cookie. */
export async function db(): Promise<SupabaseClient> {
  if (!supabaseLive()) {
    throw new Error(
      "db(): SUPABASE not configured — callers must use mockData fallback",
    );
  }
  // Dynamic-import so this module doesn't drag `next/headers` into every
  // transitive consumer's graph (see fix comment at top of file).
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return createSsrClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(items) {
        try {
          for (const c of items) store.set(c.name, c.value, c.options);
        } catch {
          /* server-action context */
        }
      },
    },
  });
}

let _serviceCached: SupabaseClient | null = null;
/** Service-role client. Bypasses RLS. Use for daemon / cron / webhook receivers
 * / operator actions that already authorized via requireOperator(). */
export function serviceDb(): SupabaseClient {
  if (_serviceCached) return _serviceCached;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "serviceDb(): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required",
    );
  }
  _serviceCached = createPlainClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceCached;
}

/** Convenience: try db() (RLS) first; on failure (e.g. dev with no Supabase),
 * return null so the caller can fall back to mockData. Never silently swap. */
export async function tryDb(): Promise<SupabaseClient | null> {
  if (!supabaseLive()) return null;
  try {
    return await db();
  } catch {
    return null;
  }
}
