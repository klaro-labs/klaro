import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
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
  /** provider key in erp_connections (set for live connectors). */
  slug?: string;
  /** OAuth start route (set for live connectors). */
  connectHref?: string;
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
    status: "live",
    detail:
      "QuickBooks Online — invoices + payment receipts pushed to your books on every settle. Connect via Intuit OAuth (sandbox).",
    docsUrl: "https://developer.intuit.com/quickbooks",
    slug: "quickbooks",
    connectHref: "/api/integrations/quickbooks/connect",
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

const STATUS_TONE: Record<Connector["status"], "live" | "info" | "neutral"> = {
  live: "live",
  beta: "info",
  planned: "neutral",
};

/** Provider slugs the current vendor has actively connected (RLS-scoped). */
async function loadConnectedProviders(): Promise<Set<string>> {
  const { tryDb } = await import("@/lib/db");
  const c = await tryDb();
  if (!c) return new Set();
  const db = c as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string,
        ) => Promise<{ data: { provider: string }[] | null }>;
      };
    };
  };
  const { data } = await db
    .from("erp_connections")
    .select("provider")
    .eq("status", "active");
  return new Set((data ?? []).map((r) => r.provider));
}

export default async function ErpIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const sp = await searchParams;
  const connected = await loadConnectedProviders();
  const banner = sp.connected
    ? {
        ok: true,
        text: `${sp.connected} connected — new invoices will sync to your books on every settle.`,
      }
    : sp.erp_error
      ? { ok: false, text: `Connection failed (${sp.erp_error}). Please try again.` }
      : null;

  return (
    <div>
      <section className="mx-auto w-full max-w-[900px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>ERP integrations</Eyebrow>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Sync invoices to your accounting stack
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Klaro is the source of payment truth. Your ERP is the source of
              legal books. Connectors push every invoice, settlement, and
              receipt back so reconciliation stays automatic.
            </p>
          </div>
          <Badge tone="sim">In development</Badge>
        </div>

        {banner && (
          <div
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              banner.ok
                ? "border-[color-mix(in_oklab,var(--color-success)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-success)_8%,white)] text-[color-mix(in_oklab,var(--color-success)_70%,var(--color-ink))]"
                : "border-[color-mix(in_oklab,var(--color-danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_8%,white)] text-[var(--color-danger)]"
            }`}
          >
            {banner.text}
          </div>
        )}

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
                    <Badge tone={STATUS_TONE[c.status]} className="capitalize">
                      {c.status}
                    </Badge>
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
              {c.connectHref ? (
                connected.has(c.slug ?? "") ? (
                  <div className="mt-4 flex items-center gap-3">
                    <Badge tone="live">Connected</Badge>
                    <a
                      href={c.connectHref}
                      className="text-xs font-medium text-[var(--color-ink-muted)] underline hover:text-[var(--color-ink)]"
                    >
                      Reconnect
                    </a>
                  </div>
                ) : (
                  <a
                    href={c.connectHref}
                    className="mt-4 inline-flex rounded-pill bg-[var(--color-ink)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--color-ink-2)]"
                  >
                    Connect {c.name} →
                  </a>
                )
              ) : (
                <button
                  type="button"
                  disabled
                  title="Connector in development"
                  className="mt-4 cursor-not-allowed rounded-pill bg-[var(--color-ink)] px-4 py-2 text-xs font-medium text-white opacity-50"
                >
                  Connect (coming soon)
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-lg border border-[var(--color-line)] bg-white p-5 text-sm text-[var(--color-ink-muted)]">
          <p className="font-medium text-[var(--color-ink)]">
            Need a connector that&apos;s not listed?
          </p>
          <p className="mt-2">
            Email{" "}
            <a href="mailto:prateek@myklaro.app" className="underline">
              prateek@myklaro.app
            </a>{" "}
            with the ERP name + how you currently reconcile crypto payments. We
            prioritize the top-10 by request volume.
          </p>
        </div>
      </section>
    </div>
  );
}
