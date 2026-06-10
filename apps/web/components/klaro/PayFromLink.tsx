"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { PayWithUSDC } from "./PayWithUSDC";
import { getOrCreateInvoiceForLink } from "@/app/(wallet)/pay/[slug]/actions";
import { onchainLive } from "@/lib/env";
import type { Hex } from "@/lib/types";
import type { LinkInvoiceParams } from "@/lib/repo/links";

// Placeholder buyer for simulator mode (no real wallet required for the demo).
const DEMO_BUYER = "0x000000000000000000000000000000000000dE01" as Hex;

/**
 * PayFromLink — buyer checkout for /pay/[slug]. A link has no invoice until
 * someone pays, so this:
 *   1. connects the buyer's wallet (live mode),
 *   2. "Continue" → server publishes the backing invoice on-chain via the
 *      relayer (createInvoiceFor with the vendor's stored authorization),
 *   3. hands the exact on-chain params to PayWithUSDC, which runs the normal
 *      sign → approve → acceptAndPay flow.
 * In simulator mode it creates a demo invoice and PayWithUSDC's simulator pays.
 */
export function PayFromLink({ slug }: { slug: string }) {
  const isLive = onchainLive();
  const { address, isConnected } = useAccount();
  const [phase, setPhase] = useState<"idle" | "preparing" | "ready" | "error">("idle");
  const [params, setParams] = useState<LinkInvoiceParams | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function prepare() {
    setError(null);
    const buyer = isLive ? address : (address ?? DEMO_BUYER);
    if (isLive && !buyer) {
      setError("Connect your wallet first.");
      return;
    }
    setPhase("preparing");
    try {
      const p = await getOrCreateInvoiceForLink(slug, buyer as Hex);
      setParams(p);
      setPhase("ready");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? humanize(e.message) : "Couldn't prepare the payment.");
    }
  }

  if (phase === "ready" && params) {
    return (
      <PayWithUSDC
        invoiceId={params.invoiceId}
        vendor={params.vendor}
        token={params.token}
        amount={BigInt(params.amount)}
        dueAt={new Date(params.dueAtUnix * 1000)}
        metadataHash={params.metadataHash}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {isLive ? (
          <ConnectWalletButton />
        ) : (
          <span className="text-xs text-[var(--color-ink-muted)]">Demo checkout</span>
        )}
        <Badge tone={isLive ? "live" : "sim"}>
          {isLive ? "Live on Arc testnet" : "Simulated · contracts not deployed"}
        </Badge>
      </div>

      <Button
        size="lg"
        className="w-full"
        onClick={() => void prepare()}
        disabled={phase === "preparing" || (isLive && !isConnected)}
      >
        {phase === "preparing"
          ? "Preparing payment…"
          : isLive && !isConnected
            ? "Connect wallet to pay"
            : phase === "error"
              ? "Try again"
              : "Continue to payment"}
      </Button>

      {error ? (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </div>
      ) : null}

      <p className="text-[11px] leading-relaxed text-[var(--color-ink-subtle)]">
        {isLive
          ? "We'll publish your invoice on Arc, then you'll sign an EIP-712 acceptance and pay in USDC. Counterparty screening runs before settlement releases funds."
          : "Simulator mode: this creates a demo payment + receipt preview only. No wallet signature, onchain call, or fund movement occurs."}
      </p>
    </div>
  );
}

/** Plain-language messages for the link-specific failure codes. */
function humanize(code: string): string {
  const map: Record<string, string> = {
    link_deactivated: "This link has been turned off by the seller.",
    link_expired: "This link has expired.",
    vendor_wallet_unprovisioned: "The seller hasn't finished wallet setup yet.",
    link_missing_onchain_authorization:
      "This link isn't authorized for on-chain payment yet. Ask the seller to re-create it.",
    validation_invalid_buyer_wallet: "Your wallet address looks invalid. Reconnect and try again.",
  };
  return map[code] ?? "Couldn't prepare the payment. Please try again.";
}
