"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { arcTestnet } from "wagmi/chains";
import { Button } from "@/components/ui/Button";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { INVOICE_ESCROW_ABI } from "@/lib/abi";
import { INVOICE_ESCROW_ADDRESS } from "@/lib/env";
import { recordInvoicePublishedAction } from "@/app/(wallet)/vendor/invoices/new/actions";
import { shortAddress } from "@/lib/money";
import type { Hex } from "@/lib/types";

/**
 * PublishInvoiceOnChain — QA-020 vendor-side publish (path A).
 *
 * The escrow's `createInvoice` sets `vendor = msg.sender`, so the invoice's
 * payout recipient is whoever signs this tx. The connected wallet MUST be
 * the invoice's payout wallet — publishing from any other wallet would
 * record the wrong on-chain payee. We hard-block the mismatch case rather
 * than silently misroute funds.
 *
 * State machine mirrors PayWithUSDC: connect → switch chain → publish →
 * record. On success the server persists `published_tx_hash`; the parent
 * page re-reads and swaps this panel for the "published" view.
 */
type Phase = "idle" | "publishing" | "recording" | "done" | "error";

export function PublishInvoiceOnChain({
  invoiceId,
  vendorWallet,
  token,
  amount,
  dueAtUnix,
  metadataHash,
}: {
  invoiceId: Hex;
  /** the invoice's payout wallet — the only wallet allowed to publish */
  vendorWallet: Hex;
  token: Hex;
  /** 6-dec USDC units as a decimal string (bigint isn't serializable over RSC props) */
  amount: string;
  dueAtUnix: number;
  metadataHash: Hex;
}) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<Hex | null>(null);

  if (!INVOICE_ESCROW_ADDRESS) {
    return (
      <Hint>
        On-chain publishing is disabled (escrow address not configured).
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
          publish this invoice on-chain. The buyer can only pay once it&rsquo;s
          published.
        </Hint>
      </div>
    );
  }

  if (chainId !== arcTestnet.id) {
    return <SwitchChain />;
  }

  const mismatch =
    !!address && address.toLowerCase() !== vendorWallet.toLowerCase();

  async function publish() {
    setError(null);
    setHash(null);
    try {
      setPhase("publishing");
      const txHash = await writeContractAsync({
        address: INVOICE_ESCROW_ADDRESS as Hex,
        abi: INVOICE_ESCROW_ABI,
        functionName: "createInvoice",
        args: [
          invoiceId,
          token,
          BigInt(amount),
          BigInt(dueAtUnix),
          metadataHash,
        ],
        chainId: arcTestnet.id,
      });
      setHash(txHash as Hex);
      setPhase("recording");
      // The tx is broadcast — the invoice is (or will be) on-chain. If the DB
      // record fails here (network blip, etc.), DON'T prompt a re-publish: that
      // would revert ("already exists"). Refresh instead — the server
      // reconciles published_tx_hash against on-chain truth on the next load.
      try {
        await recordInvoicePublishedAction(invoiceId, txHash as Hex);
      } catch {
        /* server-side reconcile backfills it; just refresh below */
      }
      setPhase("done");
      router.refresh();
    } catch (err) {
      // Reached only when the signature/broadcast itself failed (no tx on-chain).
      const msg = err instanceof Error ? err.message : "Publish failed.";
      if (/rejected|denied|user/i.test(msg)) {
        setPhase("idle");
        setError("You cancelled the signature. Try again when ready.");
      } else {
        setPhase("error");
        setError(msg);
      }
    }
  }

  if (phase === "done") {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <p className="font-medium">Published on-chain.</p>
        {hash ? (
          <p className="mt-1 font-mono text-xs break-all text-emerald-700">
            {hash}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ConnectWalletButton />
      {mismatch ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          Connected wallet{" "}
          <span className="font-mono">{shortAddress(address as Hex)}</span>{" "}
          isn&rsquo;t this invoice&rsquo;s payout wallet{" "}
          <span className="font-mono">{shortAddress(vendorWallet)}</span>.
          Switch to the payout wallet — publishing from another wallet would
          send the funds there.
        </div>
      ) : null}
      <Button
        size="lg"
        onClick={publish}
        disabled={phase === "publishing" || phase === "recording" || mismatch}
        className="w-full"
      >
        {phase === "publishing" && "Waiting for signature…"}
        {phase === "recording" && "Recording…"}
        {(phase === "idle" || phase === "error") && "Publish invoice on-chain"}
      </Button>
      {error ? (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </div>
      ) : null}
      <Hint>
        You&rsquo;ll sign one transaction that records the invoice in
        InvoiceEscrow on Arc. Gas is paid in USDC. Until this lands, the buyer
        can&rsquo;t pay.
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
        Publishing settles on {arcTestnet.name}. Switch your wallet&rsquo;s
        network, then publish.
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
