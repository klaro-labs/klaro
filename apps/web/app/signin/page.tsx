"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/klaro/Logo";
import {
  sendEmailMagicLink,
  signInWithGoogleUrl,
} from "@/lib/auth";
import { webAuthnSupported } from "@/lib/webauthn";

type AuthStatus = "idle" | "sending" | "sent" | "error";

/** Single-column quiet sign-in. 420px card on desktop, full-width 24px gutter
 * on mobile with stacked CTAs and safe-area inset bottom. */
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [passkeyOn, setPasskeyOn] = useState(false);

  // surface ?error=… that the server redirect attached (e.g. email collision).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("error");
    if (e === "email_already_claimed") {
      setStatus("error");
      setErrorMsg(
        "This email is already linked to another Klaro account. Sign in with the original provider (Google or magic link) you used first, or contact support.",
      );
    }
    setPasskeyOn(webAuthnSupported());
  }, []);

  // Route every auth provider through /auth/callback so the server can
  // exchange the verify token for session cookies. Previously this pointed
  // at /vendor directly, so the magic-link flow landed on /vendor with the
  // ?code= in the URL and middleware bounced to /signin (no session was
  // ever created). P0 bug found during 2026-05-28 QA.
  const callbackUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback?next=/vendor`
      : "/auth/callback?next=/vendor";

  async function handleGoogle() {
    try {
      const url = await signInWithGoogleUrl(callbackUrl);
      window.location.href = url;
    } catch (e) {
      setStatus("error");
      setErrorMsg((e as Error).message);
    }
  }

  async function handlePasskey() {
    try {
      const res = await fetch("/api/v1/webauthn/assert/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("passkey_unavailable");
      // The actual ceremony happens in the assert/verify route; for the audit
      // slice we land the CTA wired to the existing options endpoint. Full
      // navigator.credentials.get round-trip is implemented in the webauthn
      // workstream (route exists at /api/v1/webauthn/assert/verify).
      router.push("/vendor");
    } catch (e) {
      setStatus("error");
      setErrorMsg(
        "Passkey unavailable on this device. Try Google or magic link instead.",
      );
      void e;
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);
    const res = await sendEmailMagicLink(email, callbackUrl);
    if (!res.ok) {
      setStatus("error");
      setErrorMsg(res.error ?? "We couldn't send the link. Try again.");
      setAttempts((n) => n + 1);
      return;
    }
    if (res.simulated) {
      router.push("/vendor");
      return;
    }
    setStatus("sent");
    setAttempts(0);
  }

  const showRescue = attempts >= 3;

  return (
    <main
      className="grid min-h-screen place-items-center bg-[var(--color-bg)] px-6 pb-[env(safe-area-inset-bottom)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="w-full max-w-[420px] py-12 md:py-0">
        <div className="mb-8 flex justify-center">
          <Logo size={26} />
        </div>

        <p className="text-center font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
          Sign in
        </p>
        <h1 className="mt-2 text-center font-display text-3xl font-semibold tracking-tight">
          Welcome to Klaro
        </h1>

        {/* Hidden username so password managers can pair the email with the
            stored passkey credential. */}
        <input
          type="text"
          name="username"
          autoComplete="username webauthn"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
        />

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={handleGoogle}
            className="flex h-11 w-full items-center justify-center gap-3 rounded-pill bg-[var(--color-ink)] text-sm font-medium text-white hover:bg-black"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          {passkeyOn && (
            <button
              type="button"
              onClick={handlePasskey}
              className="flex h-11 w-full items-center justify-center gap-3 rounded-pill border border-[var(--color-line)] bg-[var(--color-bg-elevated)] text-sm font-medium hover:bg-[var(--color-bg)]"
            >
              Sign in with passkey
            </button>
          )}

          <div className="my-2 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            <span className="h-px flex-1 bg-[var(--color-line)]" />
            or
            <span className="h-px flex-1 bg-[var(--color-line)]" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="h-11 w-full rounded-pill border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-4 text-sm placeholder:text-[var(--color-ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)]"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="flex h-11 w-full items-center justify-center gap-3 rounded-pill border border-[var(--color-line)] bg-[var(--color-bg-elevated)] text-sm font-medium hover:bg-[var(--color-bg)] disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
          </form>

          {status === "sent" && (
            <div
              role="status"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800"
            >
              Check {email} for a magic link. Klaro will sign you in when you
              click it.
            </div>
          )}
          {status === "error" && errorMsg && (
            <div
              role="alert"
              className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800"
            >
              {errorMsg}
            </div>
          )}
          {showRescue && (
            <button
              type="button"
              onClick={handleGoogle}
              className="block w-full text-center text-xs text-[var(--color-klaro-orange)] underline"
            >
              Trouble with magic links? Try Google instead.
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--color-ink-muted)]">
          First time? Klaro auto-creates a workspace for your email.
        </p>

        <p className="mt-8 text-center text-[11px] text-[var(--color-ink-subtle)]">
          By continuing you agree to our{" "}
          <Link
            href="/legal/terms"
            className="underline hover:text-[var(--color-ink-muted)]"
          >
            terms
          </Link>{" "}
          and{" "}
          <Link
            href="/legal/privacy"
            className="underline hover:text-[var(--color-ink-muted)]"
          >
            privacy notice
          </Link>
          . Klaro is not a bank · testnet preview · no real money moves.
        </p>
      </div>
    </main>
  );
}
