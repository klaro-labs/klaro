import Link from "next/link";
import { LPNav } from "@/components/klaro/LPNav";
import { Badge } from "@/components/ui/Badge";
import { getCurrentLpSession } from "@/lib/auth";
import { submitApplicationAction } from "../actions";

export default async function LPApplyPage() {
  // derive LP from session.
  const session = await getCurrentLpSession();
  if (!session) {
    return (
      <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
        <LPNav entityName="Klaro LP" />
        <section className="mx-auto w-full max-w-[700px] px-6 py-16 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Not yet invited.
          </h1>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            LP onboarding is invite-only. Email{" "}
            <a
              className="text-[var(--color-brand)] hover:underline"
              href="mailto:lp@klaro.so"
            >
              lp@klaro.so
            </a>{" "}
            with your legal entity name + country to apply.
          </p>
          <Link
            href="/lp"
            className="mt-6 inline-flex rounded-full border border-[var(--color-ink)]/20 bg-white px-5 py-2.5 text-sm font-medium hover:border-[var(--color-ink)]/40"
          >
            Back to LP overview
          </Link>
        </section>
      </main>
    );
  }
  const { lp } = session;
  const entityName = lp.legalEntityName ?? lp.contactEmail;

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <LPNav entityName={entityName} />
      <section className="mx-auto w-full max-w-[800px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Step 1 of 6 · Application
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Tell us about your business
            </h1>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              We collect the minimum needed to KYB your entity. PII stays in
              Supabase — only hashes land on Arc.
            </p>
          </div>
          <Badge tone="info">
            Step{" "}
            {lp.status === "INVITED" || lp.status === "DRAFT"
              ? "current"
              : "complete"}
          </Badge>
        </div>

        <form
          action={submitApplicationAction}
          className="space-y-4 rounded-lg border border-[var(--color-line)] bg-white p-6"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Legal entity name
            </span>
            <input
              name="legalEntityName"
              required
              defaultValue={lp.legalEntityName ?? ""}
              placeholder="Mudrex Pvt Ltd"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Country of incorporation
            </span>
            <input
              name="country"
              required
              defaultValue={lp.country ?? ""}
              placeholder="IN"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Payout wallet (Arc)
            </span>
            <input
              name="wallet"
              required
              defaultValue={lp.wallet ?? ""}
              placeholder="0x…"
              className="rounded border border-[var(--color-line)] px-3 py-2 font-mono outline-none focus:border-[var(--color-brand)]"
            />
            <span className="text-[11px] text-[var(--color-ink-subtle)]">
              Where Klaro will release USDC when you complete a cashout. Change
              it later in settings.
            </span>
          </label>

          <button
            type="submit"
            className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
          >
            Save & continue to documents →
          </button>
        </form>
      </section>
    </main>
  );
}
