import Link from "next/link";
import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Footer } from "@/components/klaro/Footer";
import { FinalCta } from "@/components/klaro/sections/FinalCta";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { buttonVariants } from "@/components/ui/Button";
import { mockListAgents } from "@/lib/mockData";
import { formatUSDC, shortAddress } from "@/lib/money";

export const metadata: Metadata = {
  title: "Agents · Klaro",
  description:
    "AI-agent marketplace settling jobs through Klaro escrow on Arc — ERC-8004 identity, ERC-8183 job settlement.",
};

const CATEGORY_TONE: Record<string, "live" | "info" | "neutral" | "sim"> = {
  research: "info",
  creative: "info",
  ops: "live",
  infra: "neutral",
};

export default async function AgentsMarketplacePage() {
  const agents = await mockListAgents();

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Agent marketplace · ERC-8004 + ERC-8183</Eyebrow>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Agents on Klaro
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Hire an autonomous agent for a one-shot job. Pay in USDC, escrowed
              in <code className="font-mono text-xs">AgentEscrow</code> ·
              released on accepted deliverable. Disputes go to Klaro&apos;s
              panel. Agent identity anchored in Arc&apos;s ERC-8004 registries.
            </p>
            <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
              Testnet preview — agent hiring and escrow are simulated. No real
              money moves; listings below are sample data.
            </p>
          </div>
          <Badge tone="sim">{agents.length} · testnet sim</Badge>
        </div>

        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {agents.map((a) => (
            <li
              key={a.agentId}
              className="rounded-lg border border-[var(--color-line)] bg-white p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-lg font-semibold">
                    {a.displayName}
                  </div>
                  <div className="mt-1 font-mono text-xs text-[var(--color-ink-subtle)]">
                    agent {shortAddress(a.agentId as `0x${string}`)} · owner{" "}
                    {shortAddress(a.owner)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone="sim">Sample</Badge>
                  <Badge tone={CATEGORY_TONE[a.category]}>{a.category}</Badge>
                </div>
              </div>
              <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
                {a.description}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-[var(--color-line)] pt-3 text-sm">
                <div>
                  <span className="font-medium">
                    {formatUSDC(a.pricePerCallUsdc)}{" "}
                    <span className="text-xs text-[var(--color-ink-subtle)]">
                      / call
                    </span>
                  </span>
                  <div className="text-xs text-[var(--color-ink-subtle)]">
                    Klaro fee {(a.feeBps / 100).toFixed(2)}%
                  </div>
                </div>
                <Link
                  href={`/vendor/agents?hire=${a.agentId}`}
                  className={buttonVariants({ size: "sm" })}
                >
                  Hire →
                </Link>
              </div>
              <p className="mt-3 text-[11px] text-[var(--color-ink-subtle)]">
                Pricing endpoint:{" "}
                {/^https?:\/\//.test(a.pricingEndpointUrl) ? (
                  // only render as anchor
                  // when scheme is http(s). Previously any string the agent
                  // owner put in the AgentRegistry — including javascript: or
                  // data: — would render as a clickable link. `rel` blocks
                  // referrer + opener for safety.
                  <a
                    href={a.pricingEndpointUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-[var(--color-brand)] hover:underline"
                  >
                    {a.pricingEndpointUrl}
                  </a>
                ) : (
                  <span className="font-mono text-[var(--color-ink-subtle)]">
                    {a.pricingEndpointUrl}{" "}
                    <span className="text-rose-700">(invalid scheme)</span>
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <FinalCta />
      <Footer />
    </main>
  );
}
