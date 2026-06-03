"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { exportMyDataAction, deleteMyAccountAction } from "./actions";

export function PrivacyClient() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function onExport() {
    startTransition(async () => {
      const { json } = await exportMyDataAction();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `klaro-my-data-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("Export downloaded");
    });
  }

  function onDelete() {
    if (
      !confirm(
        "Delete your Klaro account? This kicks the 30-day retention countdown.",
      )
    )
      return;
    startTransition(async () => {
      await deleteMyAccountAction();
      setStatus("Delete requested · 30-day cool-down running");
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6">
        <h2 className="font-display text-xl font-semibold">Export my data</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          GDPR Art. 20 portability. Receive everything Klaro holds about you in
          machine-readable JSON (schema{" "}
          <code className="font-mono text-xs">klaro.privacy-export.v1</code>).
          On-chain anchors are listed; the off-chain bundle of each anchor is
          included inline.
        </p>
        <Button
          size="sm"
          onClick={onExport}
          disabled={pending}
          className="mt-4"
        >
          {pending ? "Building…" : "Download my data"}
        </Button>
      </div>

      <div className="rounded-lg border border-[color-mix(in_oklab,var(--color-danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_5%,var(--color-bg-elevated))] p-6">
        <h2 className="font-display text-xl font-semibold text-[var(--color-danger)]">
          Delete my account
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          GDPR Art. 17 erasure. Klaro removes your account, off-chain KYB
          bundle, and personal data after a 30-day cool-down (regulatory hold
          period for ongoing disputes). On-chain hashes remain but contain no
          PII per principle 11. AML records persist 7 years per FATF guidance.
        </p>
        <button
          onClick={onDelete}
          disabled={pending}
          className="mt-4 inline-flex h-9 items-center justify-center rounded-pill border border-[color-mix(in_oklab,var(--color-danger)_40%,transparent)] px-4 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50"
        >
          Request delete
        </button>
      </div>

      {status && (
        <p className="text-sm text-[var(--color-ink-muted)]">{status}</p>
      )}
    </div>
  );
}
