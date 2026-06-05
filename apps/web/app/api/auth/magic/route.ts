import { ok, err, publicErrorMessage } from "@/lib/api";
import { supabaseLive, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/env";
import { captureError } from "@/lib/sentry";
import { z } from "zod";

/// `sendEmailMagicLink` in
/// `lib/auth.ts` used to call Supabase directly from the browser via
/// `createBrowserClient`. Browser → Supabase bypasses Klaro's edge
/// middleware entirely — the per-IP rate-limiter (`/api/*` bucket) never
/// saw the request. An attacker could pound `signInWithOtp` against any
/// email, triggering Supabase's per-project throttle (project-wide DoS)
/// or harvesting account-existence signals. This route proxies the call
/// server-side so the existing limiter catches it; the original helper
/// now POSTs here instead.
const Body = z.object({ email: z.string().email(), redirectTo: z.string() });

/// redirectTo was unvalidated.
/// Attacker POSTs `{ email: "prateek@myklaro.app", redirectTo: "https://
/// evil.com/steal" }` → Supabase emails the victim a magic link whose
/// post-auth handoff lands at evil.com → auth code + session delivered
/// to attacker. Same defect class as the moonpay open-redirect closed
/// . Same allowlist pattern: same-origin paths + a curated
/// trusted-host set. If the supplied target fails the check, fall back
/// to the request origin so the auth flow still works on the canonical
/// domain.
const ALLOWED_REDIRECT_HOSTS = new Set<string>([
  // www.myklaro.app + subdomains are matched via origin equality below; this
  // is reserved for explicit partner hosts (none today).
]);

// QA-045 fix: hand-rolled whitelist had the same defect as QA-019 + QA-044
// (`!startsWith("//")` missed backslash-prefix). Consolidated to one
// shared helper so the 3 call sites can't drift apart again.
import { resolveSafeRedirect } from "@/lib/safeRedirect";

function safeRedirect(rawRedirect: string, origin: string): string {
  // Same-origin paths: validated by the shared helper.
  if (rawRedirect.startsWith("/")) {
    return resolveSafeRedirect(rawRedirect, origin, "/");
  }
  // Absolute URL — only allow same-origin or explicit partner allowlist.
  try {
    const u = new URL(rawRedirect);
    if (u.origin === origin || ALLOWED_REDIRECT_HOSTS.has(u.host)) {
      return u.toString();
    }
  } catch {
    /* not a URL */
  }
  return origin;
}

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const origin = new URL(req.url).origin;
    const safeRedirectTo = safeRedirect(body.redirectTo, origin);
    if (!supabaseLive()) {
      return ok({ simulated: true });
    }
    const { createServerClient } = await import("@supabase/ssr");
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const supabase = createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          // Persist the PKCE code-verifier cookie Supabase sets during
          // signInWithOtp. Previously this was a no-op (comment claimed
          // magic-link issuance doesn't need to mutate cookies) — but
          // PKCE flow requires the verifier on the same origin so the
          // /auth/callback route can exchange the code for a session.
          // Without this the callback throws "PKCE code verifier not
          // found in storage". P0 bug found during 2026-05-28 QA.
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    });
    const { error } = await supabase.auth.signInWithOtp({
      email: body.email,
      options: { emailRedirectTo: safeRedirectTo },
    });
    if (error) return err(400, publicErrorMessage(error, "magic_link_failed"));
    return ok({ simulated: false });
  } catch (e) {
    captureError(e, { route: "api.auth.magic" });
    return err(400, publicErrorMessage(e, "magic_link_failed"));
  }
}
