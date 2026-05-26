import { notFound } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/klaro/Logo";
import { Badge } from "@/components/ui/Badge";
import { formatUSDC, shortAddress, relativeTime } from "@/lib/money";
// dual-mode via repo.
import { getInvoice } from "@/lib/repo/invoices";
import { getByHash as getReceiptByHash } from "@/lib/repo/receipts";
import { verifyReceipt, isLiveOnChain } from "@/lib/arcClient";
import type { Hex } from "@/lib/types";

/**
 * Public receipt page — `receipt.klaro.so/<hash>` equivalent.
 * previous version (a) used
 * `mockGetInvoice(hash)` even though hash ≠ invoice id, (b) rendered
 * hardcoded "Asha · Pune, IN" + "Settled in 1.4s · Arc · block #84,217,103"
 * + a fake tx hash + a fake "Base · Gateway → Arc" route — all of which lied
 * to anyone verifying. Now:
 * - Tries `receipts.getByHash(hash)` first (live mode).
 * - Falls back to `mockGetInvoice(hash)` for simulator runs where
 * `simulatePaymentAction` writes `receiptHash = invoiceId`.
 * - Renders only fields actually present in the data — no invented values.
 * - Honest badge: "Verified on Arc" only when `verifyReceipt` confirms it
 * on chain; otherwise "Simulated · contracts not deployed".
 */
export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  const hashHex = hash as Hex;

  const { source, exists } = await verifyReceipt(hashHex);
  const receiptRow = await getReceiptByHash(hashHex);
  // Simulator: `simulatePaymentAction` sets `inv.receiptHash = invoiceId`, so
  // looking the hash up as an invoice id works for the simulated path.
  const invoice = await getInvoice(hashHex);

  if (source === "live-arc" && !exists && !receiptRow) notFound();
  if (source === "simulated" && (!invoice || invoice.status !== "SETTLED"))
    notFound();

  const isLive = isLiveOnChain();
  const settledAt = receiptRow?.settledAt ?? invoice?.acceptedAt ?? null;
  const sourceChainId = receiptRow?.sourceChainId ?? null;
  const settlementTx = receiptRow?.settlementTx ?? null;
  const vendorWallet = invoice?.vendorWallet ?? receiptRow?.vendor ?? null;
  // the receipt page is intentionally
  // public — its header literally says "Anyone can verify this receipt".
  // Previous version rendered the buyer's name + email as data rows. The
  // buyer never consented to publishing their PII to the world; vendors
  // sharing a receipt link as proof-of-payment would leak their customer
  // every time. Klaro (no PII publicly accessible) — proof
  // of acceptance is sufficient ("Buyer acceptance: EIP-712 signed").
  const amount = invoice?.amount ?? null;
  const invoiceId = invoice?.id ?? receiptRow?.invoiceId ?? null;

  return (
    <>
      {/* ─── MOBILE (<md) — designer 05-01 ─── */}
      <main className="min-h-screen bg-[var(--color-ink)] px-5 pt-5 pb-10 text-white md:hidden">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium text-[var(--color-brand)]"
          >
            ‹ Done
          </Link>
        </div>

        <div className="mt-8 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-pill bg-amber-100 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-amber-800 ring-1 ring-amber-300">
            <span className="grid size-4 place-items-center rounded-full bg-[var(--color-gold)] text-[10px] text-white">
              ✓
            </span>
            Stenn-Proof · {isLive ? "Verified on Arc" : "Simulated"}
          </span>
        </div>

        {amount !== null && (
          <p className="mt-8 text-center font-display text-5xl font-semibold tracking-tight">
            {formatUSDC(amount)}
          </p>
        )}
        {settledAt && (
          <p className="mt-2 text-center text-sm text-white/65">
            {isLive ? "Settled" : "Simulated"} {relativeTime(settledAt)}
            {sourceChainId ? ` · chain ${sourceChainId}` : ""}
          </p>
        )}

        <dl className="mt-8 divide-y divide-[var(--color-line)] rounded-2xl bg-white px-5 text-[var(--color-ink)]">
          {invoiceId && (
            <RowMobile k="Invoice" v={shortAddress(invoiceId)} mono />
          )}
          {vendorWallet && (
            <RowMobile k="Vendor" v={shortAddress(vendorWallet)} mono />
          )}
          <RowMobile
            k={isLive ? "Buyer sig" : "Demo acceptance"}
            v={
              isLive
                ? invoice?.acceptedBy
                  ? "Signed"
                  : "—"
                : invoice?.acceptedBy
                  ? "Simulated"
                  : "—"
            }
            emerald={!!invoice?.acceptedBy}
          />
          <RowMobile
            k="Screening"
            v={receiptRow?.screeningHash ? "Anchored" : "—"}
            emerald={!!receiptRow?.screeningHash}
          />
          {settlementTx && (
            <RowMobile k="Tx" v={shortAddress(settlementTx)} mono />
          )}
        </dl>

        <p className="mt-8 text-center text-xs text-white/55">
          Receipt {shortAddress(hashHex)}
          <br />
          {isLive
            ? "Anyone with the hash can verify this."
            : "Anyone with the hash can inspect this demo preview."}
        </p>
      </main>

      {/* ─── DESKTOP (≥md) — verified panel ─── */}
      <main className="hidden min-h-screen bg-[var(--color-ink)] text-white md:block">
        <header className="border-b border-white/10">
          <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-6">
            <div className="text-white">
              <Logo size={20} />
            </div>
            <div className="flex items-center gap-2">
              {isLive && exists ? (
                <Badge tone="live">Verified on Arc</Badge>
              ) : (
                <Badge tone="sim">Simulated · contracts not deployed</Badge>
              )}
              <Badge tone="verified">✓ Stenn-Proof</Badge>
            </div>
          </div>
        </header>

        <section className="mx-auto w-full max-w-3xl px-6 py-12">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
            {isLive ? "Public on-chain receipt" : "Simulated receipt preview"}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
            Receipt {shortAddress(hashHex)}
          </h1>
          <p className="mt-2 text-sm text-white/65">
            {isLive
              ? "Anyone can verify the anchored receipt without trusting Klaro, the vendor, or the buyer. Off-chain fields below are vendor-supplied."
              : "This is a demo receipt created by the simulator. It is not anchored on Arc and does not prove a payment, screening decision, or wallet signature."}
          </p>

          <article className="mt-8 overflow-hidden rounded-lg border border-white/10 bg-white text-[var(--color-ink)] shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
            <div className="border-b border-[var(--color-line)] bg-[var(--color-bg)] px-6 py-4">
              <p className="font-mono text-xs text-[var(--color-ink-subtle)]">
                receipt.klaro.so/{shortAddress(hashHex)}
              </p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 px-6 py-6 text-sm">
              {invoiceId && (
                <Row k="Invoice ID" v={shortAddress(invoiceId)} mono />
              )}
              {amount !== null && (
                <Row k="Amount" v={`${formatUSDC(amount)} USDC`} />
              )}
              {vendorWallet && (
                <Row k="Vendor wallet" v={shortAddress(vendorWallet)} mono />
              )}
              <Row
                k={isLive ? "Buyer acceptance" : "Demo acceptance"}
                v={
                  isLive
                    ? invoice?.acceptedBy
                      ? "EIP-712 signed"
                      : "—"
                    : invoice?.acceptedBy
                      ? "Simulated only"
                      : "—"
                }
              />
              <Row
                k="Screening hash"
                v={
                  receiptRow?.screeningHash
                    ? shortAddress(receiptRow.screeningHash)
                    : "—"
                }
                mono={!!receiptRow?.screeningHash}
              />
              {settledAt && (
                <Row
                  k={isLive ? "Settled" : "Simulated"}
                  v={relativeTime(settledAt)}
                />
              )}
              {sourceChainId && (
                <Row k="Source chain" v={`Arc chain id ${sourceChainId}`} />
              )}
              {settlementTx && (
                <Row k="Settlement tx" v={shortAddress(settlementTx)} mono />
              )}
            </dl>
            <div className="flex items-center justify-between border-t border-[var(--color-line)] px-6 py-4 text-[11px] text-[var(--color-ink-subtle)]">
              <span>Issued · ERC-8183 anchor · Klaro testnet</span>
              {isLive && settlementTx ? (
                <a
                  href={`https://testnet.arcscan.app/tx/${settlementTx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[var(--color-brand)] hover:underline"
                >
                  Open on Arc explorer →
                </a>
              ) : null}
            </div>
          </article>

          <p className="mt-6 text-center text-xs text-white/50">
            <Link href="/" className="hover:text-white">
              Klaro
            </Link>{" "}
            · Receipts as marketing. Embed{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">
              &lt;KlaroReceiptBadge hash="…"/&gt;
            </code>{" "}
            on any site.
          </p>
        </section>
      </main>
    </>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-[var(--color-ink-subtle)]">{k}</dt>
      <dd className={mono ? "font-mono" : ""}>{v}</dd>
    </>
  );
}

function RowMobile({
  k,
  v,
  mono,
  emerald,
}: {
  k: string;
  v: string;
  mono?: boolean;
  emerald?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <dt className="text-[var(--color-ink-muted)]">{k}</dt>
      <dd
        className={`${mono ? "font-mono" : ""} ${emerald ? "text-emerald-600" : "text-[var(--color-ink)]"}`}
      >
        {v}
      </dd>
    </div>
  );
}
