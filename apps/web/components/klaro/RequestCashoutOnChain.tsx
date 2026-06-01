"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWriteContract,
  usePublicClient,
} from "wagmi";
import { arcTestnet } from "wagmi/chains";
import { Button } from "@/components/ui/Button";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { CASHOUT_ORDER_PROCESSOR_ABI, ERC20_ABI } from "@/lib/abi";
import { CASHOUT_ORDER_PROCESSOR_ADDRESS } from "@/lib/env";
import {
  prepareCashoutRequestAction,
  recordCashoutRequestedAction,
} from "@/app/(wallet)/vendor/cashout/actions";
import { shortAddress } from "@/lib/money";
import type { Hex } from "@/lib/types";

/**
 * RequestCashoutOnChain — LF-3 vendor-signed cashout request (live path).
 *
 * Mirrors PublishInvoiceOnChain. The vendor signs `approve` + `requestAndLock`
 * so their own USDC is escrowed in CashoutOrderProcessor (`vendor = msg.sender`)
 * — the connected wallet MUST be the payout wallet, hard-blocked otherwise.
 *
 * The lock is REAL on Arc testnet. The LP claim + payout proof that follow are
 * SIMULATED (no real LP / fiat rail exists on testnet) — labelled below per
 * principle 8. The operator daemon advances the on-chain state machine to
 * RELEASED so escrowed USDC never strands.
 */
const USDC_TOKEN = "0x3600000000000000000000000000000000000000" as Hex; // USDC ERC-20 on Arc

type Phase =
  | "idle"
  | "preparing"
  | "approving"
  | "locking"
  | "recording"
  | "done"
  | "error";

export interface CashoutRequestInput {
  usdcAmount: string;
  payoutMinor: string;
  currency: string;
  klaroFeeUsdc: string;
  lpSpreadUsdc: string;
  quoteRate: number;
  quoteExpiresAtIso: string;
}

export function RequestCashoutOnChain({
  input,
  vendorWallet,
}: {
  input: CashoutRequestInput;
  /** the vendor's payout wallet — the only wallet allowed to lock */
  vendorWallet: Hex;
}) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  if (!CASHOUT_ORDER_PROCESSOR_ADDRESS) {
    return (
      <Hint>
        On-chain cashout is disabled (processor address not configured).
      </Hint>
    );
  }
  if (!isConnected) {
    return (
      <div className="space-y-3">
        <ConnectWalletButton />
        <Hint>
          Connect the payout wallet{" "}
          <span className="font-mono">{shortAddress(vendorWallet)}</span> to
          lock USDC for cashout. You sign one approval + one lock transaction.
        </Hint>
      </div>
    );
  }
  if (chainId !== arcTestnet.id) {
    return <SwitchChain />;
  }

  const mismatch =
    !!address && address.toLowerCase() !== vendorWallet.toLowerCase();

  async function requestCashout() {
    setError(null);
    try {
      setPhase("preparing");
      const p = await prepareCashoutRequestAction(input);
      const cop = CASHOUT_ORDER_PROCESSOR_ADDRESS as Hex;
      const usdc = BigInt(p.usdcAmount);

      if (!publicClient) throw new Error("RPC client unavailable.");
      const allowance = (await publicClient.readContract({
        address: USDC_TOKEN,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [vendorWallet, cop],
      })) as bigint;
      if (allowance < usdc) {
        setPhase("approving");
        const approveHash = await writeContractAsync({
          address: USDC_TOKEN,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [cop, usdc],
          chainId: arcTestnet.id,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setPhase("locking");
      const lockHash = await writeContractAsync({
        address: cop,
        abi: CASHOUT_ORDER_PROCESSOR_ABI,
        functionName: "requestAndLock",
        args: [
          p.cashoutId,
          usdc,
          BigInt(p.klaroFee),
          BigInt(p.inrAmount),
          p.corridor,
          BigInt(p.quoteExpiresAtSecs),
          p.quoteHash,
        ],
        chainId: arcTestnet.id,
      });
      await publicClient.waitForTransactionReceipt({ hash: lockHash });

      setPhase("recording");
      const orderId = await recordCashoutRequestedAction({
        cashoutId: p.cashoutId,
        txHash: lockHash as Hex,
        input,
      });
      setPhase("done");
      router.push(`/vendor/cashout/${orderId}` as `/vendor/cashout/${string}`);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Cashout request failed.";
      if (/rejected|denied|user/i.test(msg)) {
        setPhase("idle");
        setError("You cancelled the signature. Try again when ready.");
      } else {
        setPhase("error");
        setError(msg);
      }
    }
  }

  const busy =
    phase === "preparing" ||
    phase === "approving" ||
    phase === "locking" ||
    phase === "recording";

  return (
    <div className="space-y-3">
      <ConnectWalletButton />
      {mismatch ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          Connected wallet{" "}
          <span className="font-mono">{shortAddress(address as Hex)}</span>{" "}
          isn&rsquo;t this account&rsquo;s payout wallet{" "}
          <span className="font-mono">{shortAddress(vendorWallet)}</span>.
          Switch to it — the lock escrows funds from the signing wallet.
        </div>
      ) : null}
      <Button
        size="lg"
        onClick={requestCashout}
        disabled={busy || mismatch}
        className="w-full"
      >
        {phase === "preparing" && "Preparing quote…"}
        {phase === "approving" && "Approve USDC…"}
        {phase === "locking" && "Waiting for lock signature…"}
        {phase === "recording" && "Recording…"}
        {(phase === "idle" || phase === "error" || phase === "done") &&
          "Lock USDC for cashout"}
      </Button>
      {error ? (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </div>
      ) : null}
      <Hint>
        You sign two transactions — approve USDC, then lock it in escrow on Arc
        (gas in USDC). The LP claim + local-currency payout proof that follow
        are <strong>simulated on testnet</strong> — no real LP or fiat moves;
        the operator advances the on-chain state to released so your USDC never
        strands.
      </Hint>
    </div>
  );
}

function SwitchChain() {
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
      <Hint>
        Cashout escrow settles on {arcTestnet.name}. Switch, then lock.
      </Hint>
      {error ? (
        <p className="text-[11px] leading-relaxed text-rose-600">
          Switch failed: {error.message}
        </p>
      ) : null}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-relaxed text-[var(--color-ink-subtle)]">
      {children}
    </p>
  );
}
