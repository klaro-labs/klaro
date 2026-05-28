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
            <span aria-hidden className="text-base">G</span>
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
