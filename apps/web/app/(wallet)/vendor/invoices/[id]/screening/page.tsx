import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { getCurrentSession } from "@/lib/auth";
// dual-mode via repo.
import { getInvoice } from "@/lib/repo/invoices";
import { getInvoiceScreening } from "@/lib/repo/screening";
import type { Hex } from "@/lib/types";

/**
 * Invoice screening detail. v2 §14.
 * Klaro screens every payment before releasing escrowed funds:
 * 1. **Sanctions / OFAC** — buyer wallet vs the live OFAC SDN crypto list
 * 2. **Behavioral** — testnet heuristic (full scoring is a mainnet concern)
 * 3. **KYB liveness** — the vendor's Sumsub business verification
 * Only the screening *hash* is anchored on-chain at settlement — no PII.
 * Renders the real `screening_results` rows the daemon's screen-and-settle
 * worker writes (was hardcoded simulated placeholders before screening went
 * live, which kept claiming "provider access pending").
 */

const RESULT_TONE: Record<"pass" | "fail" | "review", "live" | "danger" | "info"> = {
  pass: "live",
  fail: "danger",
  review: "info",
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
  // Tenant gate — a vendor may only read their own invoice's screening.
  if (invoice.vendorId !== session.vendor.id) notFound();

  const legs = await getInvoiceScreening(invoice.id);

  return (
    <div>
      <section className="mx-auto w-full max-w-[900px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Screening detail</Eyebrow>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              3-of-3 screening result
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Klaro screens every payment before releasing escrowed funds:
              sanctions (OFAC SDN), a behavioral heuristic, and business
              verification (Sumsub KYB). Funds release only when all three pass.
              Only the screening <code className="font-mono">hash</code> — never
              the underlying detail — is anchored on-chain at settlement.
            </p>
            <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
              Invoice <code className="font-mono">{id}</code> · status{" "}
              {invoice.status}
            </p>
          </div>
        </div>

        {legs.length === 0 ? (
          <p className="rounded-lg border border-[var(--color-line)] bg-white p-5 text-sm text-[var(--color-ink-muted)]">
            No screening has run yet. Screening starts automatically when the
            buyer pays this invoice.
          </p>
        ) : (
          <ul className="space-y-3">
            {legs.map((s) => (
              <li
                key={s.provider}
                className="rounded-lg border border-[var(--color-line)] bg-white p-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">{s.label}</span>
                  <Badge tone={RESULT_TONE[s.result]} className="capitalize">
                    {s.result}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                  {s.detail}
                </p>
                <p className="mt-3 font-mono text-[11px] text-[var(--color-ink-subtle)]">
                  evidence {s.evidenceHash.slice(0, 10)}…
                  {s.evidenceHash.slice(-8)} · ran{" "}
                  {new Date(s.ranAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}

        <Link
          href={{ pathname: `/vendor/invoices/${id}` }}
          className="mt-6 inline-flex rounded-pill border border-[var(--color-line)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-elevated)]"
        >
          ← Back to invoice
        </Link>
      </section>
    </div>
  );
}
