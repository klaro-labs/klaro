import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { VendorNav } from "@/components/klaro/VendorNav";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
// dual-mode via repo.
import { getInvoice } from "@/lib/repo/invoices";
import type { Hex } from "@/lib/types";

/**
 * Invoice screening detail. v2 §14.
 * Klaro runs every payment through three independent screens before settling:
 * 1. **Sanctions / OFAC** (Chainalysis or equivalent)
 * 2. **Behavioral** (velocity, structuring, mixer-adjacency)
 * 3. **KYB liveness** (vendor + buyer KYC tier still valid)
 * Only the screening *hash* is anchored on-chain ( — no PII).
 * This page renders the off-chain breakdown for the vendor's audit log;
 * mock data here, live mode pulls from the screening service.
 */

interface Screen {
  provider: string;
  result: "pass" | "fail" | "review";
  detail: string;
  ranAt: Date;
  evidenceHash: Hex;
}

const SAMPLE_SCREENS: Screen[] = [
  {
    provider: "Chainalysis · sanctions",
    result: "review",
    detail:
      "Simulated provider result only. No sanctions provider decision has been obtained.",
    ranAt: new Date(Date.now() - 1000 * 90),
    evidenceHash:
      "0x71f3aa8d5c9e7b2f8a47ba3b4d8c5e9f12a47ba3b4d8c5e9f12a47ba3b4d8c5e",
  },
  {
    provider: "Klaro behavioral · velocity",
    result: "review",
    detail:
      "Simulated behavioral preview only. No risk decision may settle this invoice.",
    ranAt: new Date(Date.now() - 1000 * 78),
    evidenceHash:
      "0x8e2af04711bd9f8a47ba3b4d8c5e9f12a47ba3b4d8c5e9f12a47ba3b4d8c5e9f",
  },
  {
    provider: "Sumsub · KYB liveness",
    result: "review",
    detail: "Simulated KYB preview only. Provider verification is pending.",
    ranAt: new Date(Date.now() - 1000 * 60),
    evidenceHash:
      "0xc4f25e1b8d8c5e9f12a47ba3b4d8c5e9f12a47ba3b4d8c5e9f12a47ba3b4d8c5",
  },
];

const RESULT_STYLE: Record<Screen["result"], string> = {
  pass: "bg-emerald-100 text-emerald-800",
  fail: "bg-red-100 text-red-800",
  review: "bg-amber-100 text-amber-800",
};

export default async function ScreeningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  const { id } = await params;
  const invoice = await getInvoice(id as Hex);
  if (!invoice) notFound();
  // previously any signed-in vendor could read another
  // tenant's invoice screening detail by URL guess. Same defect class
  // as BIL1 (bill detail) + DSC1 (dispute detail). Sibling
  // route `/vendor/invoices/[id]` already enforces this gate.
  if (invoice.vendorId !== session.vendor.id) notFound();

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <VendorNav vendorName={session.vendor.displayName} />
      <section className="mx-auto w-full max-w-[900px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Screening detail
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              3-of-3 screening result
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              These are simulated review placeholders only. They cannot approve
              settlement or be recorded as verified evidence. Live mode must
              obtain real provider decisions before using a{" "}
              <code className="font-mono">screeningHash</code>.
            </p>
            <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
              Invoice <code className="font-mono">{id}</code> · status{" "}
              {invoice.status}
            </p>
          </div>
          <Badge tone="sim">Simulated · provider access pending</Badge>
        </div>

        <ul className="space-y-3">
          {SAMPLE_SCREENS.map((s) => (
            <li
              key={s.provider}
              className="rounded-lg border border-[var(--color-line)] bg-white p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium">{s.provider}</span>
                <span
                  className={`inline-flex rounded-pill px-3 py-1 text-xs font-medium ${RESULT_STYLE[s.result]}`}
                >
                  {s.result}
                </span>
              </div>
              <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                {s.detail}
              </p>
              <p className="mt-3 font-mono text-[11px] text-[var(--color-ink-subtle)]">
                evidence {s.evidenceHash.slice(0, 10)}…
                {s.evidenceHash.slice(-8)} · ran {s.ranAt.toLocaleTimeString()}
              </p>
            </li>
          ))}
        </ul>

        <Link
          href={{ pathname: `/vendor/invoices/${id}` }}
          className="mt-6 inline-flex rounded-pill border border-[var(--color-line)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-elevated)]"
        >
          ← Back to invoice
        </Link>
      </section>
    </main>
  );
}
