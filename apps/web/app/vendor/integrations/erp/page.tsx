import { redirect } from "next/navigation";
import { VendorNav } from "@/components/klaro/VendorNav";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";

/**
 * ERP sync integrations. v2 §16.
 * Every invoice + payment can mirror into the vendor's accounting stack
 * so reconciliation is automatic. Klaro pushes invoice + tx + receipt
 * metadata; the ERP keeps the legal books of record.
 * Live OAuth + push pipeline lands in M11. Until then this page surfaces
 * the connector list + each one's status so vendors can request priorities.
 */

interface Connector {
  name: string;
  status: "live" | "beta" | "planned";
  detail: string;
  docsUrl: string;
}

const CONNECTORS: Connector[] = [
  {
    name: "Xero",
    status: "planned",
    detail:
      "Push invoices + payments to Xero books. Two-way sync of customer + chart-of-accounts.",
    docsUrl: "https://developer.xero.com",
  },
  {
    name: "QuickBooks",
    status: "planned",
    detail:
      "QBO + Desktop variants. Invoice CRUD + payment receipts + class tagging.",
    docsUrl: "https://developer.intuit.com/quickbooks",
  },
  {
    name: "Zoho Books",
    status: "planned",
    detail:
      "Common for IN-region SMBs. Auto-create vendor records + auto-reconcile UPI cashouts.",
    docsUrl: "https://www.zoho.com/books/api",
  },
  {
    name: "Tally",
    status: "planned",
    detail:
      "On-prem Tally Prime via TallyConnector — file-import format, no live API.",
    docsUrl: "https://help.tallysolutions.com",
  },
  {
    name: "Stripe Invoicing",
    status: "planned",
    detail:
      "One-way push from Klaro → Stripe so existing Stripe-using vendors keep their dashboards.",
    docsUrl: "https://stripe.com/docs/invoicing",
  },
];

const STATUS_STYLE: Record<Connector["status"], string> = {
  live: "bg-emerald-100 text-emerald-800",
  beta: "bg-blue-100 text-blue-800",
  planned: "bg-stone-100 text-stone-700",
};

export default async function ErpIntegrationsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <VendorNav vendorName={session.vendor.displayName} />
      <section className="mx-auto w-full max-w-[900px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              v2 §16 · ERP integrations
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Sync invoices to your accounting stack
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Klaro is the source of payment truth. Your ERP is the source of
              legal books. Connectors push every invoice, settlement, and
              receipt back so reconciliation stays automatic.
            </p>
          </div>
          <Badge tone="sim">Access pending</Badge>
        </div>

        <ul className="space-y-3">
          {CONNECTORS.map((c) => (
            <li
              key={c.name}
              className="rounded-lg border border-[var(--color-line)] bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg font-semibold">
                      {c.name}
                    </span>
                    <span
                      className={`inline-flex rounded-pill px-3 py-1 text-xs font-medium ${STATUS_STYLE[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                    {c.detail}
                  </p>
                </div>
                <a
                  href={c.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-pill border border-[var(--color-line)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-bg)]"
                >
                  Provider docs
                </a>
              </div>
              <button
                type="button"
                disabled
                title="Connector access pending"
                className="mt-4 cursor-not-allowed rounded-pill bg-[var(--color-ink)] px-4 py-2 text-xs font-medium text-white opacity-50"
              >
                Connect (access pending)
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-lg border border-[var(--color-line)] bg-white p-5 text-sm text-[var(--color-ink-muted)]">
          <p className="font-medium text-[var(--color-ink)]">
            Need a connector that&apos;s not listed?
          </p>
          <p className="mt-2">
            Email{" "}
            <a href="mailto:integrations@klaro.so" className="underline">
              integrations@klaro.so
            </a>{" "}
            with the ERP name + how you currently reconcile crypto payments. We
            prioritize the top-10 by request volume.
          </p>
        </div>
      </section>
    </main>
  );
}
