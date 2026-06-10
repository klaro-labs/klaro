"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { createInvoiceAction } from "@/app/(wallet)/vendor/invoices/new/actions";

interface ParsedRow {
  customerEmail: string;
  amount: number;
  description: string;
  dueAt: string;
  error?: string;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
  const idx = {
    customerEmail: header.indexOf("customeremail"),
    amount: header.indexOf("amount"),
    description: header.indexOf("description"),
    dueAt: header.indexOf("dueat"),
  };
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",").map((s) => s.trim());
    const row: ParsedRow = {
      customerEmail: cells[idx.customerEmail] ?? "",
      amount: Number(cells[idx.amount] ?? 0),
      description: cells[idx.description] ?? "",
      dueAt: cells[idx.dueAt] ?? "",
    };
    if (!row.customerEmail.includes("@")) row.error = `row ${i + 2}: bad email`;
    else if (!Number.isFinite(row.amount) || row.amount <= 0)
      row.error = `row ${i + 2}: bad amount`;
    else if (!row.description) row.error = `row ${i + 2}: missing description`;
    else if (Number.isNaN(Date.parse(row.dueAt)))
      row.error = `row ${i + 2}: bad date`;
    return row;
  });
}

export function BulkImportClient() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    file.text().then((text) => setRows(parseCsv(text)));
  }

  const errors = rows.filter((r) => r.error);
  const good = rows.filter((r) => !r.error);

  useEffect(() => {
    setHydrated(true);
  }, []);

  function dueDaysFrom(date: string) {
    return Math.ceil((Date.parse(date) - Date.now()) / (24 * 60 * 60 * 1000));
  }

  function createValidInvoices() {
    setResult(null);
    setImportError(null);
    start(async () => {
      try {
        let created = 0;
        for (const row of good) {
          const dueDays = dueDaysFrom(row.dueAt);
          if (dueDays < 1 || dueDays > 365) {
            throw new Error(
              `row due date must be between tomorrow and 365 days: ${row.customerEmail}`,
            );
          }
          await createInvoiceAction({
            amountUSD: row.amount,
            description: row.description,
            customerEmail: row.customerEmail,
            dueDays,
          });
          created += 1;
        }
        setResult(`Created ${created} invoice${created === 1 ? "" : "s"}.`);
      } catch (err) {
        setImportError(
          err instanceof Error ? err.message : "Bulk import failed.",
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <label className="block rounded-lg border-2 border-dashed border-[var(--color-line)] bg-white p-8 text-center hover:border-[var(--color-brand)]">
        <input
          type="file"
          accept=".csv"
          disabled={!hydrated}
          onChange={onFile}
          className="hidden"
        />
        <div className="text-sm">
          {fileName ? (
            <span className="font-medium">{fileName}</span>
          ) : !hydrated ? (
            <span className="text-[var(--color-ink-subtle)]">
              Loading importer...
            </span>
          ) : (
            <span className="cursor-pointer text-[var(--color-brand)] underline">
              Choose CSV file
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-[var(--color-ink-subtle)]">
          Drag-drop also works.
        </p>
      </label>

      {rows.length > 0 && (
        <div className="rounded-lg border border-[var(--color-line)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3 text-sm">
            <div className="flex items-center gap-3">
              <Badge tone={errors.length === 0 ? "live" : "sim"}>
                {good.length} valid · {errors.length} errors
              </Badge>
              <span className="text-[var(--color-ink-subtle)]">
                Preview (first 20 rows shown)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending || good.length === 0 || errors.length > 0}
                onClick={createValidInvoices}
                className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white disabled:opacity-45"
              >
                {pending
                  ? "Creating..."
                  : `Create ${good.length} invoice${good.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
          {result ? (
            <p className="border-b border-[var(--color-line)] bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
              {result}
            </p>
          ) : null}
          {importError ? (
            <p className="border-b border-[var(--color-line)] bg-rose-50 px-4 py-2 text-sm text-rose-800">
              {importError}
            </p>
          ) : null}
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-line)] text-xs uppercase text-[var(--color-ink-subtle)]">
              <tr>
                <th className="px-4 py-2 text-left">Customer</th>
                <th className="px-4 py-2 text-left">Amount</th>
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-left">Due</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((r, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--color-line)] last:border-0"
                >
                  <td className="px-4 py-2">{r.customerEmail}</td>
                  <td className="px-4 py-2">
                    $
                    {r.amount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-2">{r.description}</td>
                  <td className="px-4 py-2">{r.dueAt}</td>
                  <td className="px-4 py-2">
                    {r.error ? (
                      <span className="text-red-700">{r.error}</span>
                    ) : (
                      <span className="text-green-700">ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
