import type { Metadata } from "next";
import { Nav } from "@/components/klaro/Nav";
import { Badge } from "@/components/ui/Badge";
import { mockListAgents } from "@/lib/mockData";
import { X402DemoClient } from "./X402DemoClient";

export const metadata: Metadata = {
  title: "x402 demo · Klaro",
  description:
    "Pay-per-call HTTP demo: an agent settles a 402 Payment Required response with USDC and continues the request.",
};

export default async function X402DemoPage() {
  const agents = await mockListAgents();

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Nav />
      <section className="mx-auto w-full max-w-[1000px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              x402 nanopayments · Circle Gateway
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              x402 demo
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Hit a Klaro-hosted agent endpoint. The server returns{" "}
              <code className="font-mono">402 Payment Required</code> with both
              standard on-chain + Gateway-batched payment options. Sign an
              EIP-3009 authorization (zero gas) + retry to read the response.
            </p>
          </div>
          <Badge tone="info">{agents.length} agent endpoints</Badge>
        </div>

        <div className="mb-6 rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-ink-muted)]">
          <p className="font-medium text-[var(--color-ink)]">Live wiring</p>
          <p className="mt-1">
            Live mode (<code className="font-mono">X402_ENABLED=1</code> +
            Gateway-funded balance): real{" "}
            <code className="font-mono">BatchFacilitatorClient</code> from{" "}
            <code className="font-mono">@circle-fin/x402-batching/server</code>{" "}
            verifies the signature against the{" "}
            <code className="font-mono">GatewayWalletBatched</code> EIP-712
            domain. Mock mode: accepts any base64 payload, surfaces the
            would-settle amount.
          </p>
        </div>

        <p className="mb-4 rounded border border-[var(--color-line)] bg-[var(--color-bg-warm)] px-3 py-2 text-xs text-[var(--color-ink-muted)]">
          <strong className="font-medium text-[var(--color-ink)]">
            Testnet only.
          </strong>{" "}
          Prices below are in testnet USDC and no real money is charged.
          Settlement is simulated unless{" "}
          <code className="font-mono">X402_ENABLED=1</code> with a Gateway-funded
          balance.
        </p>

        <X402DemoClient
          agents={agents.map((a) => ({
            agentId: a.agentId,
            displayName: a.displayName,
            pricePerCallUsdc: a.pricePerCallUsdc.toString(),
          }))}
        />
      </section>
    </main>
  );
}
