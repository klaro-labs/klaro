"use client";

import { useState, useTransition } from "react";
import { getTaxPackAction, getAuditPackAction } from "./actions";

const DEFAULT_FROM = new Date(Date.now() - 365 * 86_400_000)
  .toISOString()
  .slice(0, 10);
const DEFAULT_TO = new Date().toISOString().slice(0, 10);

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportsClient() {
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [summary, setSummary] = useState<{
    count: number;
    totalUsdc: string;
    uniqueCustomers: number;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function onTaxPack() {
    startTransition(async () => {
      const res = await getTaxPackAction({ fromIso: from, toIso: to });
      setSummary({
        count: res.summary.count,
        totalUsdc: (Number(res.summary.totalUsdc) / 1_000_000).toLocaleString(
          "en-US",
          { minimumFractionDigits: 2 },
        ),
        uniqueCustomers: res.summary.uniqueCustomers,
      });
      downloadBlob(
        res.csv,
        "text/csv;charset=utf-8",
        `klaro-tax-pack-${from}_${to}.csv`,
      );
    });
  }

  function onAuditPack() {
    startTransition(async () => {
      const res = await getAuditPackAction();
      downloadBlob(
        res.json,
        "application/json",
        `klaro-audit-pack-${Date.now()}.json`,
      );
    });
  }

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-[var(--color-line)] bg-white p-6">
        <h2 className="font-display text-xl font-semibold">Tax pack (CSV)</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Settled invoices in the window. One row per invoice with amount,
          customer, on-chain hashes. Hand straight to your accountant or upload
          to your tax software.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <button
            type="button"
            onClick={onTaxPack}
            disabled={pending}
            className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {pending ? "Generating…" : "Download CSV"}
          </button>
        </div>
        {summary && (
          <p className="mt-3 text-xs text-[var(--color-ink-subtle)]">
            Latest pack: {summary.count} settled invoices · ${summary.totalUsdc}{" "}
            · {summary.uniqueCustomers} unique customers
          </p>
        )}
      </div>

      <div className="rounded-lg border border-[var(--color-line)] bg-white p-6">
        <h2 className="font-display text-xl font-semibold">
          Audit pack (JSON)
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Full history — every invoice + every cashout + your vendor profile +
          on-chain refs. Required reading for grant due-diligence, exchange
          listings, partner integrations. Schema version stamped so consumers
          know which Klaro release produced the file.
        </p>
        <button
          type="button"
          onClick={onAuditPack}
          disabled={pending}
          className="mt-4 rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {pending ? "Generating…" : "Download JSON"}
        </button>
        <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
          Schema <code className="font-mono">klaro.audit-pack.v1</code> · PDF
          render lands M12 polish
        </p>
      </div>
    </div>
  );
}
