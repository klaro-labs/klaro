import Link from "next/link";
import { VendorNav } from "@/components/klaro/VendorNav";
import { InvoiceForm } from "@/components/klaro/InvoiceForm";
import { MobileShell } from "@/components/klaro/MobileShell";
import { getCurrentSession } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Vendor → New invoice. Server-rendered shell + client form.
 * Mobile (<md): MobileShell + sticky top-bar Back/New invoice/Save + card-form.
 * Desktop (≥md): existing centered layout under VendorNav.
 */
export default async function NewInvoicePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const { vendor, simulated } = session;

  return (
    <>
      <div className="md:hidden">
        <MobileShell active="invoices">
          <div className="-mx-4 -mt-5 flex items-center justify-between border-b border-[var(--color-line)] bg-white/95 px-4 py-3 backdrop-blur">
            <Link
              href="/vendor"
              className="text-sm font-medium text-[var(--color-brand)]"
            >
              ‹ Back
            </Link>
            <span className="font-display text-sm font-semibold">
              New invoice
            </span>
            <button
              type="submit"
              form="invoice-form"
              className="text-sm font-medium text-[var(--color-brand)]"
            >
              Save
            </button>
          </div>
          <div className="pt-4">
            <InvoiceForm simulated={simulated} />
          </div>
        </MobileShell>
      </div>

      <main className="hidden md:block">
        <VendorNav vendorName={vendor.displayName} />
        <section className="mx-auto w-full max-w-3xl px-6 py-12">
          <header>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-brand)]">
              New invoice
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Create an invoice.
            </h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Klaro generates a hosted page at{" "}
              <span className="font-mono">i.klaro.so/&lt;id&gt;</span> you can
              share with your customer.{" "}
              {simulated
                ? "This simulator creates a payment and receipt preview without moving funds."
                : "They pay in USDC; you get settled on Arc."}
            </p>
          </header>
          <div className="mt-8">
            <InvoiceForm simulated={simulated} />
          </div>
        </section>
      </main>
    </>
  );
}
