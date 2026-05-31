import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { vestedAmountFor, withdrawableAmountFor } from "@/lib/mockData";
import { listStreams } from "@/lib/repo/retainerStreams";
import { supabaseLive } from "@/lib/env";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";
import {
  createStreamAction,
  withdrawStreamAction,
  cancelStreamAction,
} from "./actions";
import { LiveCounter } from "./LiveCounter";

export default async function RetainerPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const streams = await listStreams(session.vendor.id);
  // The stream RECORD + its accounting persist (supabaseLive). The on-chain
  // RetainerStream.createStream() funding leg needs the client (payer) to sign
  // an approve+fund tx through an accept flow — no payer wallet is present in
  // the single-vendor dashboard — so vesting is a local simulation, labeled.
  const persisted = supabaseLive();
  // Shared server render time, handed to every LiveCounter so SSR and the first
  // client render agree on the per-second vested figure (no hydration mismatch).
  const nowMs = Date.now();

  return (
    <div>
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Retainer streams
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Retainer
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Per-second linear USDC vesting. Client deposits up front; you
              withdraw what&apos;s vested anytime. Client can cancel — your
              vested portion stays yours.
            </p>
          </div>
          <Badge tone={persisted ? "info" : "sim"}>
            {persisted
              ? "Recorded · on-chain funding pending"
              : "Simulated session"}
          </Badge>
        </div>

        <div className="mb-6 rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-ink-muted)]">
          <p className="font-medium text-[var(--color-ink)]">
            Vesting is simulated (on-chain funding partner-pending)
          </p>
          <p className="mt-1">
            Each stream is recorded in Klaro and vests linearly here so you can
            preview the schedule. The on-chain{" "}
            <code className="font-mono">RetainerStream.createStream()</code>{" "}
            deposit requires the <strong>client</strong> to sign an approve+fund
            transaction through an accept flow — no payer wallet is present in
            this dashboard — so no USDC is locked or moved on-chain yet, and a
            withdrawal here updates the record without a token transfer.
          </p>
        </div>

        <h2 className="mb-3 font-display text-xl font-semibold">
          Create stream (request from client)
        </h2>
        <form
          action={createStreamAction}
          className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-line)] bg-white p-6 md:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">Payer label</span>
            <input
              name="payerLabel"
              required
              placeholder="Stellar Labs (client)"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">Payer wallet</span>
            <input
              name="payerAddress"
              required
              placeholder="0x…"
              pattern="^0x[0-9a-fA-F]{40}$"
              className="rounded border border-[var(--color-line)] px-3 py-2 font-mono outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Total amount (USDC)
            </span>
            <input
              name="amount"
              type="number"
              min="1"
              step="1"
              required
              defaultValue="9000"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Duration (days)
            </span>
            <input
              name="days"
              type="number"
              min="1"
              max="365"
              required
              defaultValue="30"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Generate stream request
            </button>
            <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
              Records the stream and starts the local vesting schedule. On-chain
              funding via{" "}
              <code className="font-mono">RetainerStream.createStream()</code>{" "}
              is partner-pending — it needs the client to sign an approve+fund
              tx through an accept flow, so no USDC locks on-chain yet.
            </p>
          </div>
        </form>

        <h2 className="mt-10 mb-3 font-display text-xl font-semibold">
          Active streams
        </h2>
        {streams.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            No streams yet. Create one above.
          </p>
        ) : (
          <ul className="space-y-4">
            {streams.map((s) => {
              const wAvail = withdrawableAmountFor(s);
              const cancelled = Boolean(s.cancelledAt);
              return (
                <li
                  key={s.streamId}
                  className="rounded-lg border border-[var(--color-line)] bg-white p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{s.payerLabel} → you</div>
                      <div className="mt-1 font-mono text-xs text-[var(--color-ink-subtle)]">
                        {shortAddress(s.streamId)} · payer{" "}
                        {shortAddress(s.payerAddress)}
                      </div>
                      <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
                        {formatUSDC(s.depositUsdc)} over{" "}
                        {Math.round((+s.endAt - +s.startAt) / 86_400_000)}d ·
                        started {relativeTime(s.startAt)} ·{" "}
                        {cancelled
                          ? `cancelled ${relativeTime(s.cancelledAt!)}`
                          : `ends ${relativeTime(s.endAt)}`}
                      </p>
                    </div>
                    <Badge tone={cancelled ? "neutral" : "info"}>
                      {cancelled ? "Cancelled" : "Vesting (simulated)"}
                    </Badge>
                  </div>

                  <div className="mt-4">
                    <LiveCounter
                      nowMs={nowMs}
                      s={{
                        depositUsdcStr: s.depositUsdc.toString(),
                        withdrawnUsdcStr: s.withdrawnUsdc.toString(),
                        startMs: +s.startAt,
                        endMs: +s.endAt,
                        cancelledAtMs: s.cancelledAt
                          ? +s.cancelledAt
                          : undefined,
                        cancelledVestedStr: s.cancelledVested?.toString(),
                      }}
                    />
                  </div>

                  {wAvail > 0n && (
                    <form
                      action={async () => {
                        "use server";
                        await withdrawStreamAction(
                          s.streamId,
                          vestedAmountFor(s) - s.withdrawnUsdc,
                        );
                      }}
                      className="mt-4"
                    >
                      <button className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black">
                        Withdraw {formatUSDC(wAvail)}
                      </button>
                    </form>
                  )}
                  {!cancelled && (
                    <form
                      action={async () => {
                        "use server";
                        await cancelStreamAction(s.streamId);
                      }}
                      className="mt-2"
                    >
                      <button className="text-xs text-[var(--color-ink-subtle)] underline hover:text-red-700">
                        Cancel stream (your vested $ stays yours)
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
