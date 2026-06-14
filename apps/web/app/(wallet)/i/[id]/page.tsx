import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/klaro/Logo";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { CheckIcon } from "@/components/ui/CheckIcon";
import { PayWithUSDC } from "@/components/klaro/PayWithUSDC";
import { CrossChainPay } from "@/components/klaro/CrossChainPay";
// Public invoice fetch via SECURITY DEFINER RPC (migration 0022) — anon
// callers resolve an invoice by id without exposing the invoices table.
// Single-row lookup, no enumeration. Returns vendor display name + wallet
// in the same payload so we don't need a second join + RLS check.
import { getPublicInvoice } from "@/lib/repo/invoices";
import { isLiveOnChain } from "@/lib/arcClient";
import { cctpPayinEnabled } from "@/lib/env";
import { formatUSDC, shortAddress } from "@/lib/money";
import type { Hex } from "@/lib/types";
import type { CSSProperties } from "react";

/**
 * Hosted invoice page — `myklaro.app/i/<id>` equivalent.
 * Public, no-auth. The buyer arrives here from the vendor's share link,
 * sees the amount + line items, signs EIP-712 acceptance, and pays.
 * The actual sign+pay flow (wallet connection, EIP-712 signing, USDC
 * approval + transfer) lives in `<CheckoutPanel>` — kept client-side to
 * own wallet state. This page is server-rendered for fast first paint.
 * 8 customer recovery states land in M5 alongside the wallet
 * integration. For M3 we render the page + the two CTA paths so vendors
 * can preview what their customer sees.
 */
export default async function HostedInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await getPublicInvoice(id as Hex);
  if (!invoice) notFound();

  // previously only `PAID` / `SETTLED`
  // routed to the success view — `REFUNDED`, `CANCELLED`, and past-due invoices
  // fell through to the pay panel, so a buyer could waste gas (or in simulator
  // mode duplicate-pay) a closed invoice. Now render a clear blocked state for
  // every non-payable status.
  const isPaid = invoice.status === "PAID" || invoice.status === "SETTLED";
  // A receipt only exists once settlement mints it. In live mode a PAID invoice
  // sits in screening before SETTLED, so receiptHash is null and there is no
  // receipt to view yet — never claim "Receipt anchored" or link to one then.
  const hasReceipt = Boolean(invoice.receiptHash);
  const settling = isPaid && !hasReceipt;
  const blocked =
    invoice.status === "REFUNDED" || invoice.status === "CANCELLED";
  // comment at line 38 above said
  // "past-due invoices fell through to the pay panel" but the code only
  // blocked REFUNDED/CANCELLED. A buyer arriving past `dueAt` was still
  // shown the full pay panel — in live mode they'd sign the EIP-712
  // message and waste gas when the escrow reverted; in simulator mode
  // the payment went through. Now expiry is a real block.
  const isExpired = !isPaid && invoice.dueAt.getTime() < Date.now();
  if (blocked || isExpired) {
    const title = isExpired
      ? "This invoice has expired."
      : invoice.status === "REFUNDED"
        ? "This invoice was refunded."
        : "This invoice was cancelled.";
    const body = isExpired
      ? `The vendor set the due date as ${invoice.dueAt.toLocaleDateString()}. Ask them to reissue if you still want to pay it.`
      : invoice.status === "REFUNDED"
        ? "If your buyer initiated a refund, the original USDC was returned to your wallet. The vendor needs to issue a new invoice if they want this paid."
        : "The vendor voided this invoice before payment. Ask them to send a fresh link if this was a mistake.";
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center text-[var(--color-ink)]">
        <Eyebrow>
          Invoice {isExpired ? "expired" : invoice.status.toLowerCase()}
        </Eyebrow>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-3 max-w-md text-sm text-[var(--color-ink-muted)]">
          {body}
        </p>
        <p className="mt-6 font-mono text-xs text-[var(--color-ink-subtle)]">
          Invoice {shortAddress(invoice.id)}
        </p>
      </main>
    );
  }
  // live mode previously hardcoded vendorWallet to
  // 0x0000…0000 because the invoices table has no vendor_wallet
  // column. fromRow() now joins the vendors table; if the join
  // returns no wallet, the value is null. Buyer-facing payment surface
  // refuses to render so we don't sign the zero address into EIP-712
  // or display it as "To: 0x0000…0000". Vendor must finish wallet
  // provisioning before sharing the invoice link.
  const vendorWalletMaybe = invoice.vendorWallet;
  if (!vendorWalletMaybe) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center text-[var(--color-ink)]">
        <Eyebrow>Invoice not yet ready</Eyebrow>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          Vendor wallet not provisioned
        </h1>
        <p className="mt-3 max-w-md text-sm text-[var(--color-ink-muted)]">
          The vendor hasn&apos;t finished setting up their Klaro payment wallet
          yet. Wait a moment and reload, or ask the vendor to confirm their
          wallet is provisioned before sharing this link.
        </p>
        <p className="mt-6 font-mono text-xs text-[var(--color-ink-subtle)]">
          Invoice {shortAddress(invoice.id)}
        </p>
      </main>
    );
  }
  const vendorWallet: Hex = vendorWalletMaybe;

  // mobile variant rendered
  // Vendor display name comes from the same RPC payload as the invoice
  // (see lib/repo/invoices.ts getPublicInvoice). No second round trip, no
  // anon-vendor-read needed. Falls back to a shortened wallet address if
  // the vendor row was deleted.
  const vendorName =
    invoice.vendorDisplayName ?? `Vendor ${shortAddress(vendorWallet)}`;
  const vendorFirstName = vendorName.split(" ")[0] ?? "vendor";
  const vendorInitials = vendorName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const shortRef = `INV-${invoice.id.slice(2, 6).toUpperCase()}`;
  // Vendor Branding (settings → /vendor/settings) renders on the buyer-facing
  // invoice: the brand colour drives every --color-brand accent, the logo
  // replaces the initials avatar. Both validated on save (hex + https URL);
  // unset falls back to Klaro blue + initials.
  const brandColor = invoice.brandColor || null;
  const brandLogoUrl = invoice.brandLogoUrl || null;
  const brandStyle = brandColor
    ? ({ "--color-brand": brandColor } as CSSProperties)
    : undefined;
  const dueLabel = invoice.dueAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const daysUntilDue = Math.max(
    0,
    Math.ceil((+invoice.dueAt - Date.now()) / (1000 * 60 * 60 * 24)),
  );

  return (
    <main className="min-h-screen bg-[var(--color-bg)]" style={brandStyle}>
      {/* ─── MOBILE (<md) — hosted invoice (default) + paid (done) states ─── */}
      <div className="flex min-h-screen flex-col md:hidden">
        {!isPaid ? (
          <>
            <header className="flex items-center justify-between px-5 pt-5">
              <Logo size={20} />
              <span className="font-mono text-[11px] text-[var(--color-ink-subtle)]">
                myklaro.app/i/{shortAddress(invoice.id)}
              </span>
            </header>

            <section className="flex-1 px-5 pt-6 pb-32">
              <div className="flex items-center gap-3">
                {brandLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vendor-supplied remote logo on an arbitrary host; next/image needs allow-listed domains
                  <img
                    src={brandLogoUrl}
                    alt={vendorName}
                    className="size-12 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid size-12 place-items-center rounded-full bg-[var(--color-brand)] font-display text-lg font-semibold text-white">
                    {vendorInitials}
                  </span>
                )}
                <div>
                  <p className="text-xs text-[var(--color-ink-subtle)]">
                    Invoice from
                  </p>
                  <p className="font-medium">{vendorName}</p>
                </div>
              </div>

              <article className="mt-5 rounded-2xl border border-[var(--color-line)] bg-white p-5">
                <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-ink-subtle)]">
                  Amount due
                </p>
                <p className="mt-1 font-display text-[clamp(2rem,9vw,3rem)] font-semibold tracking-tight tabular-nums break-words">
                  {formatUSDC(invoice.amount)}
                </p>
                <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                  {(Number(invoice.amount) / 1_000_000).toLocaleString()} USDC ·{" "}
                  {isLiveOnChain() ? "settles on Arc" : "simulated checkout"}
                </p>
              </article>

              {invoice.lineItems.length > 0 && (
                <article className="mt-3 divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-white px-5">
                  {invoice.lineItems.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <p className="text-sm">{l.description}</p>
                      <p className="shrink-0 font-mono text-sm font-medium tabular-nums">
                        {formatUSDC(l.amount)}
                      </p>
                    </div>
                  ))}
                </article>
              )}

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[var(--color-line)] bg-white p-4">
                  <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-ink-subtle)]">
                    Due
                  </p>
                  <p className="mt-1 text-sm font-medium">{dueLabel}</p>
                  <p className="text-xs text-[var(--color-ink-subtle)]">
                    {daysUntilDue} day{daysUntilDue === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--color-line)] bg-white p-4">
                  <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-ink-subtle)]">
                    Reference
                  </p>
                  <p className="mt-1 text-sm font-medium">{shortRef}</p>
                  <p className="text-xs text-[var(--color-ink-subtle)]">
                    from {vendorFirstName}
                  </p>
                </div>
              </div>

              <p className="mt-4 rounded-xl border border-[color-mix(in_oklab,var(--color-success)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-success)_8%,white)] px-4 py-2.5 text-xs text-[color-mix(in_oklab,var(--color-success)_70%,var(--color-ink))]">
                {isLiveOnChain()
                  ? "Onchain receipt mints when you pay. Verifiable forever."
                  : "Simulator receipt preview appears after payment. No onchain receipt is minted."}
              </p>
            </section>

            <div className="sticky bottom-0 border-t border-[var(--color-line)] bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {/* Reuses the same PayWithUSDC client component as desktop. */}
              <PayWithUSDC
                invoiceId={invoice.id}
                vendor={vendorWallet}
                token={invoice.token}
                amount={invoice.amount}
                dueAt={invoice.dueAt}
                metadataHash={invoice.metadataHash}
              />
              {isLiveOnChain() && cctpPayinEnabled() && (
                <div className="mt-3">
                  <CrossChainPay invoiceId={invoice.id} amount={invoice.amount} vendorWallet={vendorWallet} />
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <header className="flex items-center px-5 pt-5">
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-brand)]"
              >
                <ChevronLeft className="size-4" aria-hidden /> Done
              </Link>
            </header>
            <section className="px-5 pb-10 pt-12 text-center">
              <span
                aria-hidden
                className="mx-auto grid size-20 place-items-center rounded-full bg-[color-mix(in_oklab,var(--color-success)_15%,white)] text-[var(--color-success)]"
              >
                <CheckIcon className="size-9" />
              </span>
              <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">
                You paid {vendorFirstName}
              </h1>
              <p className="mt-2 font-display text-4xl font-semibold tracking-tight">
                {formatUSDC(invoice.amount)}
              </p>
              <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                {!isLiveOnChain()
                  ? "Simulated payment · receipt preview"
                  : settling
                    ? "Payment received on Arc · screening before settlement"
                    : "Receipt anchored on Arc testnet"}
              </p>
            </section>
            <section className="px-5">
              <dl className="divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-white px-5">
                <DefRow
                  k="From you"
                  v={invoice.acceptedBy ? shortAddress(invoice.acceptedBy) : "—"}
                />
                <DefRow
                  k={`To ${vendorFirstName}`}
                  v={shortAddress(vendorWallet)}
                />
                <DefRow k="Reference" v={shortRef} />
                <DefRow
                  k="Receipt"
                  v={hasReceipt ? shortAddress(invoice.receiptHash!) : "Pending settlement"}
                  accent
                />
              </dl>
            </section>
            <section className="mt-6 px-5 pb-10">
              {settling ? (
                <p className="rounded-xl border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-4 py-3 text-center text-sm text-[var(--color-ink-muted)]">
                  Your USDC is locked in escrow. Klaro screens the payment, then
                  releases it to {vendorFirstName} and anchors your receipt —
                  you can return to this link to view it.
                </p>
              ) : (
                <>
                  <Link
                    href={`/receipt/${invoice.receiptHash}` as `/receipt/${string}`}
                    className="flex h-12 w-full items-center justify-center rounded-pill bg-[var(--color-ink)] text-sm font-medium text-white hover:bg-black"
                  >
                    View receipt
                  </Link>
                  <a
                    href={`mailto:?subject=Klaro%20receipt&body=${encodeURIComponent(`https://www.myklaro.app/receipt/${invoice.receiptHash}`)}`}
                    className="mt-3 flex h-12 w-full items-center justify-center rounded-pill border border-[var(--color-line)] bg-white text-sm font-medium hover:bg-[var(--color-bg-elevated)]"
                  >
                    Email me a copy
                  </a>
                </>
              )}
            </section>
          </>
        )}
      </div>

      {/* ─── DESKTOP (≥md) — existing layout ─── */}
      <div className="hidden md:block">
        {/* Minimal header — no marketing nav on the checkout */}
        <header className="border-b border-[var(--color-line)] bg-[var(--color-bg-elevated)]">
          <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-6">
            <Logo size={20} />
            {/* Iter 39: was an unconditional "Live on Arc testnet" badge; shown
              to buyers paying through the simulator path it was overclaiming
              the system status. Honest swap. */}
            <Badge tone={isLiveOnChain() ? "live" : "sim"}>
              <span
                aria-hidden
                className={`inline-block size-1.5 rounded-full ${isLiveOnChain() ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]"}`}
              />
              {isLiveOnChain()
                ? "Live on Arc testnet"
                : "Simulated · contracts not deployed"}
            </Badge>
          </div>
        </header>

        <section className="mx-auto w-full max-w-3xl px-6 py-12">
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-8 shadow-[0_1px_4px_rgba(10,10,10,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              <span>
                Hosted invoice · myklaro.app/i/{shortAddress(invoice.id)}
              </span>
              {isPaid ? (
                <Badge tone={isLiveOnChain() ? "live" : "sim"}>
                  {isLiveOnChain() ? "Paid on Arc" : "Simulated payment"}
                </Badge>
              ) : (
                <Badge tone="neutral">Awaiting payment</Badge>
              )}
            </div>

            <div className="mt-6 flex items-center gap-3">
              {brandLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- vendor-supplied remote logo on an arbitrary host; next/image needs allow-listed domains
                <img
                  src={brandLogoUrl}
                  alt={vendorName}
                  className="size-10 rounded-full object-cover"
                />
              ) : (
                <span className="grid size-10 place-items-center rounded-full bg-[var(--color-brand)] font-display text-sm font-semibold text-white">
                  {vendorInitials}
                </span>
              )}
              <div>
                <p className="text-xs text-[var(--color-ink-subtle)]">
                  Invoice from
                </p>
                <p className="font-medium">{vendorName}</p>
              </div>
            </div>

            <div className="mt-7">
              <p className="text-xs text-[var(--color-ink-subtle)]">
                Amount due
              </p>
              <p className="mt-1 font-display text-[clamp(2rem,9vw,3rem)] font-semibold tracking-tight tabular-nums break-words">
                {formatUSDC(invoice.amount)}
              </p>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                {isLiveOnChain()
                  ? "USDC on Arc · ERC-20 interface (6 decimals)"
                  : "Simulated USDC checkout · no onchain transfer"}
              </p>
            </div>

            <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-[var(--color-ink-subtle)]">To</dt>
              <dd>{shortAddress(vendorWallet)}</dd>
              {invoice.lineItems.length > 1 ? (
                <>
                  <dt className="self-start text-[var(--color-ink-subtle)]">
                    For
                  </dt>
                  <dd>
                    <ul className="space-y-1.5">
                      {invoice.lineItems.map((l, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-4"
                        >
                          <span>{l.description}</span>
                          <span className="shrink-0 font-mono tabular-nums text-[var(--color-ink-muted)]">
                            {formatUSDC(l.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </>
              ) : (
                <>
                  <dt className="text-[var(--color-ink-subtle)]">For</dt>
                  <dd>{invoice.lineItems[0]?.description ?? "—"}</dd>
                </>
              )}
              <dt className="text-[var(--color-ink-subtle)]">Due</dt>
              <dd>{invoice.dueAt.toLocaleDateString()}</dd>
            </dl>

            <div className="mt-8 border-t border-[var(--color-line)] pt-6">
              {isPaid && settling ? (
                <p className="flex items-center gap-1.5 rounded-md bg-[color-mix(in_oklab,var(--color-success)_8%,white)] px-3 py-2 text-sm text-[color-mix(in_oklab,var(--color-success)_75%,var(--color-ink))] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-success)_30%,transparent)]">
                  <CheckIcon className="size-4 shrink-0" />
                  Payment received on Arc. Klaro is screening it before
                  releasing to the vendor — your receipt anchors once it clears.
                </p>
              ) : isPaid ? (
                <p className="flex items-center gap-1.5 rounded-md bg-[color-mix(in_oklab,var(--color-success)_8%,white)] px-3 py-2 text-sm text-[color-mix(in_oklab,var(--color-success)_75%,var(--color-ink))] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-success)_30%,transparent)]">
                  <CheckIcon className="size-4 shrink-0" />
                  This invoice is already paid.{" "}
                  <Link
                    href={`/receipt/${invoice.receiptHash}` as `/receipt/${string}`}
                    className="ml-1 underline"
                  >
                    View receipt →
                  </Link>
                </p>
              ) : (
                <PayWithUSDC
                  invoiceId={invoice.id}
                  vendor={vendorWallet}
                  token={invoice.token}
                  amount={invoice.amount}
                  dueAt={invoice.dueAt}
                  metadataHash={invoice.metadataHash}
                />
              )}
              {!isPaid && isLiveOnChain() && cctpPayinEnabled() && (
                <div className="mt-3">
                  <CrossChainPay invoiceId={invoice.id} amount={invoice.amount} vendorWallet={vendorWallet} />
                </div>
              )}
            </div>

            <p className="mt-6 text-xs text-[var(--color-ink-subtle)]">
              {isLiveOnChain()
                ? "By paying you sign an EIP-712 acceptance message recorded with the Klaro Proof receipt. Klaro never custodies your funds; USDC sits in escrow on Arc until release."
                : "This simulator creates a receipt preview only. It does not transfer, escrow, or settle real USDC."}
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-[var(--color-ink-subtle)]">
            Powered by{" "}
            <Link
              href="/"
              className="font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              Klaro
            </Link>{" "}
            · {isLiveOnChain() ? "Live on Arc testnet" : "Simulator"} · No real
            money moves
          </p>
        </section>
      </div>
    </main>
  );
}

function DefRow({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <dt className="text-[var(--color-ink-muted)]">{k}</dt>
      <dd
        className={`font-mono ${accent ? "text-[var(--color-brand)]" : "text-[var(--color-ink)]"}`}
      >
        {v}
      </dd>
    </div>
  );
}
