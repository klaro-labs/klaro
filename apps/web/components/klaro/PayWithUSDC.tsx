"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSignTypedData,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { arcTestnet } from "wagmi/chains";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CheckIcon } from "@/components/ui/CheckIcon";
import { shortAddress } from "@/lib/money";
import { ConnectWalletButton } from "./ConnectWalletButton";
import {
  INVOICE_ESCROW_ABI,
  ERC20_ABI,
  ACCEPTANCE_EIP712_TYPES,
} from "@/lib/abi";
import { INVOICE_ESCROW_ADDRESS } from "@/lib/env";
import { simulatePaymentAction } from "@/app/(wallet)/i/[id]/actions";
import type { Hex } from "@/lib/types";

/**
 * PayWithUSDC — buyer-side checkout component for /i/[id].
 * Handles the FULL v2 §12 customer-recovery state machine in one panel:
 * 1. NO WALLET → connect-wallet CTA
 * 2. WRONG CHAIN → switch-to-arc CTA
 * 3. INSUFFICIENT USDC → "fund wallet via faucet" link
 * 4. ALREADY PAID → success message + receipt link
 * 5. AWAITING SIGNATURE → spinner during EIP-712 sign
 * 6. SIGNATURE REJECTED → retry button
 * 7. AWAITING APPROVAL → spinner
 * 8. AWAITING SETTLE → spinner with tx hash link
 * ERROR → reason + retry
 * **Adapter mode:** if `NEXT_PUBLIC_INVOICE_ESCROW_ADDRESS` is unset,
 * we run the *simulator* — buyer "pays" via a server action that flips
 * the mock invoice to PAID. UI surfaces a clear "Simulated · contracts
 * not deployed" badge. Switch to live mode by deploying contracts +
 * setting the env var; nothing else changes.
 */

type Phase = "idle" | "signing" | "approving" | "sending" | "settled" | "error";

/**
 * Map raw wallet/RPC error strings to calm, buyer-facing copy. The raw message
 * is scary developer output ("execution reverted", JSON-RPC codes, nonce/gas
 * internals) and must never reach the checkout alert — it stays in the console
 * for support. Mirrors PayFromLink.humanize.
 */
function humanizePaymentError(msg: string): string {
  const m = msg.toLowerCase();
  if (/rejected|denied|user/.test(m))
    return "You cancelled the request. Try again when ready.";
  if (/insufficient funds|exceeds balance|insufficient/.test(m))
    return "Your wallet doesn't have enough to cover the payment and gas.";
  if (/nonce|replacement|already known/.test(m))
    return "A previous transaction is still pending. Wait for it to clear, then retry.";
  if (/timeout|timed out|network|fetch|connection/.test(m))
    return "Network hiccup reaching the chain. Check your connection and retry.";
  if (/chain|network mismatch|wrong/.test(m))
    return "Your wallet is on the wrong network. Switch to Arc testnet and retry.";
  return "The payment couldn't be completed. Please try again.";
}

export function PayWithUSDC({
  invoiceId,
  vendor,
  token,
  amount,
  dueAt,
  metadataHash,
  splitsHash,
}: {
  invoiceId: Hex;
  vendor: Hex;
  token: Hex;
  amount: bigint;
  dueAt: Date;
  metadataHash: Hex;
  /** keccak256(abi.encode(splits)); 0x00... for sole-vendor invoices. */
  splitsHash?: Hex;
}) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isLive = Boolean(INVOICE_ESCROW_ADDRESS);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<Hex | null>(null);

  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  // All hooks MUST run unconditionally before any early return. Audit fix
  // : previous version called `useReadContract` AFTER
  // the `if (!isConnected) return …` branches — that's a Rules of Hooks
  // violation that React strict mode + prod would throw on.
  const { data: balance } = useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled:
        isLive && Boolean(address) && isConnected && chainId === arcTestnet.id,
    },
  });
  const insufficient =
    isLive && typeof balance === "bigint" && balance < amount;

  // ─── State 1+2: wallet connection / chain check ───
  if (isLive && !isConnected) {
    return (
      <div className="space-y-3">
        <ConnectWalletButton />
        <RecoveryHint>
          Connect any EVM wallet (MetaMask, Phantom, Rabby, Coinbase) to pay in
          USDC.
        </RecoveryHint>
      </div>
    );
  }
  if (isLive && chainId !== arcTestnet.id) {
    // the wrong-chain branch used
    // to show only a re-`ConnectWalletButton` + a hint, leaving the
    // buyer to switch chains manually in their wallet UI. Now: one-tap
    // wagmi `useSwitchChain` button when the wallet supports it; falls
    // back to the original hint as advice when the user's wallet hasn't
    // injected the switch capability.
    return <WrongChainSwitch />;
  }

  // ─── Pay handler ──────────────────────────────────
  async function pay() {
    if (isLive && !address) return;
    setError(null);
    setHash(null);
    try {
      if (!isLive) {
        // Simulator path — no chain calls, just flip the mock store.
        setPhase("sending");
        const simulatedBuyer =
          address ?? ("0x000000000000000000000000000000000000dE01" as Hex);
        const fakeTx = await simulatePaymentAction(invoiceId, simulatedBuyer);
        setHash(fakeTx);
        setPhase("settled");
        setTimeout(() => router.push(`/receipt/${invoiceId}`), 1200);
        return;
      }

      // Live path — full EIP-712 sign → approve → acceptAndPay.
      setPhase("signing");
      const sig = await signTypedDataAsync({
        domain: {
          name: "Klaro Invoice",
          version: "1",
          chainId: arcTestnet.id,
          verifyingContract: INVOICE_ESCROW_ADDRESS as Hex,
        },
        types: ACCEPTANCE_EIP712_TYPES,
        primaryType: "InvoiceAcceptance",
        message: {
          invoiceId,
          vendor,
          token,
          amount,
          dueAt: BigInt(Math.floor(dueAt.getTime() / 1000)),
          metadataHash,
          splitsHash: splitsHash ?? (("0x" + "0".repeat(64)) as Hex),
        },
      });

      setPhase("approving");
      await writeContractAsync({
        address: token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [INVOICE_ESCROW_ADDRESS as Hex, amount],
        chainId: arcTestnet.id,
      });

      setPhase("sending");
      const txHash = await writeContractAsync({
        address: INVOICE_ESCROW_ADDRESS as Hex,
        abi: INVOICE_ESCROW_ABI,
        functionName: "acceptAndPay",
        args: [invoiceId, sig, address as Hex],
        chainId: arcTestnet.id,
      });
      setHash(txHash as Hex);
      setPhase("settled");
      // Klaro operator picks up the InvoicePaid event and mints the receipt.
      // For UX we route to the receipt page immediately; it shows
      // "pending settlement" until the operator confirms.
      setTimeout(() => router.push(`/receipt/${invoiceId}`), 1800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment failed.";
      // Keep the raw message in the console for support; surface calm copy.
      console.error("PayWithUSDC", err);
      // Distinguish user-cancelled signature vs real failure.
      if (/rejected|denied|user/i.test(msg)) {
        setPhase("idle");
        setError("You cancelled the signature. Try again when ready.");
      } else {
        setPhase("error");
        setError(humanizePaymentError(msg));
      }
    }
  }

  // ─── Phase 4: settled ─────────────────────────────
  if (phase === "settled") {
    return (
      <div className="rounded-md border border-[color-mix(in_oklab,var(--color-success)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-success)_10%,transparent)] p-4 text-sm text-[var(--color-ink)]">
        <p className="flex items-center gap-1.5 font-medium text-[var(--color-success)]">
          <CheckIcon className="size-4" /> Payment submitted.
        </p>
        {hash ? (
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            Transaction{" "}
            <span className="font-mono text-[var(--color-ink)]">
              {shortAddress(hash)}
            </span>
          </p>
        ) : null}
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
          Redirecting to your receipt…
        </p>
      </div>
    );
  }

  // ─── Pay panel ────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {isLive ? (
          <ConnectWalletButton />
        ) : (
          <span className="text-xs text-[var(--color-ink-muted)]">
            Demo buyer checkout
          </span>
        )}
        {!isLive ? (
          <Badge tone="sim">Simulated · contracts not deployed</Badge>
        ) : (
          <Badge tone="live">Live on Arc testnet</Badge>
        )}
      </div>

      <Button
        size="lg"
        onClick={pay}
        disabled={
          phase === "signing" ||
          phase === "approving" ||
          phase === "sending" ||
          insufficient
        }
        className="w-full"
      >
        {phase === "signing" && "Waiting for signature…"}
        {phase === "approving" && "Approving USDC…"}
        {phase === "sending" && "Sending payment…"}
        {phase === "idle" &&
          (insufficient ? "Insufficient USDC" : "Pay invoice in USDC")}
        {phase === "error" && "Try again"}
      </Button>

      {insufficient ? (
        <RecoveryHint>
          You need at least the invoice amount in USDC on Arc testnet.{" "}
          <a
            className="text-[var(--color-brand)] underline"
            href="https://faucet.circle.com"
            target="_blank"
            rel="noreferrer"
          >
            Get testnet USDC →
          </a>
        </RecoveryHint>
      ) : null}

      <div className="flex items-center justify-between border-t border-[var(--color-line)] pt-3">
        <span className="text-xs text-[var(--color-ink-subtle)]">
          {isLive ? "No USDC? Buy with card via MoonPay." : "Simulator only."}
        </span>
        {isLive ? (
          <a
            href={`/api/moonpay/buy?amount=${Math.ceil(Number(amount) / 1_000_000)}&redirect=${encodeURIComponent("/i/" + invoiceId)}`}
            className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs font-medium hover:border-[var(--color-brand)]"
          >
            Card → USDC
          </a>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] px-3 py-2 text-sm text-[var(--color-danger)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-danger)_30%,transparent)]">
          {error}
        </div>
      ) : null}

      <RecoveryHint>
        {isLive
          ? "You'll sign an EIP-712 acceptance message. Klaro runs counterparty screening before verified settlement can release funds; the receipt identifies which checks were performed."
          : "Simulator mode: this creates a demo payment and signed-status preview only. No wallet signature, screening decision, onchain call, escrow, or fund movement occurs."}
      </RecoveryHint>
    </div>
  );
}

function RecoveryHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-relaxed text-[var(--color-ink-subtle)]">
      {children}
    </p>
  );
}

function WrongChainSwitch() {
  const { switchChain, isPending, error } = useSwitchChain();
  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        disabled={isPending}
        className="w-full"
      >
        {isPending ? "Switching…" : `Switch to ${arcTestnet.name}`}
      </Button>
      <RecoveryHint>
        Klaro settles on {arcTestnet.name}. Your wallet is on a different chain
        — tap above to switch. If your wallet doesn&apos;t respond, change it
        manually in the wallet UI and reload.
      </RecoveryHint>
      {error && (
        <p className="text-[11px] leading-relaxed text-[var(--color-danger)]">
          Couldn&apos;t switch networks automatically. Change it to{" "}
          {arcTestnet.name} in your wallet and reload.
        </p>
      )}
    </div>
  );
}
