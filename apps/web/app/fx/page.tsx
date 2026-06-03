import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FxNav } from "@/components/klaro/FxNav";
import { Footer } from "@/components/klaro/Footer";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { buttonVariants } from "@/components/ui/Button";
import { getCurrentSession } from "@/lib/auth";
import { type FxStatus } from "@/lib/mockData";
import { listFxQuotes } from "@/lib/repo/fxQuotes";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";
import { quoteAction, settleQuoteAction } from "./actions";

export const metadata: Metadata = {
  title: "FX desk · Klaro",
  description:
    "USDC ⇄ local-currency quotes routed to vetted liquidity partners with on-chain quote freeze.",
};

const STATUS_TONE: Record<
  FxStatus,
  "live" | "info" | "neutral" | "sim" | "verified"
> = {
  simulated: "sim",
  "live testnet": "live",
  "access pending": "info",
  "quote expired": "neutral",
  "settlement complete": "verified",
};

const STATUS_LABEL: Record<FxStatus, string> = {
  simulated: "Simulated",
  "live testnet": "Live testnet",
  "access pending": "Access pending",
  "quote expired": "Quote expired",
  "settlement complete": "Demo completed",
};

function effectiveStatus(status: FxStatus, expiresAt: Date): FxStatus {
  if (status === "settlement complete") return status;
  if (expiresAt < new Date()) return "quote expired";
  return status;
}

export default async function FxPage() {
  // QA-074: was `requireVendor()`, which throws on no session → a top-level
  // page (no 401 mapping) rendered a hard HTTP 500 for every logged-out
  // visitor. Gate gracefully to sign-in instead.
  const session = await getCurrentSession();
  if (!session) redirect("/signin?next=/fx");
  const { vendor } = session;
  const quotes = await listFxQuotes(vendor.id);
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <FxNav />
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Stablecoin FX</Eyebrow>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              USDC ↔ EURC · USYC
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Klaro routes FX through Circle StableFX (FxEscrow at{" "}
              <code className="font-mono text-xs">0x867650F5…a9f8</code>) when
              access is granted. Until then, deterministic mock rates show the
              full flow.
            </p>
            <p className="mt-2 max-w-2xl text-xs text-[var(--color-ink-subtle)]">
              <strong>Gotcha:</strong> StableFX requires the USDC allowance to
              be granted to <code className="font-mono">PERMIT2</code> (
              <code className="font-mono text-[10px]">
                0x000000000022D473…BA3
              </code>
              ) — not directly to FxEscrow. FxEscrow pulls funds via
              Permit2&apos;s signature-transfer.
            </p>
          </div>
          <Badge tone="info">FxEscrow + Permit2</Badge>
        </div>

        <h2 className="mb-3 font-display text-xl font-semibold">New quote</h2>
        <form
          action={quoteAction}
          className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-line)] bg-white p-6 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">From</span>
            <select
              name="src"
              defaultValue="USDC"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            >
              <option>USDC</option>
              <option>EURC</option>
              <option>USYC</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">To</span>
            <select
              name="dst"
              defaultValue="EURC"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            >
              <option>EURC</option>
              <option>USDC</option>
              <option>USYC</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">Amount (src)</span>
            <input
              name="amount"
              type="number"
              min="1"
              step="1"
              defaultValue="1000"
              required
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <button type="submit" className={buttonVariants({ size: "md" })}>
            Quote
          </button>
        </form>

        <div className="mb-6 mt-3 rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-ink-muted)]">
          <p className="font-medium text-[var(--color-ink)]">
            5 honest-label tones
          </p>
          <p className="mt-1">
            <code className="font-mono">simulated</code> ·{" "}
            <code className="font-mono">live testnet</code> ·{" "}
            <code className="font-mono">access pending</code> ·{" "}
            <code className="font-mono">quote expired</code> ·{" "}
            <code className="font-mono">demo completed</code> — every quote
            below reflects its real state.
          </p>
        </div>

        <h2 className="mb-3 font-display text-xl font-semibold">
          Recent quotes
        </h2>
        <ul className="space-y-3">
          {quotes.map((q) => {
            const status = effectiveStatus(q.status, q.expiresAt);
            return (
              <li
                key={q.id}
                className="rounded-lg border border-[var(--color-line)] bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {q.srcToken} → {q.dstToken} ·{" "}
                      <span className="font-mono">
                        {(Number(q.srcAmountUsdc) / 1_000_000).toLocaleString(
                          "en-US",
                          { minimumFractionDigits: 2 },
                        )}
                      </span>{" "}
                      →{" "}
                      <span className="font-mono">
                        {(Number(q.dstAmount) / 1_000_000).toLocaleString(
                          "en-US",
                          { minimumFractionDigits: 2 },
                        )}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--color-ink-subtle)]">
                      rate {q.rate.toFixed(4)} · quote{" "}
                      {shortAddress(q.quoteHash)} ·{" "}
                      {status === "settlement complete"
                        ? `demo completed ${relativeTime(q.settledAt ?? q.createdAt)}`
                        : status === "quote expired"
                          ? `expired ${relativeTime(q.expiresAt)}`
                          : `expires ${relativeTime(q.expiresAt)}`}
                    </div>
                  </div>
                  <Badge tone={STATUS_TONE[status]}>
                    {STATUS_LABEL[status]}
                  </Badge>
                </div>

                {status !== "settlement complete" &&
                  status !== "quote expired" && (
                    <form
                      action={async () => {
                        "use server";
                        await settleQuoteAction(q.id);
                      }}
                      className="mt-3"
                    >
                      <button className={buttonVariants({ size: "sm" })}>
                        Execute swap →
                      </button>
                      <span className="ml-2 text-[10px] text-[var(--color-ink-subtle)]">
                        Demo only. A future live mode would call{" "}
                        <code className="font-mono">
                          StableFXAdapterRegistry.swap()
                        </code>
                      </span>
                    </form>
                  )}
              </li>
            );
          })}
        </ul>
      </section>
      <Footer />
    </main>
  );
}
