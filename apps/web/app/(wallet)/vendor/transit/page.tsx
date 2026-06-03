import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { getCurrentSession } from "@/lib/auth";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";

/**
 * Cross-chain transit dashboard. v2 §13.
 * Lists every USDC in-flight via Gateway + CCTP V2 + App Kit Bridge,
 * with source chain, destination chain, attestation state, and ETA.
 * Live data lands when the daemon's CCTP listener + Gateway poller are
 * deployed (M11). For now: seeded mock pulls so reviewers see the layout.
 */

interface Transit {
  id: string;
  route: "gateway-batched" | "cctp-v2" | "appkit-bridge";
  amount: bigint;
  srcChain: string;
  dstChain: string;
  txHash: string;
  state: "burning" | "attesting" | "minting" | "settled";
  startedAt: Date;
}

const SAMPLE: Transit[] = [
  {
    id: "tr_001",
    route: "gateway-batched",
    amount: 1_250_000_000n,
    srcChain: "Ethereum",
    dstChain: "Arc",
    txHash:
      "0xc4f25e1b8d8c5e9f12a47ba3b4d8c5e9f12a47ba3b4d8c5e9f12a47ba3b4d8c5",
    state: "minting",
    startedAt: new Date(Date.now() - 1000 * 18),
  },
  {
    id: "tr_002",
    route: "cctp-v2",
    amount: 5_000_000n,
    srcChain: "Base",
    dstChain: "Arc",
    txHash:
      "0x71f3aa8d5c9e7b2f8a47ba3b4d8c5e9f12a47ba3b4d8c5e9f12a47ba3b4d8c5e",
    state: "attesting",
    startedAt: new Date(Date.now() - 1000 * 9),
  },
  {
    id: "tr_003",
    route: "appkit-bridge",
    amount: 250_000_000n,
    srcChain: "Polygon",
    dstChain: "Arc",
    txHash:
      "0x8e2af04711bd9f8a47ba3b4d8c5e9f12a47ba3b4d8c5e9f12a47ba3b4d8c5e9f",
    state: "settled",
    startedAt: new Date(Date.now() - 1000 * 240),
  },
];

const STATE_TONE: Record<Transit["state"], "live" | "info"> = {
  burning: "info",
  attesting: "info",
  minting: "info",
  settled: "live",
};

export default async function TransitPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  return (
    <div>
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Cross-chain transit</Eyebrow>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              In-flight to Arc
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              USDC moving from other chains to Arc via Gateway (sub-second
              batched), CCTP V2 (8-20s burn/mint), or App Kit Bridge. Sub-second
              deterministic finality on Arc means ETA = source-chain confirm +
              attestation, not Arc-side block waits.
            </p>
          </div>
          <Badge tone="sim">Simulated · integration pending</Badge>
        </div>

        <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
          {SAMPLE.map((t) => (
            <li
              key={t.id}
              className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center"
            >
              <div>
                <div className="font-medium">{formatUSDC(t.amount)} USDC</div>
                <div className="font-mono text-xs text-[var(--color-ink-subtle)]">
                  {shortAddress(t.txHash as `0x${string}`)}
                </div>
              </div>
              <div className="text-sm">
                {t.srcChain} → {t.dstChain}
              </div>
              <div className="text-xs text-[var(--color-ink-subtle)]">
                {t.route} · started {relativeTime(t.startedAt)}
              </div>
              <Badge tone={STATE_TONE[t.state]} className="w-fit capitalize">
                {t.state}
              </Badge>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-lg border border-[var(--color-line)] bg-white p-5 text-sm text-[var(--color-ink-muted)]">
          <p className="font-medium text-[var(--color-ink)]">
            How routing works
          </p>
          <p className="mt-2">
            Klaro picks the route per corridor: Gateway-batched when source is
            Gateway-enabled and amount {">"} $500 (lowest fees), CCTP V2
            fast-mode for everything else, App Kit Bridge as fallback for chains
            not in CCTP V2 yet.{" "}
            <code className="font-mono">MultiChainRouter.route()</code> does the
            selection.
          </p>
        </div>
      </section>
    </div>
  );
}
