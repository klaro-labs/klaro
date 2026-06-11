"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { provisionVendorWallet } from "@/lib/circleModularWallet";

/**
 * Create (or recover) a Circle Modular-Wallets smart account with a passkey.
 * Runs the real Circle round-trip via `provisionVendorWallet` — no seed phrase,
 * MPC-secured. Gated by the caller on `circleAppKitReady()` so it only renders
 * once the client key + app id are configured.
 */
export function CircleWalletButton({
  label,
  current,
  onProvisioned,
}: {
  label: string;
  current?: string;
  onProvisioned: (address: string, credentialId?: string) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "creating" | "done">(
    current ? "done" : "idle",
  );
  const [addr, setAddr] = useState<string | null>(current ?? null);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    setPhase("creating");
    try {
      const res = await provisionVendorWallet({ email: label || "Klaro vendor", mode: "Register" });
      setAddr(res.address);
      setPhase("done");
      onProvisioned(res.address, res.credentialId);
    } catch (e) {
      const msg = (e as Error)?.message?.toLowerCase() ?? "";
      setErr(
        /cancel|notallowed|denied|abort/.test(msg) || (e as Error)?.name === "NotAllowedError"
          ? "Passkey prompt was cancelled. Try again."
          : "Couldn't create the wallet. Try again.",
      );
      setPhase("idle");
    }
  }

  if (phase === "done" && addr) {
    return (
      <div className="rounded-lg border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-success)_8%,white)] p-3 text-sm">
        <p className="font-medium text-[var(--color-success-deep)]">Passkey wallet created.</p>
        <p className="mt-1 break-all font-mono text-xs text-[var(--color-ink-muted)]">{addr}</p>
      </div>
    );
  }
  return (
    <div>
      <Button type="button" onClick={create} disabled={phase === "creating"} className="w-full">
        {phase === "creating" ? "Confirm the passkey prompt…" : "Create passkey-secured wallet"}
      </Button>
      {err && <p className="mt-2 text-xs text-[var(--color-danger)]">{err}</p>}
    </div>
  );
}
