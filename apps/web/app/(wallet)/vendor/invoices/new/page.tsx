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
const ZERO_ADDR = "0x" + "0".repeat(40);

export default async function NewInvoicePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const { simulated, vendor } = session;
  // Invoices pay out in USDC to the vendor's wallet, so creating one without a
  // provisioned wallet throws server-side (assertVendorWalletProvisioned) and
  // surfaces as an opaque 500. Gate the form behind a clear setup prompt.
  const hasWallet =
    Boolean(vendor.wallet) && vendor.wallet!.toLowerCase() !== ZERO_ADDR;

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
          {hasWallet ? (
            <InvoiceForm simulated={simulated} />
          ) : (
            <div className="rounded-lg border border-[var(--color-line)] bg-white p-6">
              <h2 className="font-display text-lg font-semibold">
                Add a payout wallet first
              </h2>
              <p className="mt-2 max-w-prose text-sm text-[var(--color-ink-muted)]">
                Invoices settle in USDC to your wallet on Arc, so you need one
                before you can create an invoice. Set up a passkey-secured Circle
                wallet, or connect an existing address, in onboarding.
              </p>
              <Link
                href="/onboarding"
                className="mt-4 inline-flex h-11 items-center rounded-pill bg-[var(--color-ink)] px-5 text-sm font-medium text-white hover:opacity-90"
              >
                Set up your wallet &rarr;
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
