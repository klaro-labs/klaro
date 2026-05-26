"use client";

import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useChainId,
} from "wagmi";
import { arcTestnet } from "wagmi/chains";
import { Button } from "@/components/ui/Button";
import { shortAddress } from "@/lib/money";

/**
 * ConnectWalletButton — single button that handles the full lifecycle:
 * - not connected → "Connect wallet" CTA
 * - connected, wrong chain → "Switch to Arc Testnet"
 * - connected, right chain → shows address + disconnect
 * Pattern matches Stripe/Wise pre-auth bars — one slot, clear status.
 */
export function ConnectWalletButton() {
  const { isConnected, address } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const chainId = useChainId();

  if (!isConnected) {
    const c = connectors[0];
    return (
      <Button
        size="md"
        disabled={!c || connecting}
        onClick={() => c && connect({ connector: c })}
      >
        {connecting ? "Opening wallet…" : "Connect wallet"}
      </Button>
    );
  }

  if (chainId !== arcTestnet.id) {
    return (
      <Button
        size="md"
        disabled={switching}
        onClick={() => switchChain({ chainId: arcTestnet.id })}
      >
        {switching ? "Switching…" : "Switch to Arc Testnet"}
      </Button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-pill bg-[var(--color-bg-elevated)] px-4 py-2 text-sm ring-1 ring-inset ring-[var(--color-line)]">
      <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
      <span className="font-mono">{shortAddress(address!)}</span>
      <button
        type="button"
        onClick={() => disconnect()}
        className="ml-1 text-xs text-[var(--color-ink-subtle)] hover:text-[var(--color-ink)]"
      >
        disconnect
      </button>
    </div>
  );
}
