"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSignTypedData } from "wagmi";
import { toHex } from "viem";
import { arcTestnet } from "wagmi/chains";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { createLinkAction, type LinkAuthInput } from "@/app/(wallet)/vendor/links/new/actions";
import { LINK_AUTH_EIP712_TYPES, ARC_USDC_ADDRESS } from "@/lib/abi";
import { INVOICE_ESCROW_ADDRESS } from "@/lib/env";
import { dollarsToUSDC, shortAddress } from "@/lib/money";
import type { Hex } from "@/lib/types";

/**
 * LinkForm — vendor creates a reusable Klaro Link. Amount is fixed at creation
 * (each payer pays the same). When contracts are live, the vendor signs ONE
 * LinkInvoiceAuthorization in their wallet; the relayer reuses it to publish
 * each payment's invoice on-chain via createInvoiceFor. In simulator mode the
 * link is created without a signature (demo only). The signing wallet MUST be
 * the vendor's provisioned payout wallet — funds always settle there.
 */
export function LinkForm({
  vendorWallet,
}: {
  vendorWallet: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "signing">("idle");

  const [amount, setAmount] = useState("100");
  const [label, setLabel] = useState("");
  const [expireDays, setExpireDays] = useState("");

  const isLive = Boolean(INVOICE_ESCROW_ADDRESS);
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const walletMatches =
    !vendorWallet ||
    (address && address.toLowerCase() === vendorWallet.toLowerCase());

  async function submit() {
    setError(null);
    const amountUSD = Number(amount);
    if (!Number.isFinite(amountUSD) || amountUSD <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    const days = expireDays.trim() ? Number(expireDays) : undefined;
    if (days != null && (!Number.isInteger(days) || days < 1 || days > 365)) {
      setError("Expiry must be 1–365 days, or blank for no expiry.");
      return;
    }
    const labelClean = label.trim() || undefined;

    try {
      let auth: LinkAuthInput | undefined;
      if (isLive) {
        if (!isConnected || !address) {
          setError("Connect your payout wallet to authorize the link.");
          return;
        }
        if (!walletMatches) {
          setError(
            `Connect the wallet that matches your Klaro payout address (${vendorWallet ? shortAddress(vendorWallet) : "—"}). Funds settle there.`,
          );
          return;
        }
        const amountWei = dollarsToUSDC(amountUSD);
        // Random bytes32 the authorization is bound to (distinct from the DB id).
        const linkChainId = toHex(crypto.getRandomValues(new Uint8Array(32))) as Hex;
        const nowS = Math.floor(Date.now() / 1000);
        const authDeadline = days != null ? nowS + days * 86_400 + 86_400 : nowS + 730 * 86_400;

        setPhase("signing");
        const sig = (await signTypedDataAsync({
          domain: {
            name: "Klaro Invoice",
            version: "1",
            chainId: arcTestnet.id,
            verifyingContract: INVOICE_ESCROW_ADDRESS as Hex,
          },
          types: LINK_AUTH_EIP712_TYPES,
          primaryType: "LinkInvoiceAuthorization",
          message: {
            vendor: address as Hex,
            token: ARC_USDC_ADDRESS,
            amount: amountWei,
            linkId: linkChainId,
            authDeadline: BigInt(authDeadline),
          },
        })) as Hex;
        setPhase("idle");
        auth = { vendorWallet: address as Hex, linkChainId, authDeadline, vendorAuthSig: sig };
      }

      start(async () => {
        try {
          const id = await createLinkAction({
            amountUSD,
            label: labelClean,
            expireDays: days,
            auth,
          });
          router.push(`/vendor/links/${id}`);
        } catch (err) {
          setError(err instanceof Error ? humanize(err.message) : "Failed to create link.");
        }
      });
    } catch (err) {
      setPhase("idle");
      const msg = err instanceof Error ? err.message : "Signature failed.";
      setError(/rejected|denied|user/i.test(msg) ? "You cancelled the signature. Try again when ready." : msg);
    }
  }

  return (
    <form
      id="link-form"
      className="space-y-7"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Amount (USD)" required>
        <input
          type="number"
          min={1}
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2 font-display text-3xl font-semibold tracking-tight focus:border-[var(--color-brand)] focus:outline-none"
        />
        <p className="mt-1 text-xs text-[var(--color-ink-subtle)]">
          Every payer pays this amount in USDC.{" "}
          {isLive ? "Settles on Arc to your payout wallet." : "Simulator: no funds move."}
        </p>
      </Field>

      <Field label="Label (optional)">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Consultation call · 30 min"
          maxLength={200}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-sm focus:border-[var(--color-brand)] focus:outline-none"
        />
      </Field>

      <Field label="Expires in (days, optional)">
        <input
          type="number"
          min={1}
          max={365}
          value={expireDays}
          onChange={(e) => setExpireDays(e.target.value)}
          placeholder="No expiry"
          className="w-40 rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-sm focus:border-[var(--color-brand)] focus:outline-none"
        />
      </Field>

      {isLive ? (
        <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              Authorize on-chain
            </span>
            <Badge tone="live">Live on Arc testnet</Badge>
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
            You&apos;ll sign one authorization so Klaro can publish each
            payment&apos;s invoice on your behalf. No gas, no funds move now —
            payers cover gas when they pay.
          </p>
          <div className="mt-3">
            <ConnectWalletButton />
          </div>
          {isConnected && !walletMatches ? (
            <p className="mt-2 text-[11px] leading-relaxed text-rose-600">
              Connected wallet doesn&apos;t match your payout address
              {vendorWallet ? ` (${shortAddress(vendorWallet)})` : ""}. Switch
              accounts in your wallet so funds settle to you.
            </p>
          ) : null}
        </div>
      ) : (
        <Badge tone="sim">Simulated · contracts not deployed</Badge>
      )}

      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3 border-t border-[var(--color-line)] pt-6">
        <Button type="submit" size="lg" disabled={pending || phase === "signing"}>
          {phase === "signing"
            ? "Waiting for signature…"
            : pending
              ? "Creating…"
              : isLive
                ? "Sign & create link →"
                : "Create link →"}
        </Button>
        <p className="text-xs text-[var(--color-ink-subtle)]">
          A shareable page at <span className="font-mono">pay.klaro.so/&lt;slug&gt;</span>.
        </p>
      </div>
    </form>
  );
}

/** Map server validation codes to plain language for the vendor. */
function humanize(code: string): string {
  const map: Record<string, string> = {
    link_authorization_required: "This link needs an on-chain signature. Connect your wallet and sign.",
    validation_auth_wallet_mismatch: "The signing wallet must be your payout wallet.",
    validation_bad_link_authorization: "Signature didn't verify. Try signing again.",
    validation_auth_deadline_before_expiry: "Authorization window is shorter than the link expiry.",
  };
  return map[code] ?? code;
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        {label}
        {required ? <span className="text-[var(--color-brand)]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
