import Link from "next/link";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { BrandMark } from "@/components/klaro/BrandMark";

/**
 * Brand kit — public marketing page, mirror of `designer/brand-kit/index.html`.
 * 10 numbered sections + hero + press band, all in one cohesive long-form page
 * with a sticky left sidebar (CONTENTS) and right content column.
 * Section copy and structure copied verbatim from the designer source.
 */

const SECTIONS = [
  { n: "01", slug: "identity", label: "Identity" },
  { n: "02", slug: "logo", label: "Logo" },
  { n: "03", slug: "color", label: "Color" },
  { n: "04", slug: "typography", label: "Typography" },
  { n: "05", slug: "voice", label: "Voice & tone" },
  { n: "06", slug: "components", label: "Components" },
  { n: "07", slug: "stenn-proof", label: "Stenn-Proof badge" },
  { n: "08", slug: "imagery", label: "Imagery" },
  { n: "09", slug: "usage", label: "Usage rules" },
  { n: "10", slug: "downloads", label: "Downloads" },
] as const;

export default function BrandKitPage() {
  return (
    <main>
      <Nav />
      <BrandKitHero />
      <div className="mx-auto w-full max-w-[1200px] px-6 pt-[78px] pb-16">
        <div className="grid gap-12 md:grid-cols-[220px_1fr]">
          <ContentsSidebar />
          <div>
            <SectionIdentity />
            <SectionLogo />
            <SectionColor />
            <SectionTypography />
            <SectionVoice />
            <SectionComponents />
            <SectionStennBadge />
            <SectionImagery />
            <SectionUsage />
            <SectionDownloads />
          </div>
        </div>
      </div>
      <PressBand />
      <Footer />
    </main>
  );
}

/* ─── Hero ────────────────────────────────────────────────────────── */

function BrandKitHero() {
  return (
    <section className="mx-auto w-full max-w-[1216px] px-6 pt-20 pb-16 md:-translate-y-[5px] md:pt-[140px] md:pb-24">
      <p className="inline-flex rounded-pill border border-[var(--color-brand)]/20 bg-[var(--color-brand-soft)] px-3 py-1 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
        Brand kit · v0.4
      </p>
      <h1 className="mt-6 max-w-[540px] font-display text-[clamp(3rem,6.5vw,5.65rem)] font-semibold leading-[1.03] tracking-[-0.055em]">
        How <span className="text-[var(--color-brand)]">Klaro</span> looks,
        sounds, and shows up.
      </h1>
      <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--color-ink-muted)] md:text-lg">
        The Klaro brand exists to make stablecoin payments feel trustworthy,
        clear, and human. Use this kit for product surfaces, marketing, partner
        integrations, and press.
      </p>
      <div className="mt-10 flex gap-3">
        <Link
          href="#downloads"
          className="inline-flex h-11 items-center gap-2 rounded-pill bg-[var(--color-ink)] px-5 text-sm font-medium text-white hover:bg-black"
        >
          Download assets ↓
        </Link>
        <Link
          href="#identity"
          className="inline-flex h-11 items-center rounded-pill border border-[var(--color-line)] bg-white px-5 text-sm font-medium hover:bg-[var(--color-bg-elevated)]"
        >
          Read the guide
        </Link>
      </div>

      {/* 4-column meta band, mirrors designer hero bottom */}
      <dl className="mt-16 grid gap-8 border-t border-[var(--color-line)] pt-6 text-sm sm:grid-cols-2 md:grid-cols-4">
        <BkMeta term="Klaro Labs Inc." def="Brand owner" />
        <BkMeta term="2026" def="Established" />
        <BkMeta
          term="brand@klaro.so"
          def="Questions"
          link="mailto:brand@klaro.so"
        />
        <BkMeta term="CC-BY 4.0" def="Brand guide license" />
      </dl>
    </section>
  );
}

function BkMeta({
  term,
  def,
  link,
}: {
  term: string;
  def: string;
  link?: string;
}) {
  return (
    <div>
      {link ? (
        <a
          href={link}
          className="font-medium text-[var(--color-ink)] hover:text-[var(--color-brand)]"
        >
          {term}
        </a>
      ) : (
        <p className="font-medium text-[var(--color-ink)]">{term}</p>
      )}
      <p className="mt-1 font-mono text-xs text-[var(--color-ink-subtle)]">
        {def}
      </p>
    </div>
  );
}

/* ─── Sticky CONTENTS sidebar ─────────────────────────────────────── */

function ContentsSidebar() {
  return (
    <aside className="hidden md:block">
      <div className="sticky top-24">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-ink-subtle)]">
          Contents
        </p>
        <ol className="mt-4 space-y-2.5 border-l border-[var(--color-line)]">
          {SECTIONS.map((s) => (
            <li key={s.slug}>
              <a
                href={`#${s.slug}`}
                className="-ml-px block border-l-2 border-transparent py-1 pl-4 text-sm text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-brand)] hover:text-[var(--color-ink)]"
              >
                {s.n} · {s.label}
              </a>
            </li>
          ))}
        </ol>
        <p className="mt-8 font-mono text-xs text-[var(--color-ink-subtle)]">
          v0.4 · 2026-05-19
        </p>
        <p className="font-mono text-xs text-[var(--color-ink-subtle)]">
          Working draft
        </p>
      </div>
    </aside>
  );
}

/* ─── Section helpers ─────────────────────────────────────────────── */

function BkSectionHead({
  n,
  title,
  lede,
}: {
  n: string;
  title: string;
  lede: string;
}) {
  return (
    <header>
      <div className="flex items-baseline gap-6">
        <span className="font-mono text-sm text-[var(--color-ink-subtle)]">
          {n}
        </span>
        <h2 className="font-display text-[clamp(2.25rem,4vw,3.5rem)] font-semibold leading-[1.05] tracking-tight">
          {title}
        </h2>
      </div>
      <p className="mt-6 max-w-3xl text-base leading-relaxed text-[var(--color-ink-muted)] md:text-lg">
        {lede}
      </p>
    </header>
  );
}

/* ─── 01 Identity ─────────────────────────────────────────────────── */

function SectionIdentity() {
  return (
    <section id="identity" className="scroll-mt-24">
      <BkSectionHead
        n="01"
        title="Identity"
        lede="Klaro is the operating system for stablecoin payments. Our brand promises clarity — about money, about counterparties, about what happens after you press send."
      />
      <div className="mt-10 grid gap-5 md:grid-cols-2">
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
    </section>
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
      <h3 className="font-display text-xl font-semibold tracking-tight">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
        {body}
      </p>
    </article>
  );
}

/* ─── 02 Logo ──────────────────────────────────────────────────────── */

function SectionLogo() {
  return (
    <section id="logo" className="mt-[clamp(80px,10vw,160px)] scroll-mt-24">
      <BkSectionHead
        n="02"
        title="Logo"
        lede="The Klaro mark is built from three rectangles — one for each surface of the product: invoicing, off-ramp, financing. Together they form a K."
      />

      <figure className="mt-10 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)]">
        <div className="grid place-items-center px-6 py-24">
          <BrandMark size={300} />
        </div>
        <figcaption className="flex items-center justify-between border-t border-[var(--color-line)] bg-white px-5 py-3 text-xs">
          <span className="font-mono text-[var(--color-ink-muted)]">
            Klaro symbol
          </span>
          <span className="font-mono text-[var(--color-ink-subtle)]">
            100x100 base · uniform stroke
          </span>
        </figcaption>
      </figure>

      <figure className="mt-5 overflow-hidden rounded-lg border border-[var(--color-line)]">
        <div className="grid place-items-center bg-white px-6 py-16">
          <span className="inline-flex items-center gap-4">
            <BrandMark size={80} />
            <span className="font-display text-5xl font-semibold tracking-tight">
              klaro
            </span>
          </span>
        </div>
        <figcaption className="flex items-center justify-between border-t border-[var(--color-line)] bg-white px-5 py-3 text-xs">
          <span className="font-mono text-[var(--color-ink-muted)]">
            Horizontal lockup
          </span>
          <span className="font-mono text-[var(--color-ink-subtle)]">
            Symbol + wordmark · default for most surfaces
          </span>
        </figcaption>
      </figure>

      <figure className="mt-5 overflow-hidden rounded-lg border border-[var(--color-line)]">
        <div className="grid place-items-center bg-[var(--color-ink)] px-6 py-16">
          <span className="inline-flex items-center gap-4">
            <BrandMark size={80} inkFill="#ffffff" brandFill="#C7522A" />
            <span className="font-display text-5xl font-semibold tracking-tight text-white">
              klaro
            </span>
          </span>
        </div>
        <figcaption className="flex items-center justify-between border-t border-[var(--color-line)] bg-white px-5 py-3 text-xs">
          <span className="font-mono text-[var(--color-ink-muted)]">
            Dark surface lockup
          </span>
          <span className="font-mono text-[var(--color-ink-subtle)]">
            Stem inverts to white; orange arms unchanged
          </span>
        </figcaption>
      </figure>
    </section>
  );
}

/* ─── 03 Color ─────────────────────────────────────────────────────── */

function SectionColor() {
  return (
    <section id="color" className="mt-[clamp(80px,10vw,160px)] scroll-mt-24">
      <BkSectionHead
        n="03"
        title="Color"
        lede="Klaro's terracotta carries the brand. Stenn-Proof gold is reserved exclusively for verified receipts. Everything else is warm graphite or paper."
      />
      <div className="mt-10 space-y-5">
        <ColorCard
          bg="#C7522A"
          fg="#ffffff"
          eyebrow="Primary · Brand"
          name="Klaro terracotta"
          hex="#C7522A"
          rgb="199 82 42"
          oklch="0.58 0.18 38"
          note="Calls to action, links, accents, hero highlights. The brand's load-bearing color."
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
            Warm-leaning grayscale. Backgrounds are tinted slightly off-white.
            Text never goes lower than #6B6B6B for accessibility.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3 md:grid-cols-5">
            <Swatch hex="#0A0A0A" label="Ink" />
            <Swatch hex="#6B6B6B" label="Ink · muted" />
            <Swatch hex="#A3A3A3" label="Ink · subtle" />
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
      <div
        className="relative px-7 py-12"
        style={{ background: bg, color: fg }}
      >
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase opacity-80">
          {eyebrow}
        </p>
        <p className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
          {name}
        </p>
        <dl className="absolute right-7 bottom-6 font-mono text-xs opacity-90">
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
    <div className="flex justify-end gap-3">
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
      <p className="mt-2 font-mono text-[11px] text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p className="font-mono text-[10px] text-[var(--color-ink-subtle)]">
        {hex}
      </p>
    </div>
  );
}

/* ─── 04 Typography ────────────────────────────────────────────────── */

function SectionTypography() {
  return (
    <section id="typography" className="mt-[clamp(80px,10vw,160px)] scroll-mt-24">
      <BkSectionHead
        n="04"
        title="Typography"
        lede="Three families. Inter Tight for display, Inter for body, JetBrains Mono for receipts, code, and wallet addresses."
      />
      <div className="mt-10 space-y-5">
        <TypeCard
          family="Inter Tight"
          usage="Display · headlines, hero, section titles"
          meta="600 · letter-spacing -0.04em"
          sample="Get paid in seconds."
          sampleClass="font-display text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[1.05] tracking-tight"
        />
        <TypeCard
          family="Inter"
          usage="Body · UI text, prose, forms"
          meta="400 / 500 / 600"
          sample="Issue an invoice. Get paid in USDC. Sweep to local currency."
          sampleClass="font-sans text-2xl leading-snug"
        />
        <TypeCard
          family="JetBrains Mono"
          usage="Mono · receipts, code, wallet addresses, tabular data"
          meta="400 / 500"
          sample="0x7a3c…b21f · 4,200.00 USDC · receipt.klaro.so"
          sampleClass="font-mono text-xl"
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
      <div className="flex items-baseline justify-between border-b border-[var(--color-line)] px-6 py-4">
        <div>
          <p className="font-display text-base font-semibold">{family}</p>
          <p className="font-mono text-xs text-[var(--color-ink-subtle)]">
            {usage}
          </p>
        </div>
        <p className="font-mono text-[11px] text-[var(--color-ink-subtle)]">
          {meta}
        </p>
      </div>
      <div className="px-6 py-10 md:px-10 md:py-16">
        <p className={sampleClass}>{sample}</p>
      </div>
    </article>
  );
}

/* ─── 05 Voice & tone ──────────────────────────────────────────────── */

function SectionVoice() {
  return (
    <section id="voice" className="mt-[clamp(80px,10vw,160px)] scroll-mt-24">
      <BkSectionHead
        n="05"
        title="Voice & tone"
        lede="We write the way an honest senior engineer would talk to a vendor in their second language. Direct. Concrete. Never patronizing."
      />
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <VoiceCard
          title="Direct."
          body={`State what happens. Use verbs. Cut hedging. If a vendor needs to scroll to find the answer, we've already lost.`}
        />
        <VoiceCard
          title="Confident."
          body={`"Stenn-Proof receipt" beats "best-in-class compliance solution." Show the work; don't boast about it.`}
        />
        <VoiceCard
          title="Multilingual-aware."
          body={`Headlines are tested in English, Hindi, Portuguese, Spanish, Tagalog, and Swahili before publishing. Idioms get cut.`}
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
          doer2="Sign up with Google. Verify your business in 4 minutes. Send your first invoice."
        />
      </div>
    </section>
  );
}

function VoiceCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
      <h3 className="font-display text-xl font-semibold tracking-tight">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
        {body}
      </p>
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

function DoDontBlock({
  kind,
  lines,
}: {
  kind: "do" | "dont";
  lines: string[];
}) {
  const isDo = kind === "do";
  return (
    <div
      className={`rounded-lg border p-5 ${isDo ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"}`}
    >
      <p
        className={`inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] uppercase ${isDo ? "text-emerald-700" : "text-rose-700"}`}
      >
        <span
          className={`inline-flex size-4 items-center justify-center rounded-full text-[10px] text-white ${isDo ? "bg-emerald-500" : "bg-rose-500"}`}
        >
          {isDo ? "✓" : "✕"}
        </span>
        {isDo ? "Do" : "Don't"}
      </p>
      <ul
        className={`mt-3 space-y-3 text-sm ${isDo ? "text-[var(--color-ink)] font-medium" : "text-[var(--color-ink-muted)]"}`}
      >
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

/* ─── 06 Components ────────────────────────────────────────────────── */

function SectionComponents() {
  return (
    <section id="components" className="mt-[clamp(80px,10vw,160px)] scroll-mt-24">
      <BkSectionHead
        n="06"
        title="Components"
        lede="Small set of building blocks. Every Klaro surface is composed from these."
      />

      <CompGroup
        label="Buttons"
        note="Primary uses ink fill by default; switches to Klaro terracotta on hover. Hero CTAs use 48px height."
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-pill bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-brand)]"
          >
            Primary action
          </button>
          <button
            type="button"
            className="rounded-pill border border-[var(--color-line)] bg-white px-5 py-2.5 text-sm font-medium hover:border-[var(--color-ink)]"
          >
            Secondary
          </button>
          <a
            href="/product"
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-brand)] hover:underline"
          >
            Tertiary link →
          </a>
          <button
            type="button"
            className="rounded-pill bg-[var(--color-ink)] px-6 py-3 text-base font-medium text-white hover:bg-[var(--color-brand)]"
          >
            Hero CTA
          </button>
        </div>
      </CompGroup>

      <CompGroup
        label="Chips & tags"
        note="Status, scope, environment. Use lowercase verbs or one-word labels."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Chip>Neutral</Chip>
          <Chip tone="brand">Active state</Chip>
          <Chip tone="gold">Verified</Chip>
          <Chip tone="live">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Live
          </Chip>
          <Chip tone="brand-soft">
            <span className="size-1.5 rounded-full bg-[var(--color-brand)]" />
            On Arc
          </Chip>
        </div>
      </CompGroup>

      <CompGroup
        label="Iconography"
        note="Stroke-based. 1.6px weight. Rounded line-caps. Geometric. Never filled."
      >
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {[
            "📄",
            "💳",
            "🛡",
            "🔒",
            "→",
            "✓",
            "+",
            "🌐",
            "🕐",
            "✦",
            "◉",
            "🔑",
          ].map((g, i) => (
            <div
              key={i}
              className="grid h-14 w-14 place-items-center rounded-md border border-[var(--color-line)] text-lg text-[var(--color-ink-muted)]"
            >
              {g}
            </div>
          ))}
        </div>
      </CompGroup>
    </section>
  );
}

function CompGroup({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mt-5 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
      <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
        {label}
      </p>
      <div className="mt-5 border-t border-[var(--color-line)] pt-5">
        {children}
      </div>
      <p className="mt-5 text-sm text-[var(--color-ink-muted)]">{note}</p>
    </article>
  );
}

function Chip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "brand" | "gold" | "live" | "brand-soft";
  children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    neutral:
      "border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)]",
    brand: "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
    gold: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    live: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    "brand-soft":
      "bg-[var(--color-brand-soft)] text-[var(--color-brand)] ring-1 ring-[var(--color-brand)]/15",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 font-mono text-[11px] ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

/* ─── 07 Stenn-Proof badge ─────────────────────────────────────────── */

function SectionStennBadge() {
  return (
    <section id="stenn-proof" className="mt-[clamp(80px,10vw,160px)] scroll-mt-24">
      <BkSectionHead
        n="07"
        title="The Stenn-Proof badge"
        lede="Our signature object. A small gold-and-ink badge that anchors trust. Every verified receipt carries it. Nothing else may."
      />

      <figure className="mt-10 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-ink)]">
        <div className="grid place-items-center py-20">
          <StennBadge size="hero" />
        </div>
        <figcaption className="flex items-center justify-between border-t border-white/10 bg-[var(--color-ink)] px-5 py-3 text-xs text-white/60">
          <span className="font-mono">The badge</span>
          <span className="font-mono">At 2.2x for inspection</span>
        </figcaption>
      </figure>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
            Three sizes
          </p>
          <ul className="mt-5 space-y-4">
            <li className="flex items-center justify-between gap-4">
              <StennBadge size="sm" />
              <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
                Compact · 20px
              </span>
            </li>
            <li className="flex items-center justify-between gap-4">
              <StennBadge size="md" />
              <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
                Default · 28px
              </span>
            </li>
            <li className="flex items-center justify-between gap-4">
              <StennBadge size="lg" />
            </li>
          </ul>
        </article>

        <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
            Embed snippet
          </p>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Vendors drop the React component on their portfolio. Every receipt
            is a marketing impression.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-md bg-[var(--color-ink)] p-4 font-mono text-[12px] leading-relaxed text-white">
            {`import { KlaroReceiptBadge } from "@klaro/receipt-badge";

<KlaroReceiptBadge
  hash="0x9f8a3c5b…"
  size="default"
/>`}
          </pre>
        </article>
      </div>
    </section>
  );
}

function StennBadge({ size }: { size: "sm" | "md" | "lg" | "hero" }) {
  const cls = {
    sm: "h-6  text-[10px] gap-1.5 px-2.5",
    md: "h-8  text-xs    gap-2   px-3",
    lg: "h-10 text-sm    gap-2   px-4",
    hero: "h-14 text-base  gap-3   px-6 tracking-[0.2em]",
  }[size];
  return (
    <span
      className={`inline-flex items-center rounded-pill bg-amber-100 font-mono uppercase text-amber-800 ring-1 ring-amber-300 ${cls}`}
    >
      <span
        className="grid place-items-center rounded-full bg-[var(--color-gold)] text-white"
        style={{ width: "1.4em", height: "1.4em" }}
      >
        ✓
      </span>
      Stenn-Proof · Verified
    </span>
  );
}

/* ─── 08 Imagery ───────────────────────────────────────────────────── */

function SectionImagery() {
  return (
    <section id="imagery" className="mt-[clamp(80px,10vw,160px)] scroll-mt-24">
      <BkSectionHead
        n="08"
        title="Imagery"
        lede="Real vendors, real workplaces. No stock photography. No glossy money imagery. No abstract crypto art."
      />
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <ImageryPlaceholder
          label="Vendor portraits"
          note="Real founders in real workspaces. Natural light. Eye contact. No staged laptops."
        />
        <ImageryPlaceholder
          label="Product surfaces"
          note="Real Klaro UI in real contexts: phone in hand, browser in dim café, ledger on screen."
        />
        <ImageryPlaceholder
          label="Place + texture"
          note="Documentary detail shots: shopfronts, ledgers, ports, hands. Anchors corridor stories."
        />
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <DoDontImage
          kind="dont"
          art={
            <div
              className="h-full w-full"
              style={{
                background:
                  "radial-gradient(circle at 40% 40%, #f6c200 0%, #0A0A0A 50%, #00E5FF 100%)",
              }}
            />
          }
          label="typical crypto art (don't)"
          note="No abstract money imagery. No glowing coins, no $-signs, no neon networks."
        />
        <DoDontImage
          kind="do"
          art={
            <div
              className="grid h-full w-full place-items-center text-xs text-[var(--color-ink-subtle)]"
              style={{
                background:
                  "repeating-linear-gradient(45deg, var(--color-bg) 0 8px, var(--color-bg-elevated) 8px 16px)",
              }}
            >
              vendor portrait · real workspace
            </div>
          }
          label="vendor portrait · real workspace"
          note="Documentary photography. Restrained editing. Black-and-white when in doubt."
        />
      </div>
    </section>
  );
}

function ImageryPlaceholder({ label, note }: { label: string; note: string }) {
  return (
    <article>
      <div
        className="grid h-72 w-full place-items-center rounded-lg border border-[var(--color-line)] text-xs text-[var(--color-ink-subtle)]"
        style={{
          background:
            "repeating-linear-gradient(45deg, var(--color-bg) 0 8px, var(--color-bg-elevated) 8px 16px)",
        }}
      >
        <span className="rounded border border-[var(--color-line)] bg-white px-3 py-1 font-mono">
          {label}
        </span>
      </div>
      <p className="mt-3 text-sm text-[var(--color-ink-muted)]">{note}</p>
    </article>
  );
}

function DoDontImage({
  kind,
  art,
  label,
  note,
}: {
  kind: "do" | "dont";
  art: React.ReactNode;
  label: string;
  note: string;
}) {
  const isDo = kind === "do";
  return (
    <article
      className={`rounded-lg border ${isDo ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"}`}
    >
      <div className="overflow-hidden rounded-t-lg">
        <div className="h-60 w-full">{art}</div>
      </div>
      <div className="px-5 py-4">
        <p
          className={`inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] uppercase ${isDo ? "text-emerald-700" : "text-rose-700"}`}
        >
          <span
            className={`inline-flex size-4 items-center justify-center rounded-full text-[10px] text-white ${isDo ? "bg-emerald-500" : "bg-rose-500"}`}
          >
            {isDo ? "✓" : "✕"}
          </span>
          {isDo ? "Do" : "Don't"}
        </p>
        <p className="mt-2 text-sm font-medium">{label}</p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{note}</p>
      </div>
    </article>
  );
}

/* ─── 09 Usage rules ───────────────────────────────────────────────── */

function SectionUsage() {
  return (
    <section id="usage" className="mt-[clamp(80px,10vw,160px)] scroll-mt-24">
      <BkSectionHead
        n="09"
        title="Usage rules"
        lede="What you can do with the Klaro brand without asking us, and what requires written permission."
      />
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <UsageCard
          kind="do"
          title="Allowed without asking"
          items={[
            "Linking to klaro.so or any subdomain.",
            "Using the Klaro logo to indicate Klaro integration in your product (with a link back).",
            "Embedding the Stenn-Proof badge on receipts you've actually issued through Klaro.",
            "Writing about Klaro in editorial / news contexts.",
            "Using brand colors and typography as visual reference in case studies.",
          ]}
        />
        <UsageCard
          kind="dont"
          title="Requires brand@klaro.so"
          items={[
            "Using the Stenn-Proof badge on receipts you haven't issued through Klaro.",
            "Modifying the logo — recoloring, redrawing, adding effects, animating beyond the supplied motion files.",
            "Combining the Klaro logo with another mark in a single composite mark.",
            'Using "Klaro" or "Stenn-Proof" as part of a product name you ship.',
            "Selling merchandise that uses the Klaro logo.",
          ]}
        />
      </div>
    </section>
  );
}

function UsageCard({
  kind,
  title,
  items,
}: {
  kind: "do" | "dont";
  title: string;
  items: string[];
}) {
  const isDo = kind === "do";
  return (
    <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
      <p
        className={`inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] uppercase ${isDo ? "text-emerald-700" : "text-rose-700"}`}
      >
        <span
          className={`inline-flex size-4 items-center justify-center rounded-full text-[10px] text-white ${isDo ? "bg-emerald-500" : "bg-rose-500"}`}
        >
          {isDo ? "✓" : "✕"}
        </span>
        {title}
      </p>
      <ul className="mt-5 space-y-4 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className={`mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] text-white ${isDo ? "bg-emerald-500" : "bg-rose-500"}`}
            >
              {isDo ? "✓" : "✕"}
            </span>
            <span
              className={
                isDo
                  ? "text-[var(--color-ink)]"
                  : "text-[var(--color-ink-muted)]"
              }
            >
              {it}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ─── 10 Downloads ─────────────────────────────────────────────────── */

function SectionDownloads() {
  return (
    <section id="downloads" className="mt-[clamp(80px,10vw,160px)] scroll-mt-24">
      <BkSectionHead
        n="10"
        title="Downloads"
        lede="Production-ready files. SVG and PNG for the logo. WOFF2 for fonts (under SIL Open Font License). Figma source for the full kit."
      />
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <DownloadCard
          title="Klaro logo · full pack"
          meta="218 KB · SVG + PNG + ICO"
          body="Symbol, wordmark, lockups, app icon, favicon. Light + dark variants."
        />
        <DownloadCard
          title="Stenn-Proof badge kit"
          meta="84 KB · SVG + React + Web Component"
          body="Three sizes, three states, with embed snippets for every framework."
        />
        <DownloadCard
          title="Typography · WOFF2 bundle"
          meta="412 KB · 3 families"
          body="Inter Tight, Inter, JetBrains Mono. Subsetted to Latin + Devanagari + Cyrillic."
        />
        <DownloadCard
          title="Color tokens"
          meta="6 KB · CSS / JSON / Figma"
          body="Full token tree: primary, neutrals, semantic, dark mode."
        />
        <DownloadCard
          title="Figma source · brand kit"
          meta="14 MB · .fig"
          body="Every page in this document, editable. Auto-layout components included."
        />
        <DownloadCard
          title="Brand guide PDF"
          meta="3.8 MB · 38 pages"
          body="This document, paginated for print and partner distribution."
        />
      </div>
    </section>
  );
}

function DownloadCard({
  title,
  meta,
  body,
}: {
  title: string;
  meta: string;
  body: string;
}) {
  return (
    <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-semibold tracking-tight">
            {title}
          </h3>
          <p className="mt-1 font-mono text-xs text-[var(--color-ink-subtle)]">
            {meta}
          </p>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">{body}</p>
        </div>
        <button
          type="button"
          disabled
          title="Asset bundles ship M12"
          className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-pill border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-medium opacity-60"
        >
          ↓ Download
        </button>
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
            Reach the brand team directly. We respond within 1 business day.
          </p>
        </div>
        <a
          href="mailto:brand@klaro.so"
          className="inline-flex h-11 items-center rounded-pill bg-white px-5 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-gold)]"
        >
          brand@klaro.so
        </a>
      </article>
    </section>
  );
}
