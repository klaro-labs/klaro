import Link from "next/link";
import { LPNav } from "@/components/klaro/LPNav";
import { Badge } from "@/components/ui/Badge";
import { getCurrentLpSession } from "@/lib/auth";

const STEPS = [
  {
    title: "1. Vendor opens a cashout",
    body: "A vendor opens a simulated local-currency cashout. The demo shows the intended escrow step, but no USDC is locked or moved.",
  },
  {
    title: "2. Klaro routes the order to you",
    body: "The demo matcher assigns an LP profile by tier and corridor. You see resulting simulated orders on the Queue page.",
  },
  {
    title: "3. You pay the vendor off-chain",
    body: "In a live partner flow the LP would send local currency. The current workflow does not make or request a bank payment.",
  },
  {
    title: "4. Upload proof of payment",
    body: "The demo displays a proof-submission state only. Verified evidence and ProofRegistry commitment are live-mode requirements.",
  },
  {
    title: "5. Vendor confirms receipt",
    body: "Vendor can complete the simulated result or open a dispute. No escrow release or bank receipt is asserted.",
  },
  {
    title: "6. Disputes (rare)",
    body: "If the vendor disputes, the demo admin queue records an outcome. Contracts must enforce that outcome before any live fund route is enabled.",
  },
];

export default async function LPWalkthroughPage() {
  const session = await getCurrentLpSession();
  const entityName =
    session?.lp.legalEntityName ?? session?.lp.contactEmail ?? "Klaro LP";

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <LPNav entityName={entityName} />
      <section className="mx-auto w-full max-w-[800px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Step 4 of 6 · Walkthrough
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              How a Klaro cashout works
            </h1>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              Six demo steps showing the intended LP experience. No local payout
              or escrow release occurs in this preview.
            </p>
          </div>
          <Badge tone="info">5 min read</Badge>
        </div>

        <ol className="space-y-4">
          {STEPS.map((s) => (
            <li
              key={s.title}
              className="rounded-lg border border-[var(--color-line)] bg-white p-5"
            >
              <h2 className="font-display text-lg font-semibold">{s.title}</h2>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                {s.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex gap-3">
          <Link
            href="/lp/queue"
            className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
          >
            Go to demo queue →
          </Link>
          <Link
            href="/lp/disputes-explainer"
            className="rounded border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-medium hover:border-[var(--color-brand)]"
          >
            Read disputes explainer
          </Link>
        </div>
      </section>
    </main>
  );
}
