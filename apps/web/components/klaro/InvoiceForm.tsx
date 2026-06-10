"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createInvoiceAction } from "@/app/(wallet)/vendor/invoices/new/actions";

// vendorId + vendorWallet removed from props — server action derives them
// from the authenticated session. .
export function InvoiceForm({ simulated = false }: { simulated?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [dueDays, setDueDays] = useState("14");

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <form
      id="invoice-form"
      className="space-y-7"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          try {
            const id = await createInvoiceAction({
              amountUSD: Number(amount),
              description,
              customerEmail,
              customerName: customerName || undefined,
              dueDays: Number(dueDays),
            });
            router.push(`/vendor/invoices/${id}`);
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Failed to create invoice",
            );
          }
        });
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
          placeholder="0.00"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2 font-display text-3xl font-semibold tracking-tight focus-visible:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1"
        />
        <p className="mt-1 text-xs text-[var(--color-ink-subtle)]">
          {simulated
            ? "Demo amount shown as USDC. No onchain settlement occurs in simulator mode."
            : "Settles as USDC on Arc (6-decimal ERC-20 interface). $1 = 1 USDC."}
        </p>
      </Field>

      <Field label="Description" required>
        <input
          type="text"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Backend dev — Week 17 sprint"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-base md:text-sm focus-visible:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1"
        />
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Customer email" required>
          <input
            type="email"
            required
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="client@company.com"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-base md:text-sm focus-visible:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1"
          />
        </Field>
        <Field label="Customer name (optional)">
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Acme Corp"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-base md:text-sm focus-visible:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1"
          />
        </Field>
      </div>

      <Field label="Due in (days)">
        <input
          type="number"
          min={1}
          max={365}
          value={dueDays}
          onChange={(e) => setDueDays(e.target.value)}
          className="w-32 rounded-md border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-base md:text-sm focus-visible:border-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1"
        />
      </Field>

      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3 border-t border-[var(--color-line)] pt-6">
        <Button type="submit" size="lg" disabled={!hydrated || pending}>
          {!hydrated ? "Loading form…" : pending ? "Creating…" : "Create invoice →"}
        </Button>
        <p className="text-xs text-[var(--color-ink-subtle)]">
          {simulated
            ? "Creates a hosted demo checkout link. No real funds move."
            : "Sends a hosted-page link to the customer. No charge until they pay."}
        </p>
      </div>
    </form>
  );
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
        {required ? (
          <span className="text-[var(--color-brand)]"> *</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
