import {
  supabaseLive,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  KLARO_ALLOW_MOCK_AUTH,
} from "./env";
import { mockGetCurrentVendor } from "./mockData";
import { getPrimaryLpForVendor } from "./repo/lpMembers";
import { getOrAutoProvisionVendor } from "./repo/vendors";
import type { Vendor } from "./types";
import type { LPApplication } from "./mockData";

/** Klaro session roles. Operator = admin console + LP approval; Vendor = own data only. */
export type Role = "vendor" | "operator";

export interface Session {
  vendor: Vendor;
  role: Role;
  /** true when this session came from the mock fallback */
  simulated: boolean;
}

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Production fail-closed gate. In prod, mock-mode auth refuses to grant any
 * session — anonymous visitors must not silently become "the seeded vendor".
 * .
 */
function mockFallbackAllowed(): boolean {
  if (!IS_PROD) return true;
  // read via env.ts so the flag is documented in a single
  // audit-trail boundary instead of 2 string-key lookups across files.
  return KLARO_ALLOW_MOCK_AUTH;
}

export async function getCurrentSession(): Promise<Session | null> {
  if (supabaseLive()) return await getSupabaseSession();
  if (!mockFallbackAllowed()) return null;

  const vendor = await mockGetCurrentVendor();
  if (!vendor) return null;
  // Mock mode in dev: grant operator role by default so /admin is reachable.
  return { vendor, role: "operator", simulated: true };
}

/** Convenience guard for admin/operator routes + server actions. */
export async function requireOperator(): Promise<Session> {
  const s = await getCurrentSession();
  if (!s) throw new Error("not signed in");
  if (s.role !== "operator") throw new Error("operator role required");
  return s;
}

/** Convenience guard for vendor-scoped server actions. */
export async function requireVendor(): Promise<Session> {
  const s = await getCurrentSession();
  if (!s) throw new Error("not signed in");
  return s;
}

/** LP-scoped session. Resolves the LP from the vendor membership table — never
 * the first-LP-in-the-list shortcut that gated . Returns null
 * if signed-in but the vendor isn't a member of any LP. */
export interface LpSession extends Session {
  lp: LPApplication;
}

export async function getCurrentLpSession(): Promise<LpSession | null> {
  const s = await getCurrentSession();
  if (!s) return null;
  const lp = await getPrimaryLpForVendor(s.vendor.id);
  if (!lp) return null;
  return { ...s, lp };
}

export async function requireLp(): Promise<LpSession> {
  const s = await getCurrentLpSession();
  if (!s) throw new Error("not an LP member — request access at lp@klaro.so");
  return s;
}

async function getSupabaseSession(): Promise<Session | null> {
  let supabase, user;
  try {
    const { createServerClient } = await import("@supabase/ssr");
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    supabase = createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // cookieStore.set throws "Cookies can only be modified in a Server
        // Action or Route Handler" when invoked from a Server Component.
        // Supabase calls setAll on every getUser() to rotate the refresh
        // token, so a Server-Component-only call site (vendor layout +
        // every server page) will crash with 500 the moment the access
        // token expires. Swallow per the canonical Supabase SSR pattern:
        // https://supabase.com/docs/guides/auth/server-side/nextjs
        // The middleware (which IS a Route Handler context) writes the
        // refreshed cookies for us on the next request.
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // ignore — see comment above
          }
        },
      },
    });
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch (e) {
    // Supabase backend transient outage — surface as not-signed-in, but log.
    console.error("[auth] supabase getUser failed", e);
    return null;
  }
  if (!user) return null;

  // Role comes from Supabase user app_metadata (set by operator-onboarding flow).
  const role: Role =
    (user.app_metadata?.klaro_role as Role) === "operator"
      ? "operator"
      : "vendor";

  // previously synthesized `vendor.id = user.id` from
  // Supabase auth.uid(). But `vendors.id` is a separate gen_random_uuid()
  // linked via `vendors.supabase_user_id` (migration 0002:17-19); every
  // FK uses `vendor_id references vendors(id)` and every RLS policy
  // uses `current_vendor_id()`. Synthesizing from auth.uid meant every
  // live-mode `listInvoicesForVendor(session.vendor.id)` /
  // `getInvoice` ownership check / cashout filter ran with the wrong
  // id → empty result set or FK violation on write.
  // switched from `getVendorBySupabaseUserId` to
  // `getOrAutoProvisionVendor` (with the user's email). strictly
  // returned null when no vendors row linked — but the project shipped
  // without a post-signup trigger, so every first-time signup looped
  // back to /signin forever. Migration 0017 installs the trigger; this
  // helper is the defense-in-depth fallback (covers the post-signup
  // race window OR projects on older migration versions).
  // F-3 (web audit): only vendors get a vendors row auto-
  // provisioned. Operators have no business reason to occupy a
  // vendor record — pollutes vendor-count / billing / KYB queries.
  // Operator-onboarding deliberately seeds an `admins` row (migration
  // 0002:5) via the operator-onboarding flow; auth here just trusts
  // app_metadata.klaro_role.
  if (role === "operator") {
    // Synthesize a minimal "stub" vendor profile for operator
    // sessions so downstream type contracts hold. The `id` is the
    // supabase user id (not a vendors-table id); no FK targets it.
    const stub: Vendor = {
      id: user.id,
      email: user.email ?? "",
      displayName:
        (user.user_metadata?.full_name as string) ?? user.email ?? "Operator",
      wallet: null,
      createdAt: new Date(user.created_at),
    };
    return { vendor: stub, role, simulated: false };
  }

  let v: Vendor | null;
  try {
    v = await getOrAutoProvisionVendor(user.id, user.email ?? "");
  } catch (e) {
    // web F-1: F-5's friendly error
    // `validation_email_already_claimed` was bypassed because session
    // resolution isn't routed through handle() (server-component path).
    // Catch the specific email-collision case and redirect to
    // /signin?error=email_already_claimed so the user sees a banner
    // instead of looping back to /signin with no explanation.
    const msg = (e as Error)?.message ?? "";
    if (msg.startsWith("validation_email_already_claimed")) {
      const { redirect } = await import("next/navigation");
      redirect("/signin?error=email_already_claimed");
    }
    console.error("[auth] vendor auto-provision failed", e);
    return null;
  }
  if (!v) return null;

  return { vendor: v, role, simulated: false };
}

export async function signInWithGoogleUrl(redirectTo: string): Promise<string> {
  if (!supabaseLive()) return "/vendor";
  const { createBrowserClient } = await import("@supabase/ssr");
  const supabase = createBrowserClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
  return data?.url ?? redirectTo;
}

/** Audit fix 2026-05-25 P0-7: signin had no email path. Magic-link kicks off
 * the OTP flow; Supabase emails the user; callback at /auth/callback creates
 * the session cookie.
 * previously called Supabase
 * directly from the browser via `createBrowserClient` — Klaro's edge
 * middleware couldn't see the request, so the per-IP rate limiter
 * (`/api/*` bucket) never applied. Now POSTs to a Klaro
 * `/api/auth/magic` proxy so the existing limiter catches it. */
export async function sendEmailMagicLink(
  email: string,
  redirectTo: string,
): Promise<{ ok: boolean; simulated: boolean; error?: string }> {
  if (!email.includes("@"))
    return { ok: false, simulated: false, error: "invalid email" };
  try {
    const res = await fetch("/api/auth/magic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, redirectTo }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      simulated?: boolean;
      error?: string;
    };
    if (!res.ok)
      return {
        ok: false,
        simulated: false,
        error: data?.error ?? "magic_link_failed",
      };
    return { ok: true, simulated: Boolean(data?.simulated) };
  } catch (e) {
    return {
      ok: false,
      simulated: false,
      error: (e as Error).message || "network_error",
    };
  }
}

export function isSimulatedAuth(): boolean {
  return !supabaseLive();
}

/** Vendor's wallet has been provisioned by Circle Wallets. Refuse flows that
 * would otherwise pay to the zero address. .
 * returns the narrowed Hex so callers can assign to a
 * non-nullable field without re-asserting. `Vendor.wallet` is `Hex | null`
 * to make the unprovisioned state explicit; this helper enforces the
 * invariant at action boundaries. */
export function assertVendorWalletProvisioned(
  vendor: Vendor,
): Vendor["wallet"] & string {
  const ZERO = "0x" + "0".repeat(40);
  if (!vendor.wallet || vendor.wallet.toLowerCase() === ZERO) {
    throw new Error(
      "vendor wallet not yet provisioned — complete Circle Wallets setup",
    );
  }
  return vendor.wallet;
}
