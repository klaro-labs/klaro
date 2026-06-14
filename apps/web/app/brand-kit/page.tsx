import Link from "next/link";
import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { BrandMark } from "@/components/klaro/BrandMark";

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
      <BrandContents />
      <BrandSection n="01" title="Identity">
        <IdentitySection />
      </BrandSection>
      <BrandSection n="02" title="Logo">
        <LogoTab />
      </BrandSection>
      <BrandSection n="03" title="Color">
        <ColorTab />
      </BrandSection>
      <BrandSection n="04" title="Typography">
        <TypeTab />
      </BrandSection>
      <BrandSection n="05" title="Voice & tone">
        <VoiceTab />
      </BrandSection>
      <BrandSection n="06" title="Components">
        <ComponentsSection />
      </BrandSection>
      <BrandSection n="07" title="The Klaro Proof badge">
        <StennProofSection />
      </BrandSection>
      <BrandSection n="08" title="Imagery">
        <ImagerySection />
      </BrandSection>
      <BrandSection n="09" title="Usage rules">
        <UsageRulesSection />
      </BrandSection>
      <BrandSection n="10" title="Downloads">
        <DownloadsTab />
      </BrandSection>
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
        Brand kit · v1.0
      </p>
      <h1 className="mt-6 max-w-[560px] font-display text-[clamp(2.5rem,5.5vw,4.75rem)] font-semibold leading-[1.05] tracking-[-0.045em]">
        How <span className="text-[var(--color-brand)]">Klaro</span> looks, sounds, and shows up.
      </h1>
      <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--color-ink-muted)] md:text-lg">
        The Klaro brand exists to make stablecoin payments feel trustworthy, clear, and human. Use this kit for product surfaces, marketing, partner integrations, and press.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href="#downloads"
          className="inline-flex h-12 items-center rounded-pill bg-[var(--color-ink)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-ink-2)]"
        >
          Download assets
        </a>
        <a
          href="#identity"
          className="inline-flex h-12 items-center rounded-pill border border-[var(--color-line-2)] px-5 text-sm font-semibold text-[var(--color-ink)] hover:border-[var(--color-ink)]"
        >
          Read the guide
        </a>
      </div>

      {/* Meta band */}
      <dl className="mt-12 grid gap-8 border-t border-[var(--color-line)] pt-6 text-sm sm:grid-cols-2 md:grid-cols-4">
        <BkMeta term="Klaro Labs" def="Brand owner" />
        <BkMeta term="2026" def="Established" />
        <BkMeta term="prateek@myklaro.app" def="Questions" link="mailto:prateek@myklaro.app" />
        <BkMeta term="CC-BY 4.0" def="Brand guide license" />
      </dl>
    </section>
  );
}

function BrandContents() {
  const rows = [
    "Identity",
    "Logo",
    "Color",
    "Typography",
    "Voice & tone",
    "Components",
    "Klaro Proof badge",
    "Imagery",
    "Usage rules",
    "Downloads",
  ];
  return (
    <section className="mx-auto w-full max-w-[1216px] px-6 py-12">
      <div className="grid gap-8 rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-6 md:grid-cols-[1fr_220px] md:p-8">
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
            Contents
          </p>
          <div className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {rows.map((row, i) => (
              <a
                key={row}
                href={`#${slug(row)}`}
                className="group flex items-center justify-between border-b border-[var(--color-line)] pb-3 text-sm"
              >
                <span className="font-mono text-[11px] text-[var(--color-ink-subtle)]">
                  {String(i + 1).padStart(2, "0")} · {row}
                </span>
                <span className="text-[var(--color-ink-subtle)] transition-transform group-hover:translate-x-1">
                  →
                </span>
              </a>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between border-t border-[var(--color-line)] pt-6 md:border-l md:border-t-0 md:pl-8 md:pt-0">
          <p className="font-mono text-[11px] text-[var(--color-ink-subtle)]">
            v1.0 · 2026-06-14
          </p>
          <p className="mt-10 font-display text-2xl font-semibold tracking-tight">
            Brand guide
          </p>
        </div>
      </div>
    </section>
  );
}

function BrandSection({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={slug(title)}
      className="mx-auto grid w-full max-w-[1216px] gap-8 border-t border-[var(--color-line)] px-6 py-16 md:grid-cols-[150px_1fr] md:py-24"
    >
      <header>
        <p className="font-mono text-sm text-[var(--color-brand)]">{n}</p>
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">
          {title}
        </h2>
      </header>
      <div>{children}</div>
    </section>
  );
}

function slug(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function IdentitySection() {
  return (
    <div>
      <p className="max-w-3xl text-xl leading-relaxed text-[var(--color-ink-muted)]">
        Klaro is the Arc-native payment OS for emerging-market vendors. Our brand promises clarity — about money, about counterparties, about what happens after you press send.
      </p>
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
    </div>
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
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {[16, 32, 64].map((size) => (
          <div key={size} className="grid place-items-center rounded-lg border border-[var(--color-line)] bg-white p-8">
            <BrandMark size={size} />
            <p className="mt-4 font-mono text-xs text-[var(--color-ink-subtle)]">
              {size}px
            </p>
          </div>
        ))}
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
        lede="Klaro blue carries the brand. Klaro Proof gold is reserved exclusively for verified receipts. Everything else is warm graphite or paper."
      />

      <div className="space-y-5">
        <ColorCard
          bg="#1B6BFF"
          fg="#ffffff"
          eyebrow="Primary · Brand"
          name="Klaro blue"
          hex="#1B6BFF"
          rgb="27 107 255"
          oklch="0.58 0.21 256"
          note="Calls to action, links, accents, hero highlights. The brand's load-bearing colour."
        />
        <ColorCard
          bg="#F5B100"
          fg="#0A0A0A"
          eyebrow="Accent · Reserved"
          name="Klaro Proof gold"
          hex="#F5B100"
          rgb="245 177 0"
          oklch="0.79 0.16 76"
          note="ONLY on verified Klaro Proof receipts and the receipt badge. Never on buttons, links, or marketing chrome."
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
        <div className="grid gap-5 md:grid-cols-2">
          <DoDontBlock
            kind="dont"
            lines={["No gradients. No neon. No purple. No crypto-bro palettes."]}
          />
          <DoDontBlock
            kind="do"
            lines={["Solid color blocks. Tonal neutrals. Generous whitespace."]}
          />
        </div>
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
          sample="0x7a3c…b21f · 4,200.00 USDC · myklaro.app/receipt"
          sampleClass="font-mono text-lg md:text-xl"
        />
      </div>
      <div className="mt-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-6">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
          Type scale
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {[
            ["Display XL", "112 / 0.98", "Hero on landing"],
            ["Display L", "64 / 1.02", "Section titles"],
            ["Display M", "44 / 1.05", "Card headers"],
            ["Display S", "32 / 1.1", "Sub-titles"],
            ["Body L", "20 / 1.5", "Lead paragraphs"],
            ["Body", "16 / 1.55", "Default text"],
            ["Body S", "14 / 1.55", "Secondary text"],
            ["Mono", "13 / 1.55", "Receipts, code"],
          ].map(([name, scale, use]) => (
            <div key={name} className="flex items-baseline justify-between border-b border-[var(--color-line)] py-3">
              <span className="font-display text-lg font-semibold">{name}</span>
              <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
                {scale} · {use}
              </span>
            </div>
          ))}
        </div>
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
          body={`"Klaro Proof receipt" beats "best-in-class compliance solution." Show the work; don't boast about it.`}
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
            "Linking to www.myklaro.app or any subdomain.",
            "Using the Klaro logo to indicate Klaro integration in your product (with a link back).",
            "Embedding the Klaro Proof badge on receipts you've actually issued through Klaro.",
            "Writing about Klaro in editorial / news contexts.",
            "Using brand colours and typography as visual reference in case studies.",
          ]}
        />
        <UsageCard
          kind="dont"
          title="Requires prateek@myklaro.app"
          items={[
            "Using the Klaro Proof badge on receipts you haven't issued through Klaro.",
            "Modifying the logo — recolouring, redrawing, adding effects, animating beyond the supplied motion files.",
            "Combining the Klaro logo with another mark in a single composite mark.",
            'Using "Klaro" or "Klaro Proof" as part of a product name you ship.',
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

function ComponentsSection() {
  return (
    <div>
      <TabHead
        title="Small set of building blocks."
        lede="Every Klaro surface is composed from buttons, chips, cards, mono labels, and stroke-based icons."
      />
      <div className="grid gap-5 md:grid-cols-2">
        <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
            Buttons
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="h-12 rounded-pill bg-[var(--color-ink)] px-5 text-sm font-semibold text-white">
              Primary action
            </button>
            <button className="h-12 rounded-pill border border-[var(--color-line-2)] px-5 text-sm font-semibold">
              Secondary
            </button>
            <button className="h-12 px-2 text-sm font-semibold text-[var(--color-brand)]">
              Tertiary link →
            </button>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Primary uses ink fill by default; hero CTAs use 48px height and pill radius.
          </p>
        </article>
        <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
            Chips & tags
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["Neutral", "Active state", "Verified", "Live", "On Arc"].map((chip, i) => (
              <span
                key={chip}
                className={`rounded-pill border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] ${
                  i === 2
                    ? "border-[var(--color-gold)]/30 bg-[var(--color-klaro-gold-soft)]"
                    : i === 1
                      ? "border-[var(--color-brand)]/20 bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                      : "border-[var(--color-line)] bg-white"
                }`}
              >
                {chip}
              </span>
            ))}
          </div>
        </article>
      </div>
      <article className="mt-5 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-warm)] p-6">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
          Iconography
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Stroke-based. 1.6px weight. Rounded line-caps. Geometric. Never filled unless the symbol is a status dot.
        </p>
      </article>
    </div>
  );
}

function StennProofSection() {
  return (
    <div>
      <TabHead
        title="Our signature trust object."
        lede="A small gold-and-ink badge that anchors trust. Every verified receipt carries it. Nothing else may."
      />
      <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
        <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-klaro-gold-soft)] p-8">
          <StennBadge size="large" />
          <p className="mt-6 font-mono text-xs text-[var(--color-ink-subtle)]">
            The badge · at 2.2x for inspection
          </p>
        </article>
        <article className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-8">
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-brand)]">
            Embed snippet
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-[var(--color-ink)] p-5 font-mono text-xs leading-relaxed text-white">
{`import { KlaroReceiptBadge } from "@klaro/receipt-badge";

<KlaroReceiptBadge
  hash="0x9f8a3c5b…"
  size="default"
/>`}
          </pre>
        </article>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <DoDontBlock kind="do" lines={["Only on receipts that have actually been screened, settled, and anchored on-chain."]} />
        <DoDontBlock kind="dont" lines={["Never on marketing pages, ads, or unverified content. The badge means something — protect it."]} />
      </div>
    </div>
  );
}

function StennBadge({ size = "default" }: { size?: "default" | "large" }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-pill border border-[var(--color-gold)]/30 bg-white font-mono font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)] ${
        size === "large" ? "px-5 py-3 text-sm" : "px-3 py-2 text-[11px]"
      }`}
    >
      <span className="grid size-5 place-items-center rounded-full bg-[var(--color-gold)] text-[var(--color-ink)]">
        ✓
      </span>
      Klaro Proof · Verified
    </span>
  );
}

function ImagerySection() {
  const cards = [
    ["Vendor portraits", "Real founders in real workspaces. Natural light. Eye contact. No staged laptops."],
    ["Product surfaces", "Real Klaro UI in real contexts: phone in hand, browser in dim cafe, ledger on screen."],
    ["Place + texture", "Documentary detail shots: shopfronts, ledgers, ports, hands. Anchors corridor stories."],
  ];
  return (
    <div>
      <TabHead
        title="Real vendors, real workplaces."
        lede="No stock photography. No glossy money imagery. No abstract crypto art."
      />
      <div className="grid gap-5 md:grid-cols-3">
        {cards.map(([title, body]) => (
          <article key={title} className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)]">
            <div className="h-44 bg-[linear-gradient(135deg,#0A0A0A,#2E2E2E_55%,#FAFAF7)]" />
            <div className="p-6">
              <h3 className="font-display text-xl font-semibold tracking-tight">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">{body}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <DoDontBlock kind="dont" lines={["No abstract money imagery. No glowing coins, no dollar signs, no neon networks."]} />
        <DoDontBlock kind="do" lines={["Documentary photography. Restrained editing. Black-and-white when in doubt."]} />
      </div>
    </div>
  );
}

function UsageRulesSection() {
  return (
    <div>
      <TabHead
        title="What you can do with the Klaro brand."
        lede="Use these rules for integrations, editorial, partner launches, and public-facing screenshots."
      />
      <div className="grid gap-5 md:grid-cols-2">
        <UsageCard
          kind="do"
          title="Allowed without asking"
          items={[
            "Linking to www.myklaro.app or any subdomain.",
            "Using the Klaro logo to indicate Klaro integration in your product with a link back.",
            "Embedding the Klaro Proof badge on receipts you've actually issued through Klaro.",
            "Writing about Klaro in editorial or news contexts.",
            "Using brand colors and typography as visual reference in case studies.",
          ]}
        />
        <UsageCard
          kind="dont"
          title="Requires prateek@myklaro.app"
          items={[
            "Using the Klaro Proof badge on receipts you haven't issued through Klaro.",
            "Modifying the logo: recoloring, redrawing, adding effects, or custom animation.",
            "Combining the Klaro logo with another mark in a single composite mark.",
            'Using "Klaro" or "Klaro Proof" as part of a product name you ship.',
            "Selling merchandise that uses the Klaro logo.",
          ]}
        />
      </div>
    </div>
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
        lede="What we have today. Logo, wordmark, and colour tokens are ready for the testnet site. The full Figma source and font WOFF2 bundle are in progress; email prateek@myklaro.app to get them early."
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
          href="mailto:prateek@myklaro.app?subject=Brand%20kit%20request"
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
          href="mailto:prateek@myklaro.app"
          className="inline-flex h-11 items-center rounded-pill bg-white px-5 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-gold)]"
        >
          prateek@myklaro.app
        </Link>
      </article>
    </section>
  );
}
