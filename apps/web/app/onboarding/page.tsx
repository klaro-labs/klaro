"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/klaro/Logo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import {
  saveBusinessBasicsAction,
  saveWalletAction,
  saveVerificationIntentAction,
  recordFirstInvoiceIntentAction,
  type ActionResult,
} from "./actions";

type StepId = 1 | 2 | 3 | 4;

const STEPS: { id: StepId; label: string }[] = [
  { id: 1, label: "Business" },
  { id: 2, label: "Wallet" },
  { id: 3, label: "Verification" },
  { id: 4, label: "First invoice" },
];

interface FormState {
  displayName: string;
  country: string;
  walletAddress: string;
  walletProvider: "circle_app_kit" | "external" | "later";
  verificationIntent: "start" | "skip";
  invoiceEmail: string;
  invoiceAmount: string;
  invoiceDescription: string;
}

const DEFAULT_FORM: FormState = {
  displayName: "",
  country: "",
  walletAddress: "",
  walletProvider: "circle_app_kit",
  verificationIntent: "skip",
  invoiceEmail: "",
  invoiceAmount: "100.00",
  invoiceDescription: "Design retainer · October",
};

const STORAGE_KEY = "klaro:onboarding:v1";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<StepId>(1);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [hydrated, setHydrated] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [pending, startTransition] = useTransition();
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore from localStorage on first paint so a refresh mid-onboarding
  // doesn't wipe the user's typing.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { form?: FormState; step?: StepId };
        if (saved.form) setForm({ ...DEFAULT_FORM, ...saved.form });
        if (saved.step && saved.step >= 1 && saved.step <= 4) setStep(saved.step);
      }
    } catch {
      /* corrupt blob — ignore */
    }
    setHydrated(true);
  }, []);

  // Persist locally on every form/step change; server-persist is debounced.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ form, step }),
      );
    } catch {
      /* quota / private mode — never block */
    }
  }, [form, step, hydrated]);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  /** Debounced server-persist for the current step. Fires on blur or after
   * 400ms of inactivity. */
  function schedulePersist() {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void persistStep(false);
    }, 400);
  }

  async function persistStep(advance: boolean): Promise<boolean> {
    setServerError(null);
    let res: ActionResult = { ok: true };
    if (step === 1) {
      res = await saveBusinessBasicsAction({
        displayName: form.displayName,
        country: form.country,
      });
    } else if (step === 2 && form.walletAddress) {
      res = await saveWalletAction({ address: form.walletAddress });
    } else if (step === 3) {
      res = await saveVerificationIntentAction({
        intent: form.verificationIntent,
      });
    } else if (step === 4) {
      res = await recordFirstInvoiceIntentAction({
        customerEmail: form.invoiceEmail || "you@klaro.so",
        amountUsdc: form.invoiceAmount || "100.00",
        description: form.invoiceDescription,
      });
    }
    if (res.simulated) setSimulated(true);
    if (!res.ok) {
      if (advance) setServerError(res.error ?? "Could not save.");
      return false;
    }
    return true;
  }

  function canAdvance(): boolean {
    if (step === 1) return form.displayName.trim().length >= 1 && form.country.trim().length >= 2;
    if (step === 4) return /.+@.+/.test(form.invoiceEmail);
    return true;
  }

  function onContinue() {
    if (!canAdvance()) {
      setServerError("Fill in the required fields.");
      return;
    }
    startTransition(async () => {
      const ok = await persistStep(true);
      if (!ok) return;
      if (step < 4) {
        setStep((s) => (s + 1) as StepId);
      } else {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        router.push("/vendor?welcome=1");
      }
    });
  }

  function onBack() {
    if (step > 1) setStep((s) => (s - 1) as StepId);
  }

  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-ink)]">
      {/* Top bar: thin Klaro mark + step-out link */}
      <header className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-6 py-4">
        <Logo size={24} />
        <Link
          href="/vendor"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          Skip for now →
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-6 pt-8 pb-32 md:pb-12">
        {/* Stepper */}
        <ol className="mb-8 flex items-center gap-2" aria-label="Onboarding progress">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <span
                className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  s.id <= step
                    ? "bg-[var(--color-ink)] text-white"
                    : "bg-[var(--color-line)] text-[var(--color-muted)]"
                }`}
                aria-current={s.id === step ? "step" : undefined}
              >
                {s.id}
              </span>
              <span className="hidden text-xs text-[var(--color-muted)] md:inline">
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span
                  className={`h-px flex-1 ${
                    s.id < step ? "bg-[var(--color-ink)]" : "bg-[var(--color-line)]"
                  }`}
                />
              )}
            </li>
          ))}
        </ol>

        {/* Step body */}
        <div className="flex-1 rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6 md:p-10">
          {step === 1 && (
            <BusinessStep form={form} update={update} onBlur={schedulePersist} />
          )}
          {step === 2 && (
            <WalletStep form={form} update={update} onBlur={schedulePersist} />
          )}
          {step === 3 && (
            <VerificationStep form={form} update={update} />
          )}
          {step === 4 && (
            <FirstInvoiceStep form={form} update={update} onBlur={schedulePersist} />
          )}

          {serverError && (
            <div
              role="alert"
              className="mt-6 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
            >
              {serverError}
            </div>
          )}

          {simulated && (
            <p className="mt-4 text-[11px] text-[var(--color-muted)]">
              Simulated · changes won't persist until SUPABASE keys are configured.
            </p>
          )}
        </div>

        {/* Desktop nav */}
        <div className="mt-6 hidden items-center justify-between md:flex">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={step === 1}
          >
            ← Back
          </Button>
          <Button type="button" onClick={onContinue} disabled={pending}>
            {pending ? "Saving…" : step < 4 ? "Continue" : "Open workspace"}
          </Button>
        </div>
      </div>

      {/* Mobile sticky bottom CTA — full-screen take-over per step */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-6 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] md:hidden"
      >
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={step === 1}
          >
            ← Back
          </Button>
          <Button
            type="button"
            onClick={onContinue}
            disabled={pending}
            className="flex-1"
          >
            {pending ? "Saving…" : step < 4 ? "Continue" : "Open workspace"}
          </Button>
        </div>
      </div>
    </main>
  );
}

// ─── Step bodies ────────────────────────────────────────────────────────

const LABEL =
  "block text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]";

interface StepProps {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  onBlur?: () => void;
}

function StepHeader({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
        Step {n} of 4
      </p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{sub}</p>
    </div>
  );
}

function BusinessStep({ form, update, onBlur }: StepProps) {
  return (
    <div className="space-y-5">
      <StepHeader
        n={1}
        title="Business basics"
        sub="We use this to label your invoices and receipts. You can change it later."
      />
      <div>
        <label htmlFor="ob-name" className={LABEL}>Business name</label>
        <Input
          id="ob-name"
          autoComplete="organization"
          value={form.displayName}
          onChange={(e) => update("displayName", e.target.value)}
          onBlur={onBlur}
          placeholder="Your legal business name"
          className="mt-1.5 scroll-mb-28"
        />
      </div>
      <div>
        <label htmlFor="ob-country" className={LABEL}>Country</label>
        <Input
          id="ob-country"
          autoComplete="country-name"
          value={form.country}
          onChange={(e) => update("country", e.target.value)}
          onBlur={onBlur}
          placeholder="ISO country (e.g. IN, US, DE)"
          className="mt-1.5 scroll-mb-28"
        />
      </div>
    </div>
  );
}

function WalletStep({ form, update, onBlur }: StepProps) {
  return (
    <div className="space-y-5">
      <StepHeader
        n={2}
        title="Connect a wallet"
        sub="Your wallet receives USDC when customers pay. Circle App Kit is recommended — no seed phrase, MPC-secured."
      />
      <div className="space-y-3">
        <WalletOption
          checked={form.walletProvider === "circle_app_kit"}
          onSelect={() => update("walletProvider", "circle_app_kit")}
          title="Create a Circle MPC wallet"
          sub="Recommended. Klaro provisions it via Circle App Kit. Passkey-protected."
        />
        <WalletOption
          checked={form.walletProvider === "external"}
          onSelect={() => update("walletProvider", "external")}
          title="Use an existing wallet"
          sub="Paste the address Klaro should pay into. MetaMask, Coinbase, Phantom, etc."
        />
        <WalletOption
          checked={form.walletProvider === "later"}
          onSelect={() => update("walletProvider", "later")}
          title="Decide later"
          sub="Skip this step. You can connect from Settings → Wallet at any time."
        />
      </div>
      {form.walletProvider === "external" && (
        <div>
          <label htmlFor="ob-addr" className={LABEL}>Wallet address</label>
          <Input
            id="ob-addr"
            value={form.walletAddress}
            onChange={(e) => update("walletAddress", e.target.value)}
            onBlur={onBlur}
            placeholder="0x…"
            className="mt-1.5 scroll-mb-28 font-mono"
          />
        </div>
      )}
      {form.walletProvider === "circle_app_kit" && (
        <Pill tone="default" size="sm">
          Simulated · Circle App Kit modal lands when CIRCLE_API_KEY is configured
        </Pill>
      )}
    </div>
  );
}

function WalletOption({
  checked,
  onSelect,
  title,
  sub,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
        checked
          ? "border-[var(--color-ink)] bg-[var(--color-bg-warm)]"
          : "border-[var(--color-line)] bg-[var(--color-bg)] hover:border-[var(--color-ink)]/30"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`mt-0.5 inline-block size-4 shrink-0 rounded-full border ${
          checked
            ? "border-[var(--color-ink)] bg-[var(--color-ink)]"
            : "border-[var(--color-line)]"
        }`}
        aria-hidden
      />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs text-[var(--color-muted)]">{sub}</span>
      </span>
    </button>
  );
}

function VerificationStep({ form, update }: StepProps) {
  return (
    <div className="space-y-5">
      <StepHeader
        n={3}
        title="Verification (KYB)"
        sub="KYB unlocks higher cashout limits and partner LPs. You can come back to it from Settings."
      />
      <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-bg-warm)] p-5">
        <Pill tone="default" size="sm">
          Simulated · pending Sumsub credentials
        </Pill>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          When the Sumsub sandbox key is wired, this step opens the verification
          iframe inline. Until then, picking <em>Start now</em> records your
          intent so the operator team can pre-stage your file.
        </p>
      </div>
      <div className="space-y-3">
        <WalletOption
          checked={form.verificationIntent === "start"}
          onSelect={() => update("verificationIntent", "start")}
          title="Start KYB now"
          sub="Get on the list. Operator will email you within one business day."
        />
        <WalletOption
          checked={form.verificationIntent === "skip"}
          onSelect={() => update("verificationIntent", "skip")}
          title="Skip for now"
          sub="You can invoice and receive USDC immediately. Cashout limits apply until verified."
        />
      </div>
    </div>
  );
}

function FirstInvoiceStep({ form, update, onBlur }: StepProps) {
  return (
    <div className="space-y-5">
      <StepHeader
        n={4}
        title="Draft your first invoice"
        sub="Send a test invoice to yourself to see the full flow — creation, payment link, and receipt. You can edit it after onboarding."
      />
      <div>
        <label htmlFor="ob-inv-email" className={LABEL}>Customer email</label>
        <Input
          id="ob-inv-email"
          type="email"
          value={form.invoiceEmail}
          onChange={(e) => update("invoiceEmail", e.target.value)}
          onBlur={onBlur}
          placeholder="you@klaro.so"
          className="mt-1.5 scroll-mb-28"
        />
      </div>
      <div>
        <label htmlFor="ob-inv-amount" className={LABEL}>Amount (USDC)</label>
        <Input
          id="ob-inv-amount"
          inputMode="decimal"
          value={form.invoiceAmount}
          onChange={(e) => update("invoiceAmount", e.target.value)}
          onBlur={onBlur}
          className="mt-1.5 scroll-mb-28"
        />
      </div>
      <div>
        <label htmlFor="ob-inv-desc" className={LABEL}>Description</label>
        <Input
          id="ob-inv-desc"
          value={form.invoiceDescription}
          onChange={(e) => update("invoiceDescription", e.target.value)}
          onBlur={onBlur}
          className="mt-1.5 scroll-mb-28"
        />
      </div>
      <p className="text-xs text-[var(--color-muted)]">
        Pressing <strong>Open workspace</strong> takes you to /vendor where this
        draft is pre-filled in the New Invoice form.
      </p>
    </div>
  );
}
