import { SectionHeader } from "../SectionHeader";
import { Badge } from "@/components/ui/Badge";

/**
 * §7 Stenn-Proof — the moat surface. Three blocks stacked:
 * (a) Public on-chain receipt sample (dark card, exhaustive row list).
 * (b) Four trust pillars in a grid.
 * (c) "Traditional PDF" vs "Stenn-Proof receipt" side-by-side.
 * (d) Why-different paragraph closing on the Stenn collapse framing.
 */

const PILLARS = [
  {
    n: "01",
    title: "Both sides, signed",
    body: "The vendor issued the invoice. The buyer signed an EIP-712 message accepting it. The receipt anchors both — not just the wire.",
  },
  {
    n: "02",
    title: "Cryptographically anchored",
    body: "When live-contract mode is enabled, the receipt hash is committed to the AuditReceipt contract on Arc.",
  },
  {
    n: "03",
    title: "Private by default",
    body: "Customer names, invoice line items, and PII never go onchain. Vendors choose what to reveal on the public receipt.",
  },
  {
    n: "04",
    title: "Embeddable, distributable",
    body: "Drop <KlaroReceiptBadge> on portfolio sites. Every receipt is a marketing impression.",
  },
];

export function StennProof() {
  return (
    <section className="bg-[var(--color-ink)] text-white">
      <div className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] py-[clamp(64px,9vw,120px)]">
        <div className="max-w-3xl">
          {/* Designer 2026-05-25 parity: eyebrow is GOLD (Stenn-Proof = gold trust
              mark per brand-kit §07), not brand-blue. Bigger headline to match. */}
          <p className="font-mono text-[11px] font-medium tracking-[0.18em] uppercase text-[var(--color-gold)]">
            Stenn-Proof
          </p>
          <h2 className="mt-4 font-display text-[clamp(2.5rem,5vw,4rem)] font-semibold leading-[1.05] tracking-tight">
            The receipt that proves itself.
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/70 md:text-lg">
            In live-contract mode, a Klaro payment can mint a public onchain
            receipt. The preview below shows the fields intended for independent
            verification without claiming a completed transaction.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <ReceiptDeep />
          <div className="grid gap-5 self-start">
            {PILLARS.map((p) => (
              // Pillar accents in gold to match Stenn-Proof brand mark.
              <article
                key={p.n}
                className="border-l-2 border-[var(--color-gold)] pl-5"
              >
                <p className="font-mono text-xs text-[var(--color-gold)]">
                  {p.n}
                </p>
                <h3 className="mt-2 font-display text-lg font-semibold">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm text-white/65">{p.body}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-16 grid items-stretch gap-6 md:grid-cols-[1fr_auto_1fr]">
          <PdfCard />
          <span
            aria-hidden
            className="hidden self-center text-center text-xs font-medium uppercase tracking-widest text-white/55 md:block"
          >
            vs
          </span>
          <StennCard />
        </div>

        <div className="mt-12 rounded-lg border border-white/10 bg-white/5 p-6 md:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-gold)]">
            What makes us different
          </p>
          <h3 className="mt-3 font-display text-2xl font-semibold leading-snug tracking-tight">
            The Stenn collapse was a fake-invoice problem. Our receipts solve
            it.
          </h3>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-white/65">
            Stenn lent against invoices that were never real. Klaro&apos;s live
            design requires buyer acceptance before payment routes and anchors
            proof fields only after verified settlement. The current testnet
            demo illustrates this evidence model without claiming live proof.
          </p>
        </div>
      </div>
    </section>
  );
}

function ReceiptDeep() {
  return (
    <article className="rounded-lg border border-white/10 bg-white p-7 text-[var(--color-ink)] shadow-[0_1px_4px_rgba(10,10,10,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
          Receipt preview
        </span>
        <Badge tone="sim">Testnet preview</Badge>
      </div>
      <p className="mt-3 font-mono text-xs text-[var(--color-ink-muted)]">
        myklaro.app/receipt/0x9f8a3c5b…
      </p>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <Row k="Invoice ID" v="cl7-d3-m0" />
        <Row k="Invoice hash" v="0x4cc1ae90…d8f0e" mono />
        <Row k="Amount" v="$4,200.00 USD" />
        <Row k="Received" v="Not submitted" />
        <Row k="Vendor" v="0x7a3c…b21f · Asha Pune (IN)" mono />
        <Row k="Customer" v="0xc41e…9d02 · acme.eth" mono />
        <Row k="Buyer acceptance" v="Awaiting signature" />
        <Row k="Screening" v="Manual review required" />
        <Row k="Settled" v="Not settled" />
        <Row k="Source route" v="Arc testnet target" />
        <Row k="Tx hash" v="Not available" />
      </dl>
      <p className="mt-5 border-t border-[var(--color-line)] pt-3 text-[11px] text-[var(--color-ink-subtle)]">
        Illustrative fields · v1.0 · Arc testnet preview
      </p>
    </article>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-[var(--color-ink-subtle)]">{k}</dt>
      <dd
        className={
          mono ? "font-mono text-[var(--color-ink)]" : "text-[var(--color-ink)]"
        }
      >
        {v}
      </dd>
    </>
  );
}

function PdfCard() {
  return (
    <article className="rounded-lg border border-white/15 bg-white/5 p-6 text-white/65">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-white/45">
        <span>Traditional PDF</span>
        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-rose-300">
          Unverified
        </span>
      </div>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <PdfRow k="Invoice" v="INV-0042" />
        <PdfRow k="Amount" v="$4,200.00" />
        <PdfRow k="Status" v="marked paid · trust me" />
        <PdfRow k="Buyer signature" v="none" />
        <PdfRow k="Screening" v="none" />
        <PdfRow k="Settlement proof" v="none" />
      </dl>
      <p className="mt-4 text-xs text-white/45">
        Could be fabricated. No way to verify it.
      </p>
    </article>
  );
}

function PdfRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-white/55">{k}</dt>
      <dd className="text-white/75">{v}</dd>
    </>
  );
}

function StennCard() {
  return (
    <article className="rounded-lg border border-white/15 bg-white/10 p-6">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-white/60">
        <span>Stenn-Proof receipt</span>
        <Badge tone="sim">Preview</Badge>
      </div>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <StennRow k="Invoice" v="cl7-d3-m0" />
        <StennRow k="Amount" v="$4,200.00 · 4,200 USDC" />
        <StennRow k="Buyer signature" v="Expected: EIP-712" />
        <StennRow k="Screening" v="Manual review" />
        <StennRow k="Settlement tx" v="Pending" />
        <StennRow k="Arc explorer" v="Available when anchored" />
      </dl>
      <p className="mt-4 text-xs text-white/70">
        Verifiable after a receipt is anchored in live-contract mode.
      </p>
    </article>
  );
}

function StennRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-white/55">{k}</dt>
      <dd className="text-white">{v}</dd>
    </>
  );
}
