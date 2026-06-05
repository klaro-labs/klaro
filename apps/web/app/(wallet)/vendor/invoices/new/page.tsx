import Link from "next/link";
import { InvoiceForm } from "@/components/klaro/InvoiceForm";
import { getCurrentSession } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Vendor → New invoice. Server-rendered shell + client form.
 * Single responsive tree under the vendor AppShell (provided by
 * app/vendor/layout.tsx). Mobile renders a sticky sub-header with Back +
 * Save; desktop renders the centered hero header.
 */
export default async function NewInvoicePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const { simulated } = session;

  return (
    <div>
      {/* Mobile sub-header — stacks below the AppShell topbar */}
      <div className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-bg)]/95 px-4 py-3 md:hidden">
        <Link
          href="/vendor"
          className="text-sm font-medium text-[var(--color-klaro-orange)]"
        >
          ‹ Back
        </Link>
        <span className="font-display text-sm font-semibold">New invoice</span>
        <button
          type="submit"
          form="invoice-form"
          className="text-sm font-medium text-[var(--color-klaro-orange)]"
        >
          Save
        </button>
      </div>

      <section className="mx-auto w-full max-w-3xl px-6 py-6 md:py-12">
        <header className="hidden md:block">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
            New invoice
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Create an invoice.
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Klaro generates a hosted page at{" "}
            <span className="font-mono">myklaro.app/i/&lt;id&gt;</span> you can
            share with your customer.{" "}
            {simulated
              ? "This simulator creates a payment and receipt preview without moving funds."
              : "They pay in USDC; you get settled on Arc."}
          </p>
        </header>
        <div className="md:mt-8">
          <InvoiceForm simulated={simulated} />
        </div>
      </section>
    </div>
  );
}
