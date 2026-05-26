import { notFound } from "next/navigation";
import Link from "next/link";
import { FxNav } from "@/components/klaro/FxNav";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "FX corridor · Klaro" };

interface CorridorSpec {
  slug: string;
  pair: string;
  partnerLabel: string;
  partnerStatus: "simulated" | "partner-pending" | "access-gated";
  spread: string;
  minSize: string;
  maxSize: string;
  description: string;
  notes: string[];
}

const CORRIDORS: Record<string, CorridorSpec> = {
  brla: {
    slug: "brla",
    pair: "USDC ↔ BRLA",
    partnerLabel: "Transfero (BRLA)",
    partnerStatus: "partner-pending",
    spread: "47 bps",
    minSize: "$100",
    maxSize: "$25,000",
    description:
      "USD Coin to Brazilian Real Asset (BRLA), a Real-pegged stablecoin issued by Transfero.",
    notes: [
      "Quote expiry: 60 seconds.",
      "Settlement: 1 Arc tx → 1 Polygon tx via CCTP V2.",
      "Partner-pending: awaiting Transfero sandbox credentials for testnet.",
    ],
  },
  phpc: {
    slug: "phpc",
    pair: "USDC ↔ PHPC",
    partnerLabel: "Coins.ph (PHPC)",
    partnerStatus: "partner-pending",
    spread: "29 bps",
    minSize: "$50",
    maxSize: "$10,000",
    description:
      "USD Coin to Philippine Peso Coin (PHPC), settled by Coins.ph reserves.",
    notes: [
      "Quote expiry: 90 seconds.",
      "Settlement: Arc → PHPC issuer escrow with proof-of-reserve attestation.",
      "Partner-pending: PHPC testnet faucet not yet open.",
    ],
  },
  mxnb: {
    slug: "mxnb",
    pair: "USDC ↔ MXNB",
    partnerLabel: "Bitso (MXNB)",
    partnerStatus: "partner-pending",
    spread: "38 bps",
    minSize: "$100",
    maxSize: "$20,000",
    description:
      "USD Coin to Mexican Peso Bond (MXNB), Bitso's Peso-backed stablecoin.",
    notes: [
      "Quote expiry: 60 seconds.",
      "Settlement: Arc → MXNB via Bitso oracle adapter (StableFXAdapterRegistry).",
      "Partner-pending: MXNB testnet not live yet.",
    ],
  },
  eurc: {
    slug: "eurc",
    pair: "USDC ↔ EURC",
    partnerLabel: "Circle (native)",
    partnerStatus: "simulated",
    spread: "8 bps",
    minSize: "$10",
    maxSize: "$100,000",
    description:
      "USD Coin to Euro Coin (EURC). Native Circle pair, lowest spread on the platform.",
    notes: [
      "Quote expiry: 30 seconds.",
      "Planned settlement: Arc-native swap via Circle App Kit Swap.",
      "Simulated corridor preview; live quote routing is not enabled.",
    ],
  },
  usyc: {
    slug: "usyc",
    pair: "USDC ↔ USYC",
    partnerLabel: "Hashnote (USYC)",
    partnerStatus: "access-gated",
    spread: "T-bill yield",
    minSize: "$1,000",
    maxSize: "$1,000,000",
    description:
      "USD Coin to Yield Coin (USYC), a tokenised T-bill issued by Hashnote. Yield-bearing.",
    notes: [
      "Subscribe / redeem windows: T+1.",
      "Access-gated: institutional KYB required before any subscription.",
      "Settlement: Arc-native via USYC contract on Arc testnet.",
    ],
  },
};

export async function generateStaticParams() {
  return Object.keys(CORRIDORS).map((corridor) => ({ corridor }));
}

export default async function FxCorridorPage({
  params,
}: {
  params: Promise<{ corridor: string }>;
}) {
  const { corridor } = await params;
  const spec = CORRIDORS[corridor];
  if (!spec) notFound();

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <FxNav />
      <section className="mx-auto w-full max-w-[1000px] px-6 py-10">
        <Link
          href="/fx"
          className="text-xs text-[var(--color-brand)] hover:underline"
        >
          ← All corridors
        </Link>

        <header className="mt-4 mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Stablecoin FX · {spec.partnerLabel}
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
              {spec.pair}
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              {spec.description}
            </p>
          </div>
          <Badge
            tone={
              spec.partnerStatus === "simulated"
                ? "sim"
                : spec.partnerStatus === "access-gated"
                  ? "info"
                  : "sim"
            }
          >
            {spec.partnerStatus}
          </Badge>
        </header>

        <div className="mb-8 grid gap-3 md:grid-cols-3">
          <Tile label="Spread" value={spec.spread} />
          <Tile label="Min size" value={spec.minSize} />
          <Tile label="Max size" value={spec.maxSize} />
        </div>

        <h2 className="mb-3 font-display text-xl font-semibold">Notes</h2>
        <ul className="mb-10 divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
          {spec.notes.map((n) => (
            <li
              key={n}
              className="px-6 py-3 text-sm text-[var(--color-ink-muted)]"
            >
              · {n}
            </li>
          ))}
        </ul>

        <div className="rounded-lg border border-[var(--color-line)] bg-white p-6">
          <h2 className="font-display text-base font-semibold">
            Request a demo quote
          </h2>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            Use the FX dashboard to preview this corridor. Live binding quotes
            and on-chain partner verification are not enabled in the current
            testnet demo.
          </p>
          <Link
            href="/fx"
            className="mt-4 inline-block rounded-full bg-[var(--color-ink)] px-5 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Open FX dashboard →
          </Link>
        </div>
      </section>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-white p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
        {label}
      </div>
      <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}
