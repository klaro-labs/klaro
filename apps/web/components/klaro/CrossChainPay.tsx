"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWriteContract,
  usePublicClient,
} from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { encodeAbiParameters, parseAbi, formatUnits } from "viem";
import { Button } from "@/components/ui/Button";
import { ConnectWalletButton } from "./ConnectWalletButton";
import type { Hex } from "@/lib/types";

/**
 * Cross-chain pay-in via CCTP V2 (Base Sepolia → Arc). The buyer burns USDC on
 * Base targeting Arc with the vendor's wallet as mint recipient; Klaro's
 * operator daemon fetches Circle's attestation, mints native USDC on Arc, and
 * credits the invoice. Real burn-and-mint — no wrapped tokens, no bridge custody.
 */
const BASE_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Hex;
const TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as Hex;
const ARC_DOMAIN = 26;
const FAST = 1000; // minFinalityThreshold: Fast Transfer (~8-20s)
// Operator is the only address allowed to mint on Arc (destinationCaller). Its
// address is public (the daemon signer); funds still go only to the vendor.
const OPERATOR = (process.env.NEXT_PUBLIC_KLARO_OPERATOR_ADDRESS ??
  "0xAD578be3836eDa982e18600784c414cC69B4EB94") as Hex;

const TM_ABI = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) external returns (uint64)",
]);
const ERC20 = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);
const toBytes32 = (a: Hex) => encodeAbiParameters([{ type: "address" }], [a]);

type Phase =
  | "idle"
  | "switching"
  | "approving"
  | "burning"
  | "attesting"
  | "paid"
  | "error";

function humanize(msg: string): string {
  const m = msg.toLowerCase();
  if (/rejected|denied|user/.test(m)) return "You cancelled the request.";
  if (/insufficient|exceeds balance/.test(m))
    return "Not enough USDC or ETH on Base Sepolia for the payment + gas.";
  return "Something went wrong on Base. Try again.";
}

export function CrossChainPay({
  invoiceId,
  amount,
  vendorWallet,
}: {
  invoiceId: Hex;
  amount: bigint;
  vendorWallet: Hex;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const basePub = usePublicClient({ chainId: baseSepolia.id });
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [arcTx, setArcTx] = useState<string | null>(null);

  // Poll for settlement once the burn is reported.
  useEffect(() => {
    if (phase !== "attesting") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/cctp/payin?invoiceId=${invoiceId}`);
        if (!r.ok) return;
        const d = await r.json();
        if (d.invoiceStatus === "PAID" || d.invoiceStatus === "SETTLED" || d.state === "settled") {
          setArcTx(d.arcTxHash ?? null);
          setPhase("paid");
        }
      } catch {
        /* keep polling */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [phase, invoiceId]);

  async function pay() {
    if (!address || !basePub) return;
    setErr(null);
    try {
      if (chainId !== baseSepolia.id) {
        setPhase("switching");
        await switchChainAsync({ chainId: baseSepolia.id });
      }
      const bal = await basePub.readContract({ address: BASE_USDC, abi: ERC20, functionName: "balanceOf", args: [address] });
      if (bal < amount) {
        setErr(`You need ${formatUnits(amount, 6)} USDC on Base Sepolia (have ${formatUnits(bal, 6)}).`);
        setPhase("error");
        return;
      }
      const allowance = await basePub.readContract({ address: BASE_USDC, abi: ERC20, functionName: "allowance", args: [address, TOKEN_MESSENGER] });
      if (allowance < amount) {
        setPhase("approving");
        const ah = await writeContractAsync({ address: BASE_USDC, abi: ERC20, functionName: "approve", args: [TOKEN_MESSENGER, amount], chainId: baseSepolia.id });
        await basePub.waitForTransactionReceipt({ hash: ah });
      }
      setPhase("burning");
      const burnHash = await writeContractAsync({
        address: TOKEN_MESSENGER,
        abi: TM_ABI,
        functionName: "depositForBurn",
        args: [amount, ARC_DOMAIN, toBytes32(vendorWallet), BASE_USDC, toBytes32(OPERATOR), amount / 200n, FAST],
        chainId: baseSepolia.id,
      });
      await basePub.waitForTransactionReceipt({ hash: burnHash });
      await fetch("/api/cctp/payin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceId, burnTxHash: burnHash, sourceChain: "base" }),
      });
      setPhase("attesting");
    } catch (e) {
      setErr(humanize((e as Error).message));
      setPhase("error");
    }
  }

  if (phase === "paid") {
    return (
      <div className="rounded-lg border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-success)_8%,white)] p-4 text-sm">
        <p className="font-medium text-[var(--color-success-deep)]">Paid from Base Sepolia.</p>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          USDC bridged to Arc via CCTP V2 and delivered to the vendor.
          {arcTx && (
            <>
              {" "}
              <a className="font-mono text-[var(--color-brand)] hover:underline" href={`https://testnet.arcscan.app/tx/${arcTx}`} target="_blank" rel="noreferrer">
                view mint
              </a>
            </>
          )}
        </p>
      </div>
    );
  }

  const busy = phase === "switching" || phase === "approving" || phase === "burning" || phase === "attesting";
  const label =
    phase === "switching" ? "Switch to Base Sepolia in your wallet…"
    : phase === "approving" ? "Approve USDC…"
    : phase === "burning" ? "Confirm payment…"
    : phase === "attesting" ? "Bridging to Arc (CCTP V2)…"
    : `Pay ${formatUnits(amount, 6)} USDC from Base Sepolia`;

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-white p-4">
      <p className="text-sm font-medium">No USDC on Arc? Pay from Base Sepolia.</p>
      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
        Burn USDC on Base; Circle CCTP V2 mints it to the vendor on Arc. ~8-20s.
      </p>
      {!isConnected ? (
        <div className="mt-3"><ConnectWalletButton /></div>
      ) : (
        <Button type="button" onClick={pay} disabled={busy} className="mt-3 w-full">
          {label}
        </Button>
      )}
      {phase === "attesting" && (
        <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
          Your USDC is burned on Base. Waiting for Circle's attestation, then the
          vendor receives it on Arc — this page updates automatically.
        </p>
      )}
      {err && <p className="mt-2 text-xs text-[var(--color-danger)]">{err}</p>}
    </div>
  );
}
