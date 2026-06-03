import Link from "next/link";
import { LPNav } from "@/components/klaro/LPNav";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Input } from "@/components/ui/Input";
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
            className={`mt-6 ${buttonVariants({ variant: "secondary", size: "sm" })}`}
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
            <Eyebrow>Step 1 of 6 · Application</Eyebrow>
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
            <Input
              name="legalEntityName"
              required
              defaultValue={lp.legalEntityName ?? ""}
              placeholder="Mudrex Pvt Ltd"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Country of incorporation
            </span>
            <Input
              name="country"
              required
              defaultValue={lp.country ?? ""}
              placeholder="IN"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Payout wallet (Arc)
            </span>
            <Input
              name="wallet"
              required
              defaultValue={lp.wallet ?? ""}
              placeholder="0x…"
              className="font-mono"
            />
            <span className="text-[11px] text-[var(--color-ink-subtle)]">
              Where Klaro will release USDC when you complete a cashout. Change
              it later in settings.
            </span>
          </label>

          <Button type="submit" size="sm">
            Save & continue to documents →
          </Button>
        </form>
      </section>
    </main>
  );
}
