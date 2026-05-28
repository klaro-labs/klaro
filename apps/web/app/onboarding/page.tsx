"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/klaro/Logo";
import { Pill } from "@/components/ui/Pill";

const STEPS = [
  { id: 1, label: "Business" },
  { id: 2, label: "Wallet" },
  { id: 3, label: "Verification" },
  { id: 4, label: "First invoice" },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");

  function next() {
    if (step < 4) setStep(step + 1);
    else router.push("/vendor");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-bg)] px-6 text-[var(--color-ink)]">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex justify-center">
          <Logo size={26} />
        </div>

        {/* Progress */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span
                className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-medium ${
                  s.id <= step
                    ? "bg-[var(--color-ink)] text-white"
                    : "bg-[var(--color-line)] text-[var(--color-muted)]"
                }`}
              >
                {s.id}
              </span>
              {s.id < 4 && (
                <span className={`h-px w-6 ${s.id < step ? "bg-[var(--color-ink)]" : "bg-[var(--color-line)]"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-8">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
                  Step 1 of 4
                </p>
                <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
                  Business basics
                </h1>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  We use this to label your invoices and receipts.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Business name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Design Studio"
                  className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-klaro-orange)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Country
                </label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="India"
                  className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-klaro-orange)]"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
                  Step 2 of 4
                </p>
                <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
                  Connect a wallet
                </h1>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  Your wallet receives USDC when customers pay. You can change it later in Settings.
                </p>
              </div>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center rounded-pill border border-[var(--color-line)] text-sm font-medium hover:bg-[var(--color-bg-warm)]"
              >
                Connect wallet via Circle App Kit
              </button>
              <Pill tone="default" size="sm">Simulated in testnet mode</Pill>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
                  Step 3 of 4
                </p>
                <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
                  Verification
                </h1>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  KYB verification unlocks higher limits and partner cashout. You can skip this for now.
                </p>
              </div>
              <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-bg-warm)] p-5 text-center">
                <Pill tone="default" size="sm">Simulated · pending real provider</Pill>
                <p className="mt-3 text-xs text-[var(--color-muted)]">
                  KYB verification will be available when Sumsub credentials are configured.
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div>
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
                  Step 4 of 4
                </p>
                <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
                  Create your first invoice
                </h1>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  Send a test invoice to yourself to see the full flow — creation, payment link, and receipt.
                </p>
              </div>
              <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] p-4">
                <p className="text-sm font-medium">Demo invoice</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  $100.00 USDC · To: your email · Due: 14 days
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={next}
            className="mt-8 flex h-11 w-full items-center justify-center rounded-pill bg-[var(--color-ink)] text-sm font-medium text-white transition-all duration-150 hover:bg-black active:scale-[0.97]"
          >
            {step < 4 ? "Continue" : "Open workspace"}
          </button>

          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="mt-3 flex h-11 w-full items-center justify-center rounded-pill text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              Back
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-[var(--color-muted)]">
          You can complete any step later from Settings.
        </p>
      </div>
    </main>
  );
}
