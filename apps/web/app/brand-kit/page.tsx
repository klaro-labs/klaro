import Link from "next/link";
import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { BrandMark } from "@/components/klaro/BrandMark";
import { BrandKitTabs } from "./Tabs";

export const metadata: Metadata = {
  title: "Brand kit · Klaro",
  description:
    "Klaro brand kit — logo, colour palette, typography, voice guidelines, and downloadable asset bundle.",
};

/**
 * Brand kit — public marketing page.
 * Five tabs (Logo · Colour · Type · Voice · Downloads) so each section stays
 * digestible on mobile. Press band lives below all tabs.
 */
export default function BrandKitPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <Nav />
      <BrandKitHero />
      <BrandKitTabs
        tabs={[
          { id: "logo", label: "Logo", content: <LogoTab /> },
          { id: "color", label: "Colour", content: <ColorTab /> },
          { id: "type", label: "Type", content: <TypeTab /> },
          { id: "voice", label: "Voice", content: <VoiceTab /> },
          { id: "downloads", label: "Downloads", content: <DownloadsTab /> },
        ]}
      />
      <PressBand />
      <Footer />
    </main>
  );
}

/* ─── Hero ────────────────────────────────────────────────────────── */

function BrandKitHero() {
  return (
    <section className="mx-auto w-full max-w-[1216px] px-6 pt-20 pb-12 md:pt-[120px] md:pb-16">
      <p className="inline-flex rounded-pill border border-[var(--color-brand)]/20 bg-[var(--color-brand-soft)] px-3 py-1 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
        Brand kit · v0.4
      </p>
      <h1 className="mt-6 max-w-[560px] font-display text-[clamp(2.5rem,5.5vw,4.75rem)] font-semibold leading-[1.05] tracking-[-0.045em]">
        How <span className="text-[var(--color-brand)]">Klaro</span> looks, sounds, and shows up.
      </h1>
      <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--color-ink-muted)] md:text-lg">
        The Klaro brand exists to make stablecoin payments feel trustworthy, clear, and human. Use this kit for product surfaces, marketing, partner integrations, and press.
      </p>

      {/* Identity promise + how we work (was section 01 of monolith) */}
      <div className="mt-12 grid gap-5 md:grid-cols-2">
        <PromiseCard
          eyebrow="Mission"
          title="Make money move at the speed of work, anywhere on earth."
        />
        <PromiseCard
          eyebrow="Promise"
          title="Every payment, provably clean. Every receipt, provably real."
        />
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <MiniCard
          title="Clear."
          body="If a vendor can't understand what's happening with their money in one screen, we've failed."
        />
        <MiniCard
          title="Honest."
          body="We disclose every fee, every screening result, every counterparty. No hidden FX, no black-box compliance."
        />
        <MiniCard
          title="Built."
          body="We are engineers and operators. We ship working software, not white papers."
        />
      </div>

      {/* Meta band */}
      <dl className="mt-12 grid gap-8 border-t border-[var(--color-line)] pt-6 text-sm sm:grid-cols-2 md:grid-cols-4">
        <BkMeta term="Klaro Labs" def="Brand owner" />
        <BkMeta term="2026" def="Established" />
        <BkMeta term="brand@klaro.so" def="Questions" link="mailto:brand@klaro.so" />
        <BkMeta term="CC-BY 4.0" def="Brand guide license" />
      </dl>
    </section>
  );
}

function BkMeta({ term, def, link }: { term: string; def: string; link?: string }) {
  return (
    <div>
      <dt className="font-medium text-[var(--color-ink)]">
        {link ? (
          <a href={link} className="hover:text-[var(--color-brand)]">
            {term}
          </a>
        ) : (
          term
        )}
      </dt>
      <dd className="mt-1 font-mono text-xs text-[var(--color-ink-subtle)]">
        {def}
      </dd>
    </div>
  );
}

function PromiseCard({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-7">
      <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
        {eyebrow}
      </p>
      <p className="mt-4 font-display text-xl font-semibold leading-snug tracking-tight md:text-2xl">
        {title}
      </p>
    </article>
  );
}

function MiniCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
      <h3 className="font-display text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">{body}</p>
    </article>
  );
}

/* ─── Section helpers ─────────────────────────────────────────────── */

function TabHead({ title, lede }: { title: string; lede: string }) {
  return (
    <header className="mb-10">
      <h2 className="font-display text-[clamp(1.75rem,3.5vw,2.75rem)] font-semibold leading-[1.1] tracking-tight">
        {title}
      </h2>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--color-ink-muted)]">
        {lede}
      </p>
    </header>
  );
}

/* ─── Tab 1: Logo ──────────────────────────────────────────────────── */

function LogoTab() {
  return (
    <section>
      <TabHead
        title="Logo"
        lede="The Klaro mark is built from a solid stem and two chevrons pointing right — settlement, in shape. Use the horizontal lockup on most surfaces; symbol-only is reserved for tight icon contexts."
      />

      <figure className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)]">
        <div className="grid place-items-center px-6 py-24">
          <BrandMark size={240} />
        </div>
        <figcaption className="flex items-center justify-between border-t border-[var(--color-line)] bg-white px-5 py-3 text-xs">
          <span className="font-mono text-[var(--color-ink-muted)]">Klaro symbol</span>
          <span className="font-mono text-[var(--color-ink-subtle)]">24×24 base · solid fills</span>
        </figcaption>
      </figure>

      <figure className="mt-5 overflow-hidden rounded-lg border border-[var(--color-line)]">
        <div className="grid place-items-center bg-white px-6 py-16">
          <span className="inline-flex items-center gap-4">
            <BrandMark size={80} />
            <span className="font-display text-5xl font-semibold tracking-tight">klaro</span>
          </span>
        </div>
        <figcaption className="flex items-center justify-between border-t border-[var(--color-line)] bg-white px-5 py-3 text-xs">
          <span className="font-mono text-[var(--color-ink-muted)]">Horizontal lockup</span>
          <span className="font-mono text-[var(--color-ink-subtle)]">Default for most surfaces</span>
        </figcaption>
      </figure>

      <figure className="mt-5 overflow-hidden rounded-lg border border-[var(--color-line)]">
        <div className="grid place-items-center bg-[var(--color-ink)] px-6 py-16">
          <span className="inline-flex items-center gap-4">
            <BrandMark size={80} inkFill="#ffffff" brandFill="var(--color-klaro-orange)" />
            <span className="font-display text-5xl font-semibold tracking-tight text-white">klaro</span>
          </span>
        </div>
        <figcaption className="flex items-center justify-between border-t border-[var(--color-line)] bg-white px-5 py-3 text-xs">
          <span className="font-mono text-[var(--color-ink-muted)]">Dark surface lockup</span>
          <span className="font-mono text-[var(--color-ink-subtle)]">Stem inverts to white; chevrons unchanged</span>
        </figcaption>
      </figure>

      <div className="mt-8 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-6">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
          Clearspace
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Keep clearspace around the mark equal to the stem width. Never crop the chevrons. Never rotate, skew, or apply effects.
        </p>
      </div>
    </section>
  );
}

/* ─── Tab 2: Colour ────────────────────────────────────────────────── */

function ColorTab() {
  return (
    <section>
      <TabHead
        title="Colour"
        lede="Klaro's terracotta carries the brand. Stenn-Proof gold is reserved exclusively for verified receipts. Everything else is warm graphite or paper."
      />

      <div className="space-y-5">
        <ColorCard
          bg="#BC4C26"
          fg="#ffffff"
          eyebrow="Primary · Brand"
          name="Klaro terracotta"
          hex="#BC4C26"
          rgb="188 76 38"
          oklch="0.56 0.15 38"
          note="Calls to action, links, accents, hero highlights. The brand's load-bearing colour."
        />
        <ColorCard
          bg="#F5B100"
          fg="#0A0A0A"
          eyebrow="Accent · Reserved"
          name="Stenn-Proof gold"
          hex="#F5B100"
          rgb="245 177 0"
          oklch="0.79 0.16 76"
          note="ONLY on verified Stenn-Proof receipts and the receipt badge. Never on buttons, links, or marketing chrome."
        />
        <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-7">
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
            Neutrals
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Warm-leaning grayscale. Backgrounds are tinted slightly off-white. Body text never goes lighter than #6B6B6B, and secondary labels never lighter than #707070, for WCAG AA contrast.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3 md:grid-cols-5">
            <Swatch hex="#0A0A0A" label="Ink" />
            <Swatch hex="#6B6B6B" label="Ink · muted" />
            <Swatch hex="#707070" label="Ink · subtle" />
            <Swatch hex="#E5E5E5" label="Line" />
            <Swatch hex="#FAFAF7" label="Paper" />
          </div>
        </article>
      </div>
    </section>
  );
}

function ColorCard({
  bg,
  fg,
  eyebrow,
  name,
  hex,
  rgb,
  oklch,
  note,
}: {
  bg: string;
  fg: string;
  eyebrow: string;
  name: string;
  hex: string;
  rgb: string;
  oklch: string;
  note: string;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-[var(--color-line)]">
      <div className="relative px-7 py-12 sm:py-16" style={{ background: bg, color: fg }}>
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase opacity-80">{eyebrow}</p>
        <p className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">{name}</p>
        <dl className="mt-6 font-mono text-xs opacity-90 sm:absolute sm:right-7 sm:bottom-6 sm:mt-0">
          <Pair k="HEX" v={hex} />
          <Pair k="RGB" v={rgb} />
          <Pair k="OKLCH" v={oklch} />
        </dl>
      </div>
      <p className="border-t border-[var(--color-line)] bg-white px-7 py-4 text-sm text-[var(--color-ink-muted)]">
        {note}
      </p>
    </article>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3 sm:justify-end">
      <dt>{k}</dt>
      <dd>· {v}</dd>
    </div>
  );
}

function Swatch({ hex, label }: { hex: string; label: string }) {
  return (
    <div>
      <div
        className="h-16 w-full rounded-md border border-[var(--color-line)]"
        style={{ background: hex }}
      />
      <p className="mt-2 font-mono text-[11px] text-[var(--color-ink-muted)]">{label}</p>
      <p className="font-mono text-[10px] text-[var(--color-ink-subtle)]">{hex}</p>
    </div>
  );
}

/* ─── Tab 3: Type ──────────────────────────────────────────────────── */

function TypeTab() {
  return (
    <section>
      <TabHead
        title="Typography"
        lede="Three families. Inter Tight for display, Inter for body, JetBrains Mono for receipts, code, and wallet addresses. All three are open-source under SIL Open Font License."
      />

      <div className="space-y-5">
        <TypeCard
          family="Inter Tight"
          usage="Display · headlines, hero, section titles"
          meta="600 · letter-spacing -0.04em"
          sample="Get paid in seconds."
          sampleClass="font-display text-[clamp(2.25rem,5vw,4rem)] font-semibold leading-[1.05] tracking-tight"
        />
        <TypeCard
          family="Inter"
          usage="Body · UI text, prose, forms"
          meta="400 / 500 / 600"
          sample="Issue an invoice. Get paid in USDC. Sweep to local currency."
          sampleClass="font-sans text-xl leading-snug md:text-2xl"
        />
        <TypeCard
          family="JetBrains Mono"
          usage="Mono · receipts, code, wallet addresses, tabular data"
          meta="400 / 500"
          sample="0x7a3c…b21f · 4,200.00 USDC · receipt.klaro.so"
          sampleClass="font-mono text-lg md:text-xl"
        />
      </div>
    </section>
  );
}

function TypeCard({
  family,
  usage,
  meta,
  sample,
  sampleClass,
}: {
  family: string;
  usage: string;
  meta: string;
  sample: string;
  sampleClass: string;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)]">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--color-line)] px-6 py-4">
        <div>
          <p className="font-display text-base font-semibold">{family}</p>
          <p className="font-mono text-xs text-[var(--color-ink-subtle)]">{usage}</p>
        </div>
        <p className="font-mono text-[11px] text-[var(--color-ink-subtle)]">{meta}</p>
      </div>
      <div className="px-6 py-10 md:px-10 md:py-14">
        <p className={sampleClass}>{sample}</p>
      </div>
    </article>
  );
}

/* ─── Tab 4: Voice ─────────────────────────────────────────────────── */

function VoiceTab() {
  return (
    <section>
      <TabHead
        title="Voice & tone"
        lede="We write the way an honest senior engineer would talk to a vendor in their second language. Direct. Concrete. Never patronising."
      />

      <div className="grid gap-5 md:grid-cols-3">
        <VoiceCard
          title="Direct."
          body="State what happens. Use verbs. Cut hedging. If a vendor needs to scroll to find the answer, we've already lost."
        />
        <VoiceCard
          title="Confident."
          body={`"Stenn-Proof receipt" beats "best-in-class compliance solution." Show the work; don't boast about it.`}
        />
        <VoiceCard
          title="Multilingual-aware."
          body="Headlines are tested in English, Hindi, Portuguese, Spanish, Tagalog, and Swahili before publishing. Idioms get cut."
        />
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <DoDontPair
          dont="Leverage on-chain settlement primitives to unlock receivables financing optionality."
          dont2="Best-in-class enterprise-grade compliance solution leveraging industry-leading providers."
          doer="Get paid in seconds. Prove every payment with a public receipt."
          doer2="Every payment is screened by Elliptic, TRM, and Chainalysis. The receipt records all three results."
        />
        <DoDontPair
          dont="We're excited to share that we're partnering with Circle to bring you the next generation of cross-border payments!"
          dont2="Onboarding has never been easier with our seamless KYC integration."
          doer="Klaro runs on Circle's Arc network. Payments settle in stablecoins. Vendors keep more of what they earn."
          doer2="Sign up with Google. Verify your business in four minutes. Send your first invoice."
        />
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <UsageCard
          kind="do"
          title="Allowed without asking"
          items={[
            "Linking to klaro.so or any subdomain.",
            "Using the Klaro logo to indicate Klaro integration in your product (with a link back).",
            "Embedding the Stenn-Proof badge on receipts you've actually issued through Klaro.",
            "Writing about Klaro in editorial / news contexts.",
            "Using brand colours and typography as visual reference in case studies.",
          ]}
        />
        <UsageCard
          kind="dont"
          title="Requires brand@klaro.so"
          items={[
            "Using the Stenn-Proof badge on receipts you haven't issued through Klaro.",
            "Modifying the logo — recolouring, redrawing, adding effects, animating beyond the supplied motion files.",
            "Combining the Klaro logo with another mark in a single composite mark.",
            'Using "Klaro" or "Stenn-Proof" as part of a product name you ship.',
            "Selling merchandise that uses the Klaro logo.",
          ]}
        />
      </div>
    </section>
  );
}

function VoiceCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
      <h3 className="font-display text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">{body}</p>
    </article>
  );
}

function DoDontPair({
  dont,
  dont2,
  doer,
  doer2,
}: {
  dont: string;
  dont2: string;
  doer: string;
  doer2: string;
}) {
  return (
    <div className="space-y-4">
      <DoDontBlock kind="dont" lines={[dont, dont2]} />
      <DoDontBlock kind="do" lines={[doer, doer2]} />
    </div>
  );
}

function DoDontBlock({ kind, lines }: { kind: "do" | "dont"; lines: string[] }) {
  const isDo = kind === "do";
  return (
    <div
      className={`rounded-lg border p-5 ${
        isDo ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"
      }`}
    >
      <p
        className={`inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] uppercase ${
          isDo ? "text-emerald-700" : "text-rose-700"
        }`}
      >
        <span
          className={`inline-flex size-4 items-center justify-center rounded-full text-[10px] text-white ${
            isDo ? "bg-emerald-500" : "bg-rose-500"
          }`}
        >
          {isDo ? "✓" : "✕"}
        </span>
        {isDo ? "Do" : "Don't"}
      </p>
      <ul
        className={`mt-3 space-y-3 text-sm ${
          isDo ? "font-medium text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"
        }`}
      >
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function UsageCard({ kind, title, items }: { kind: "do" | "dont"; title: string; items: string[] }) {
  const isDo = kind === "do";
  return (
    <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
      <p
        className={`inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] uppercase ${
          isDo ? "text-emerald-700" : "text-rose-700"
        }`}
      >
        <span
          className={`inline-flex size-4 items-center justify-center rounded-full text-[10px] text-white ${
            isDo ? "bg-emerald-500" : "bg-rose-500"
          }`}
        >
          {isDo ? "✓" : "✕"}
        </span>
        {title}
      </p>
      <ul className="mt-5 space-y-4 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className={`mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] text-white ${
                isDo ? "bg-emerald-500" : "bg-rose-500"
              }`}
            >
              {isDo ? "✓" : "✕"}
            </span>
            <span className={isDo ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"}>
              {it}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ─── Tab 5: Downloads ─────────────────────────────────────────────── */

const DOWNLOADS = [
  {
    title: "Klaro mark (light)",
    meta: "1 KB · SVG",
    body: "Symbol on light surfaces. Inline-ready, no bitmap fallback needed.",
    href: "/brand/klaro-mark.svg",
  },
  {
    title: "Klaro mark (dark)",
    meta: "1 KB · SVG",
    body: "Symbol with white stem for dark backgrounds.",
    href: "/brand/klaro-mark-dark.svg",
  },
  {
    title: "Klaro horizontal wordmark",
    meta: "2 KB · SVG",
    body: "Symbol + wordmark lockup. Default for most surfaces.",
    href: "/brand/klaro-wordmark.svg",
  },
  {
    title: "Colour tokens (CSS)",
    meta: "1 KB · :root variables",
    body: "Drop-in CSS custom properties. Same values our app uses.",
    href: "/brand/klaro-tokens.css",
  },
  {
    title: "Colour tokens (JSON)",
    meta: "1 KB · DTCG format",
    body: "Design Tokens Community Group schema. Pipe into Style Dictionary, Figma Tokens, or your own tooling.",
    href: "/brand/klaro-tokens.json",
  },
];

function DownloadsTab() {
  return (
    <section>
      <TabHead
        title="Downloads"
        lede="What we have today. Logo, wordmark, and colour tokens — production-ready. The full Figma source and font WOFF2 bundle are in progress; email brand@klaro.so to get them early."
      />

      <div className="grid gap-5 md:grid-cols-2">
        {DOWNLOADS.map((d) => (
          <DownloadCard key={d.href} {...d} />
        ))}
        <RequestCard
          title="Figma source · brand kit"
          meta="In progress"
          body="Every page in this document, editable, auto-layout components. Email to request early access."
        />
        <RequestCard
          title="Typography · WOFF2 bundle"
          meta="In progress"
          body="Inter Tight, Inter, JetBrains Mono — subsetted to Latin + Devanagari + Cyrillic."
        />
      </div>

      <p className="mt-8 max-w-2xl text-xs text-[var(--color-ink-subtle)]">
        Logo files: all rights reserved. Brand guide text: CC-BY 4.0. Fonts are distributed under the SIL Open Font License by their authors; we do not sublicense them.
      </p>
    </section>
  );
}

function DownloadCard({
  title,
  meta,
  body,
  href,
}: {
  title: string;
  meta: string;
  body: string;
  href: string;
}) {
  return (
    <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
          <p className="mt-1 font-mono text-xs text-[var(--color-ink-subtle)]">{meta}</p>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">{body}</p>
        </div>
        <a
          href={href}
          download
          className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-medium hover:border-[var(--color-ink)]"
        >
          ↓ Download
        </a>
      </div>
    </article>
  );
}

function RequestCard({ title, meta, body }: { title: string; meta: string; body: string }) {
  return (
    <article className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-bg-warm)] p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
          <p className="mt-1 font-mono text-xs text-[var(--color-ink-subtle)]">{meta}</p>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">{body}</p>
        </div>
        <a
          href="mailto:brand@klaro.so?subject=Brand%20kit%20request"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-medium hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
        >
          Email to request
        </a>
      </div>
    </article>
  );
}

/* ─── Press band ───────────────────────────────────────────────────── */

function PressBand() {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-6 pb-24">
      <article className="flex flex-col items-start gap-6 rounded-lg bg-[var(--color-ink)] p-8 text-white md:flex-row md:items-center md:justify-between md:p-10">
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-gold)]">
            Press & partnerships
          </p>
          <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight md:text-3xl">
            Working on a story or co-launch?
          </h3>
          <p className="mt-2 text-sm text-white/70">
            Reach the brand team directly. We respond within one business day.
          </p>
        </div>
        <Link
          href="mailto:brand@klaro.so"
          className="inline-flex h-11 items-center rounded-pill bg-white px-5 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-gold)]"
        >
          brand@klaro.so
        </Link>
      </article>
    </section>
  );
}
