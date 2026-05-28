"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/klaro/Logo";
import { sendEmailMagicLink, signInWithGoogleUrl } from "@/lib/auth";

/**
 * Sign-in / welcome page — responsive.
 * Mobile (<md): dark welcome screen matching designer/mobile/01-01-welcome.
 * Bottom-aligned content over a subtle blue radial-glow.
 * Desktop (≥md): centered light card with Google + email form.
 * Both paths call the same auth helpers (sendEmailMagicLink + signInWithGoogleUrl).
 */
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // web F-1: surface server-redirect error params (e.g. when
  // getOrAutoProvisionVendor's `validation_email_already_claimed` would
  // otherwise leave the user looping back to /signin with no explanation).
  // moved from render-body setTimeout (React anti-pattern) into
  // useEffect — runs once on mount, clean side-effect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("error");
    if (e === "email_already_claimed") {
      setStatus("error");
      setErrorMsg(
        "This email is already linked to another Klaro account. Sign in with the original provider (Google or magic link) you used the first time, or contact support.",
      );
    }
  }, []);

  const callbackUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/vendor`
      : "/vendor";

  async function handleGoogle() {
    try {
      const url = await signInWithGoogleUrl(callbackUrl);
      window.location.href = url;
    } catch (e) {
      setStatus("error");
      setErrorMsg((e as Error).message);
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
      return;
    }
    if (res.simulated) {
      router.push("/vendor");
      return;
    }
    setStatus("sent");
  }

  return (
    <>
      {/* ─── MOBILE (<md) — dark welcome per designer/mobile/01-01 ─── */}
      <main className="relative isolate flex min-h-screen flex-col overflow-hidden bg-[var(--color-ink)] px-6 text-white md:hidden">
        {/* Blue radial-glow lower-right */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-[-30%] bottom-[20%] -z-10 h-[640px] w-[640px] rounded-full bg-[var(--color-brand)] opacity-[0.06] blur-[140px]"
        />

        <div className="pt-12">
          <Logo size={28} />
        </div>

        <div className="mt-auto pb-10">
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight">
            Get paid
            <br />
            in <span className="text-[var(--color-brand)]">seconds.</span>
          </h1>
          <p className="mt-4 max-w-sm text-base text-white/70">
            Invoice anyone in USDC. Cash out to local currency.
          </p>

          <div className="mt-6 inline-flex rounded-pill border border-white/15 bg-white/5 px-4 py-2 font-mono text-xs text-white/70">
            USDC · EURC · INR · BRL · MXN · +7 more
          </div>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleGoogle}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-white text-sm font-medium text-[var(--color-ink)] hover:bg-white/90"
            >
              <span aria-hidden className="text-[var(--color-brand)]">
                G
              </span>
              Continue with Google
            </button>
            <form onSubmit={handleEmail}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="mb-2 h-12 w-full rounded-pill border border-white/15 bg-white/5 px-5 text-sm text-white placeholder:text-white/40 focus:border-[var(--color-brand)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={status === "sending"}
                className="flex h-12 w-full items-center justify-center rounded-pill border border-white/15 bg-white/5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
              >
                {status === "sending" ? "Sending…" : "Continue with email"}
              </button>
            </form>
          </div>

          {status === "sent" && (
            <div className="mt-4 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
              Check {email} for a magic link.
            </div>
          )}
          {status === "error" && errorMsg && (
            <div className="mt-4 rounded-md border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          <p className="mt-5 text-center text-[11px] text-white/50">
            Free on testnet · no phone required
          </p>
        </div>
      </main>

      {/* ─── DESKTOP (≥md) — centered light card ─── */}
      <main className="hidden min-h-screen place-items-center bg-[var(--color-bg)] px-6 md:grid">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Logo size={26} />
          </div>

          <h1 className="text-center font-display text-3xl font-semibold tracking-tight">
            Sign in to Klaro
          </h1>
          <p className="mt-2 text-center text-sm text-[var(--color-ink-muted)]">
            New here? An account is created automatically when you sign in for
            the first time.
          </p>

          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={handleGoogle}
              className="flex h-11 w-full items-center justify-center gap-3 rounded-pill border border-[var(--color-line)] bg-[var(--color-bg-elevated)] text-sm font-medium hover:bg-[var(--color-bg)]"
            >
              <span aria-hidden className="text-base">
                G
              </span>
              Continue with Google
            </button>

            <button
              type="button"
              className="flex h-11 w-full items-center justify-center gap-3 rounded-pill border border-[var(--color-line)] bg-[var(--color-bg-elevated)] text-sm font-medium hover:bg-[var(--color-bg)]"
            >
              Sign in with passkey
            </button>

            <form onSubmit={handleEmail} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="h-11 w-full rounded-pill border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-4 text-sm placeholder:text-[var(--color-ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)]"
              />
              <button
                type="submit"
                disabled={status === "sending"}
                className="flex h-11 w-full items-center justify-center gap-3 rounded-pill bg-[var(--color-ink)] text-sm font-medium text-white hover:bg-black disabled:opacity-50"
              >
                {status === "sending" ? "Sending…" : "Continue with email"}
              </button>
            </form>

            {status === "sent" && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                Check {email} for a magic link. Klaro will sign you in when you
                click it.
              </div>
            )}
            {status === "error" && errorMsg && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                {errorMsg}
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-[11px] text-[var(--color-ink-subtle)]">
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
    </>
  );
}
