import Link from "next/link";
import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { FinalCta } from "@/components/klaro/sections/FinalCta";
import { Badge } from "@/components/ui/Badge";
import { PageHero } from "@/components/ui/PageHero";

export const metadata: Metadata = {
  title: "Trust · Klaro",
  description:
    "Klaro trust center — honest labels on every surface, no PII on-chain, contract source published, and the third-party audit roadmap.",
};

const EXPLANATIONS = [
  {
    id: "honest-labels",
    title: "Honest labels",
    body: "Every Klaro surface tags itself as live testnet, simulated, access-gated, partner-pending, or mainnet-only. We never let UI pretend to be more than it is.",
    tone: "live" as const,
  },
  {
    id: "no-pii-onchain",
    title: "No PII on-chain",
    body: "Release rule: only required hashes and wallet references may reach Arc. Real compliance data handling must be verified before launch.",
    tone: "info" as const,
  },
  {
    id: "open-source",
    title: "Open source contracts",
    body: "Solidity contracts are present in the repository for review. Deployment and independent audit evidence are not yet published.",
    tone: "info" as const,
  },
  {
    id: "deterministic",
    title: "Deterministic finality",
    body: "Target live behavior: verified Arc settlement can anchor a receipt. Current receipt screens clearly identify simulated previews.",
    tone: "info" as const,
  },
  {
    id: "tested",
    title: "Tested like money is real",
    body: "Required before live funds: passing contract tests, security analysis, coverage evidence, and independent review of money-moving paths.",
    tone: "info" as const,
  },
  {
    id: "operator-audit",
    title: "Operator audit log",
    body: "Demo disputes expose recorded decisions. Live on-chain audit stamping must be enabled and verified before funds can move.",
    tone: "info" as const,
  },
  {
    id: "no-bank",
    title: "Klaro is not a bank",
    body: "We don't hold customer fiat. We don't originate loans. We don't issue credit. Klaro is software for stablecoin-native vendor flows.",
    tone: "info" as const,
  },
  {
    id: "principles",
    title: "Engineering principles",
    body: "Every pull request is reviewed against a fixed set of principles — no overclaiming, no PII on chain, money flows modelled as explicit state machines, honest status labelling on every surface.",
    tone: "info" as const,
  },
  {
    id: "audits",
    title: "External audits before mainnet",
    body: "Slither, Mythril, and Echidna pass on the published contract set before any mainnet promotion. Halmos formal verification covers the release, mint, and dispute-decision paths. Audit reports are published.",
    tone: "info" as const,
  },
  {
    id: "bounty",
    title: "Bug bounty (planned)",
    body: "Immunefi program launches at mainnet. Critical USDC-custody vulnerabilities qualify for up to $100k. Coordinated disclosure 90-day clock.",
    tone: "info" as const,
  },
  {
    id: "uptime",
    title: "Uptime + status",
    body: "BetterStack-powered status.klaro.so. 99.9% uptime objective. PagerDuty 24/7 on-call for severity-1 incidents.",
    tone: "info" as const,
  },
];

export default function TrustPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <PageHero
        eyebrow="Trust center"
        title="11 things we promise + prove"
        sub="We earn trust by being explicit about what we are + what we are not. No marketing words — just the 11 invariants Klaro enforces in code, in audits, and in operations."
      />
      <section className="klaro-container w-full pb-10">
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {EXPLANATIONS.map((e) => (
            <li
              key={e.id}
              id={e.id}
              className="rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-semibold">
                  {e.title}
                </h2>
                <Badge tone={e.tone}>
                  {e.tone === "live" ? "Current" : "Required"}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                {e.body}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-10 rounded-[var(--klaro-tile-radius)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6 text-sm">
          <p className="font-medium">More questions?</p>
          <p className="mt-1 text-[var(--color-ink-muted)]">
            Read the full{" "}
            <Link
              href="/legal/disclosures"
              className="text-[var(--color-brand)] hover:underline"
            >
              disclosures
            </Link>
            ,{" "}
            <Link
              href="/legal/privacy"
              className="text-[var(--color-brand)] hover:underline"
            >
              privacy policy
            </Link>
            , and{" "}
            <a
              href="/.well-known/security.txt"
              className="text-[var(--color-brand)] hover:underline"
            >
              security.txt
            </a>
            . Email{" "}
            <a
              href="mailto:prateek@myklaro.app"
              className="text-[var(--color-brand)] hover:underline"
            >
              prateek@myklaro.app
            </a>{" "}
            for anything else.
          </p>
        </div>
      </section>
      <FinalCta />
      <Footer />
    </main>
  );
}
