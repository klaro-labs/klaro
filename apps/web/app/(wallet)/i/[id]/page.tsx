import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/klaro/Logo";
import { BrandMark } from "@/components/klaro/BrandMark";
import { Badge } from "@/components/ui/Badge";
import { PayWithUSDC } from "@/components/klaro/PayWithUSDC";
// Public invoice fetch via SECURITY DEFINER RPC (migration 0022) — anon
// callers resolve an invoice by id without exposing the invoices table.
// Single-row lookup, no enumeration. Returns vendor display name + wallet
// in the same payload so we don't need a second join + RLS check.
import { getPublicInvoice } from "@/lib/repo/invoices";
import { isLiveOnChain } from "@/lib/arcClient";
import { formatUSDC, shortAddress } from "@/lib/money";
import type { Hex } from "@/lib/types";

/**
 * Hosted invoice page — `i.klaro.so/<id>` equivalent.
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
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
          Invoice {isExpired ? "expired" : invoice.status.toLowerCase()}
        </p>
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
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
          Invoice not yet ready
        </p>
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
    <>
      {/* ─── MOBILE (<md) — hosted invoice (default) + paid (done) states ─── */}
      <main className="flex min-h-screen flex-col bg-[var(--color-bg)] md:hidden">
        {!isPaid ? (
          <>
            <header className="flex items-center justify-between px-5 pt-5">
              <Logo size={20} />
              <span className="font-mono text-[11px] text-[var(--color-ink-subtle)]">
                i.klaro.so/{shortAddress(invoice.id)}
              </span>
            </header>

            <section className="flex-1 px-5 pt-6 pb-32">
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-full bg-[var(--color-klaro-orange-deep)] font-display text-lg font-semibold text-white">
                  {vendorInitials}
                </span>
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
                <p className="mt-1 font-display text-5xl font-semibold tracking-tight">
                  {formatUSDC(invoice.amount)}
                </p>
                <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                  {(Number(invoice.amount) / 1_000_000).toLocaleString()} USDC ·
                  {isLiveOnChain() ? " settles on Arc" : " simulated checkout"}
                </p>
              </article>

              {invoice.lineItems.length > 0 && (
                <article className="mt-3 rounded-2xl border border-[var(--color-line)] bg-white px-5 py-3">
                  {invoice.lineItems.slice(0, 1).map((l, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <p className="text-sm">{l.description}</p>
                      <p className="font-mono text-sm font-medium">
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

              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
                {isLiveOnChain()
                  ? "Onchain receipt mints when you pay. Verifiable forever."
                  : "Simulator receipt preview appears after payment. No onchain receipt is minted."}
              </p>
            </section>

            <div className="sticky bottom-0 border-t border-[var(--color-line)] bg-white p-4">
              {/* Reuses the same PayWithUSDC client component as desktop. */}
              <PayWithUSDC
                invoiceId={invoice.id}
                vendor={vendorWallet}
                token={invoice.token}
                amount={invoice.amount}
                dueAt={invoice.dueAt}
                metadataHash={invoice.metadataHash}
              />
            </div>
          </>
        ) : (
          <>
            <header className="flex items-center px-5 pt-5">
              <Link
                href="/"
                className="text-sm font-medium text-[var(--color-brand)]"
              >
                ‹ Done
              </Link>
            </header>
            <section className="px-5 pb-10 pt-12 text-center">
              <span
                aria-hidden
                className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700"
              >
                ✓
              </span>
              <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">
                You paid {vendorFirstName}
              </h1>
              <p className="mt-2 font-display text-4xl font-semibold tracking-tight">
                {formatUSDC(invoice.amount)}
              </p>
              <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                {isLiveOnChain()
                  ? "Receipt anchored on Arc testnet"
                  : "Simulated payment · receipt preview"}
              </p>
            </section>
            <section className="px-5">
              <dl className="divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-white px-5">
                <DefRow
                  k="From you"
                  v={shortAddress(
                    invoice.acceptedBy ??
                      "0x0000000000000000000000000000000000000000",
                  )}
                />
                <DefRow
                  k={`To ${vendorFirstName}`}
                  v={shortAddress(vendorWallet)}
                />
                <DefRow k="Reference" v={shortRef} />
                <DefRow
                  k="Receipt"
                  v={shortAddress(invoice.receiptHash ?? invoice.id)}
                  accent
                />
              </dl>
            </section>
            <section className="mt-6 px-5 pb-10">
              <Link
                href={
                  `/receipt/${invoice.receiptHash ?? invoice.id}` as `/receipt/${string}`
                }
                className="flex h-12 w-full items-center justify-center rounded-pill bg-[var(--color-ink)] text-sm font-medium text-white hover:bg-black"
              >
                View receipt
              </Link>
              <a
                href={`mailto:?subject=Klaro%20receipt&body=${encodeURIComponent(`https://klaro.so/receipt/${invoice.receiptHash ?? invoice.id}`)}`}
                className="mt-3 flex h-12 w-full items-center justify-center rounded-pill border border-[var(--color-line)] bg-white text-sm font-medium hover:bg-[var(--color-bg-elevated)]"
              >
                Email me a copy
              </a>
            </section>
          </>
        )}
      </main>

      {/* ─── DESKTOP (≥md) — existing layout ─── */}
      <main className="hidden min-h-screen bg-[var(--color-bg)] md:block">
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
                className={`inline-block size-1.5 rounded-full ${isLiveOnChain() ? "bg-emerald-500" : "bg-amber-500"}`}
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
                Hosted invoice · i.klaro.so / {shortAddress(invoice.id)}
              </span>
              {isPaid ? (
                <Badge tone={isLiveOnChain() ? "live" : "sim"}>
                  {isLiveOnChain() ? "Paid on Arc" : "Simulated payment"}
                </Badge>
              ) : (
                <Badge tone="neutral">Awaiting payment</Badge>
              )}
            </div>

            <div className="mt-7">
              <p className="text-xs text-[var(--color-ink-subtle)]">
                Amount due
              </p>
              <p className="mt-1 font-display text-5xl font-semibold tracking-tight">
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
              <dt className="text-[var(--color-ink-subtle)]">For</dt>
              <dd>{invoice.lineItems[0]?.description ?? "—"}</dd>
              <dt className="text-[var(--color-ink-subtle)]">Due</dt>
              <dd>{invoice.dueAt.toLocaleDateString()}</dd>
            </dl>

            <div className="mt-8 border-t border-[var(--color-line)] pt-6">
              {isPaid ? (
                <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
                  ✓ This invoice is already paid.{" "}
                  <Link
                    href={`/receipt/${invoice.id}` as `/receipt/${string}`}
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
            </div>

            <p className="mt-6 text-xs text-[var(--color-ink-subtle)]">
              {isLiveOnChain()
                ? "By paying you sign an EIP-712 acceptance message recorded with the Stenn-Proof receipt. Klaro never custodies your funds; USDC sits in escrow on Arc until release."
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
      </main>
    </>
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
