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
import { getInvoiceScreening, summarizeScreening } from "@/lib/repo/screening";
import { reconcileInvoicePublished } from "@/lib/arcClient";
import { PUBLIC_ORIGIN, onchainLive } from "@/lib/env";
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

// Tone styling for the screening banner — literal class strings so Tailwind JIT
// generates them. danger = blocked/failed leg, warn = manual review pending,
// info = received/passing (transient, pre-settle).
const SCREEN_BANNER_TONE = {
  danger: { box: "border-rose-200 bg-rose-50 text-rose-900", dot: "bg-rose-500", icon: "!" },
  warn: { box: "border-amber-200 bg-amber-50 text-amber-900", dot: "bg-amber-500", icon: "!" },
  info: { box: "border-blue-200 bg-blue-50 text-blue-900", dot: "bg-blue-500", icon: "✓" },
} as const;

const RESULT_BADGE_TONE = { pass: "live", fail: "danger", review: "info" } as const;

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
  // https://www.myklaro.app so shared links remain pasteable; ops sets the
  // var explicitly on preview branches to avoid prod-link confusion.
  const shareUrl = `${PUBLIC_ORIGIN}${hostedUrl}`;
  // Real 3-of-3 screening (OFAC sanctions, behavioral, Sumsub KYB). Drives an
  // honest, accurate banner — replaces the old hardcoded "buyer wallet flagged
  // in our daily sanctions refresh" line that fired on every PAID invoice
  // regardless of the actual result.
  const screening = await getInvoiceScreening(invoice.id);
  const screenSummary = summarizeScreening(screening, invoice.status);
  const isHeld = Boolean(screenSummary && screenSummary.tone !== "info");
  const shortId = `INV-${invoice.id.slice(2, 6).toUpperCase()}`;
  // QA-020: in live mode an invoice must be published to InvoiceEscrow
  // (vendor-signed) before a buyer can pay it.
  const showPublish =
    onchainLive() && invoice.status === "CREATED";

  // Resilience: the publish flow records `published_tx_hash` from the client
  // right after `createInvoice` lands. If that record step ever fails (network
  // blip, tab close) the invoice is on-chain but the DB shows it unpublished —
  // and re-signing would revert. Reconcile against on-chain truth so the vendor
  // sees "Published on-chain" instead of a reverting button.
  let publishedTx: Hex | null = invoice.publishedTx ?? null;
  let publishedOnChain = Boolean(publishedTx);
  if (showPublish && !publishedTx) {
    const rec = await reconcileInvoicePublished(invoice.id);
    if (rec.publishedOnChain) {
      publishedOnChain = true;
      publishedTx = rec.txHash ?? null;
    }
  }
  const isPublishedOnChain = showPublish && publishedOnChain;

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

      {screenSummary && (
        <article
          className={`mt-6 rounded-xl border p-4 ${SCREEN_BANNER_TONE[screenSummary.tone].box}`}
        >
          <p className="flex items-start gap-3 text-sm">
            <span
              aria-hidden
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${SCREEN_BANNER_TONE[screenSummary.tone].dot}`}
            >
              {SCREEN_BANNER_TONE[screenSummary.tone].icon}
            </span>
            <span>
              <span className="font-medium">{screenSummary.title}</span>
              <span className="mt-1 block opacity-80">
                {screenSummary.message}
              </span>
              {screenSummary.actionHref && (
                <Link
                  href={screenSummary.actionHref as `/${string}`}
                  className="mt-2 inline-block font-medium underline underline-offset-2"
                >
                  {screenSummary.actionLabel} →
                </Link>
              )}
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
            {isPublishedOnChain ? (
              <div className="text-sm">
                <p className="font-medium text-emerald-700">
                  Published on-chain
                </p>
                {publishedTx ? (
                  <p className="mt-1 font-mono text-xs break-all text-[var(--color-ink-muted)]">
                    {publishedTx}
                  </p>
                ) : null}
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
                label={
                  invoice.status === "SETTLED"
                    ? "Released to your balance"
                    : (screenSummary?.title ?? "Awaiting settlement")
                }
                time={
                  invoice.status === "SETTLED"
                    ? "settled"
                    : isHeld
                      ? "now"
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
              {onchainLive()
                ? "Share this URL with your customer. They connect a wallet and pay in USDC on Arc; a card on-ramp is offered too. Their receipt anchors once settlement clears screening."
                : "Share this URL to run the simulated buyer checkout. No real wallet payment occurs in simulator mode."}
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
            {screening.length > 0 ? (
              <ul className="space-y-1.5">
                {screening.map((s) => (
                  <li
                    key={s.provider}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-[var(--color-ink-muted)]">
                      {s.label}
                    </span>
                    <Badge
                      tone={RESULT_BADGE_TONE[s.result]}
                      className="capitalize"
                    >
                      {s.result}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--color-ink-muted)]">
                Screening runs when the buyer pays — sanctions (OFAC SDN),
                behavioral, and business verification (KYB). Only the screening{" "}
                <code className="font-mono">hash</code> is anchored on-chain at
                settlement.
              </p>
            )}
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
            <Section title="Klaro Proof receipt">
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
            <p className="text-sm">
              {invoice.dueAt.toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
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
