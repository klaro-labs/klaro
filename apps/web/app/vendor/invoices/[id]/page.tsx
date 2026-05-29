import Link from "next/link";
import { notFound } from "next/navigation";
import { ShareInvoiceLink } from "@/components/klaro/ShareInvoiceLink";
import { PublishInvoiceOnChain } from "@/components/klaro/PublishInvoiceOnChain";
import { Badge } from "@/components/ui/Badge";
import { formatUSDC, shortAddress, relativeTime } from "@/lib/money";
import { getCurrentSession } from "@/lib/auth";
// dual-mode via repo so live Supabase
// reads work; previously mock-only.
import { getInvoice } from "@/lib/repo/invoices";
import { PUBLIC_ORIGIN, INVOICE_ESCROW_ADDRESS } from "@/lib/env";
import type { Hex, InvoiceStatus } from "@/lib/types";

/**
 * Vendor invoice detail. Shows full state + shareable hosted-page URL +
 * customer info + line items + receipt link (if SETTLED).
 */

const STATUS_TONE: Record<
  InvoiceStatus,
  "live" | "info" | "neutral" | "sim" | "verified"
> = {
  CREATED: "neutral",
  ACCEPTED: "info",
  PAID: "info",
  SETTLED: "live",
  REFUNDED: "sim",
  CANCELLED: "sim",
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  CREATED: "Awaiting buyer",
  ACCEPTED: "Signed · awaiting payment",
  PAID: "Paid · settling",
  SETTLED: "Settled",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) notFound();
  const { vendor } = session;

  const { id } = await params;
  const invoice = await getInvoice(id as Hex);
  if (!invoice || invoice.vendorId !== vendor.id) notFound();

  const hostedUrl = `/i/${invoice.id}`;
  // PUBLIC_ORIGIN now imported from env.ts (was reading
  // process.env directly, bypassing audit boundary). Preview deploys
  // without NEXT_PUBLIC_PUBLIC_ORIGIN set still fall back to
  // https://klaro.so so shared links remain pasteable; ops sets the
  // var explicitly on preview branches to avoid prod-link confusion.
  const shareUrl = `${PUBLIC_ORIGIN}${hostedUrl}`;
  const isHeld = invoice.status === "ACCEPTED" || invoice.status === "PAID"; // held / re-screening
  const shortId = `INV-${invoice.id.slice(2, 6).toUpperCase()}`;
  // QA-020: in live mode an invoice must be published to InvoiceEscrow
  // (vendor-signed) before a buyer can pay it.
  const showPublish =
    Boolean(INVOICE_ESCROW_ADDRESS) && invoice.status === "CREATED";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-12">
      <Link
        href="/vendor/invoices"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        ← All invoices
      </Link>

      <header className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-[var(--color-ink-subtle)]">
            {shortId} · {shortAddress(invoice.id)}
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
            {formatUSDC(invoice.amount)}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            To {invoice.customer.name ?? invoice.customer.email} · Created{" "}
            {relativeTime(invoice.createdAt)}
          </p>
        </div>
        <Badge tone={STATUS_TONE[invoice.status]}>
          {STATUS_LABEL[invoice.status]}
        </Badge>
      </header>

      {isHeld && (
        <article className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="flex items-start gap-3 text-sm">
            <span
              aria-hidden
              className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-rose-500 text-xs font-bold text-white"
            >
              !
            </span>
            <span>
              <span className="font-medium text-rose-900">Held for review</span>
              <span className="mt-1 block text-rose-800/80">
                Buyer wallet flagged in our daily sanctions refresh. We respond
                within 24h.
              </span>
            </span>
          </p>
        </article>
      )}

      {showPublish ? (
        <article className="mt-6">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            On-chain status
          </h2>
          <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-4">
            {invoice.publishedTx ? (
              <div className="text-sm">
                <p className="font-medium text-emerald-700">
                  Published on-chain
                </p>
                <p className="mt-1 font-mono text-xs break-all text-[var(--color-ink-muted)]">
                  {invoice.publishedTx}
                </p>
                <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
                  The buyer can now pay this invoice.
                </p>
              </div>
            ) : invoice.vendorWallet ? (
              <PublishInvoiceOnChain
                invoiceId={invoice.id}
                vendorWallet={invoice.vendorWallet}
                token={invoice.token}
                amount={invoice.amount.toString()}
                dueAtUnix={Math.floor(invoice.dueAt.getTime() / 1000)}
                metadataHash={invoice.metadataHash}
              />
            ) : (
              <p className="text-sm text-rose-700">
                This invoice has no payout wallet provisioned, so it can&rsquo;t
                be published. Provision your wallet in settings first.
              </p>
            )}
          </div>
        </article>
      ) : null}

      <div className="mt-8 grid gap-8 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-7">
          <Section title="Timeline">
            <ol className="-mx-1">
              <TimelineRow
                done
                label="Invoice created"
                time={relativeTime(invoice.createdAt)}
              />
              <TimelineRow
                done={invoice.status !== "CREATED"}
                label="Buyer signed it"
                time={
                  invoice.acceptedAt
                    ? relativeTime(invoice.acceptedAt)
                    : "—"
                }
              />
              <TimelineRow
                held={isHeld}
                done={invoice.status === "SETTLED"}
                label={isHeld ? "Held for review" : "Released to your balance"}
                time={
                  isHeld
                    ? "now"
                    : invoice.status === "SETTLED"
                      ? "settled"
                      : "—"
                }
              />
            </ol>
          </Section>

          <Section title="Line items">
            <table className="w-full text-sm">
              <tbody>
                {invoice.lineItems.length === 0 ? (
                  <tr>
                    <td className="py-2 text-[var(--color-ink-subtle)]">
                      No line items recorded for this invoice.
                    </td>
                  </tr>
                ) : (
                  invoice.lineItems.map((l, i) => (
                    <tr
                      key={i}
                      className="border-b border-[var(--color-line)] last:border-b-0"
                    >
                      <td className="py-2 text-[var(--color-ink)]">
                        {l.description}
                      </td>
                      <td className="py-2 text-right text-[var(--color-ink-muted)]">
                        {formatUSDC(l.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Section>

          <Section title="Hosted invoice link">
            <p className="font-mono text-sm break-all text-[var(--color-brand)]">
              {hostedUrl}
            </p>
            <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
              Share this URL to run the demo buyer checkout. Live wallet,
              cross-chain and card payments are not enabled here.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Link
                href={hostedUrl as `/i/${string}`}
                className="text-sm font-medium text-[var(--color-brand)] hover:underline"
              >
                Open hosted invoice →
              </Link>
              <ShareInvoiceLink url={shareUrl} />
            </div>
          </Section>

          <Section title="Screening">
            <p className="text-xs text-[var(--color-ink-muted)]">
              Simulated screening review only. No provider approval or on-chain{" "}
              <code className="font-mono">screeningHash</code> is asserted in
              demo mode.
            </p>
            <Link
              href={{
                pathname: `/vendor/invoices/${invoice.id}/screening`,
              }}
              className="mt-3 inline-block text-sm font-medium text-[var(--color-brand)] hover:underline"
            >
              View screening detail →
            </Link>
          </Section>

          {invoice.status === "SETTLED" && invoice.receiptHash ? (
            <Section title="Stenn-Proof receipt">
              <p className="font-mono text-xs text-[var(--color-ink-muted)]">
                {invoice.receiptHash}
              </p>
              <Link
                href={
                  `/receipt/${invoice.receiptHash}` as `/receipt/${string}`
                }
                className="mt-3 inline-block text-sm font-medium text-[var(--color-brand)] hover:underline"
              >
                View public receipt →
              </Link>
            </Section>
          ) : null}
        </div>

        <aside className="space-y-7">
          <Section title="Customer">
            <p className="font-medium">{invoice.customer.name ?? "—"}</p>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {invoice.customer.email}
            </p>
          </Section>
          <Section title="Token">
            <p className="font-mono text-sm">{shortAddress(invoice.token)}</p>
            <p className="text-xs text-[var(--color-ink-subtle)]">
              USDC ERC-20 on Arc (6 dec)
            </p>
          </Section>
          <Section title="Due">
            <p className="text-sm">{invoice.dueAt.toLocaleDateString()}</p>
          </Section>
          {isHeld ? (
            <Link
              href="/vendor/disputes"
              className="inline-flex w-full items-center justify-center rounded-pill bg-[var(--color-ink)] px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
            >
              Open support case
            </Link>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function TimelineRow({
  done,
  held,
  label,
  time,
}: {
  done: boolean;
  held?: boolean;
  label: string;
  time: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`inline-block size-2.5 rounded-full ${
            held
              ? "bg-rose-500"
              : done
                ? "bg-emerald-500"
                : "border-2 border-[var(--color-line)]"
          }`}
        />
        <span
          className={`text-sm ${done || held ? "font-medium" : "text-[var(--color-ink-muted)]"}`}
        >
          {label}
        </span>
      </div>
      <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
        {time}
      </span>
    </li>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        {title}
      </h2>
      <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-4">
        {children}
      </div>
    </div>
  );
}
