"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { CheckIcon } from "@/components/ui/CheckIcon";
import {
  confirmReceivedAction,
  openDisputeAction,
} from "@/app/(wallet)/vendor/cashout/actions";
import type { Hex } from "@/lib/types";

/**
 * Vendor-side actions on a PROOF_SUBMITTED cashout:
 * - "I received INR" → confirmReceivedAction → RELEASED
 * - "Open dispute" → openDisputeAction → DISPUTED
 * Keep the two CTAs side-by-side, primary on the affirmative case (per
 * v2 §14 — every user action needs a clear next step).
 */
export function CashoutActions({
  id,
  simulated = false,
}: {
  id: Hex;
  simulated?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const run = (fn: (id: Hex) => Promise<void>) =>
    start(async () => {
      setErr(null);
      try {
        await fn(id);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Action failed.");
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          disabled={pending}
          onClick={() => run(confirmReceivedAction)}
        >
          {simulated ? (
            "Complete simulation"
          ) : (
            <>
              <CheckIcon className="size-4" /> I received INR
            </>
          )}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          disabled={pending}
          onClick={() => run(openDisputeAction)}
        >
          Open dispute
        </Button>
      </div>
      {err ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {err}
        </p>
      ) : null}
      <p className="text-[11px] text-[var(--color-ink-subtle)]">
        {simulated
          ? "Completing updates demo state only. Disputing creates a simulated admin-review case."
          : "Confirming releases your locked USDC to the LP. Disputing freezes the order until Klaro admin reviews evidence from both sides."}
      </p>
    </div>
  );
}
