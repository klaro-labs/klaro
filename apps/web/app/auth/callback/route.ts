/**
 * Auth callback — completes the magic-link / OAuth flow.
 *
 * Supabase emails a verify URL with `redirect_to=<this route>?next=<target>`.
 * Supabase redirects here with one of:
 *   - `?code=<pkce_code>` (PKCE flow — exchange for session via SDK)
 *   - `?token_hash=<hash>&type=<type>` (implicit / OTP — verify directly)
 *
 * Without this route the verify redirect lands on the target page (e.g.
 * /vendor) with the code in the URL but nothing exchanges it for a session
 * — middleware then bounces back to /signin, indefinitely. That was the
 * P0 bug found during P0-1 QA on 2026-05-28.
 *
 * On success: session cookies are set and we redirect to `next` (default
 * /vendor). On failure: redirect back to /signin with a clear ?error.
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseLive, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/env";
import { captureError } from "@/lib/sentry";
import { isSafeOriginRelative } from "@/lib/safeRedirect";

const SAFE_NEXT_DEFAULT = "/vendor";

// QA-019/044/045 consolidation: route same-origin-path validation through
// the shared lib/safeRedirect helper so the 3 redirect call sites use one
// allow-list. Returns origin-relative pathname+search (not a full URL)
// because Supabase exchangeCodeForSession constructs the final URL.
function safeNext(raw: string | null, origin: string): string {
  if (!raw) return SAFE_NEXT_DEFAULT;
  if (!isSafeOriginRelative(raw, origin)) return SAFE_NEXT_DEFAULT;
  const u = new URL(raw, origin);
  return u.pathname + u.search;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as
    | "magiclink"
    | "signup"
    | "recovery"
    | "invite"
    | "email"
    | "email_change"
    | null;
  const errorParam = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");
  const next = safeNext(url.searchParams.get("next"), origin);

  if (errorParam) {
    return NextResponse.redirect(
      new URL(
        `/signin?error=${encodeURIComponent(errorDesc ?? errorParam)}`,
        origin,
      ),
    );
  }

  if (!supabaseLive()) {
    // Dev / mock-auth mode — just bounce to next.
    return NextResponse.redirect(new URL(next, origin));
  }

  try {
    const { createServerClient } = await import("@supabase/ssr");
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();

    const supabase = createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    });

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        captureError(error, { route: "auth.callback.exchangeCode" });
        return NextResponse.redirect(
          new URL(
            `/signin?error=${encodeURIComponent(error.message)}`,
            origin,
          ),
        );
      }
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (error) {
        captureError(error, { route: "auth.callback.verifyOtp" });
        return NextResponse.redirect(
          new URL(
            `/signin?error=${encodeURIComponent(error.message)}`,
            origin,
          ),
        );
      }
    } else {
      return NextResponse.redirect(
        new URL("/signin?error=missing_code", origin),
      );
    }

    return NextResponse.redirect(new URL(next, origin));
  } catch (e) {
    captureError(e, { route: "auth.callback" });
    return NextResponse.redirect(
      new URL("/signin?error=callback_failed", origin),
    );
  }
}
