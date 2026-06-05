import Link from "next/link";
import { redirect } from "next/navigation";
import { LinkForm } from "@/components/klaro/LinkForm";
import { getCurrentSession } from "@/lib/auth";

/**
 * Vendor → New Klaro Link. Server-rendered shell + client form. The vendor's
 * provisioned payout wallet is passed to the form so it can require the matching
 * wallet when signing the on-chain authorization.
 */
export default async function NewLinkPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const { simulated } = session;
  const vendorWallet = session.vendor.wallet ?? null;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-bg)]/95 px-4 py-3 md:hidden">
        <Link href="/vendor/links" className="text-sm font-medium text-[var(--color-klaro-orange)]">
          ‹ Back
        </Link>
        <span className="font-display text-sm font-semibold">New link</span>
        <button type="submit" form="link-form" className="text-sm font-medium text-[var(--color-klaro-orange)]">
          Create
        </button>
      </div>

      <section className="mx-auto w-full max-w-3xl px-6 py-6 md:py-12">
        <header className="hidden md:block">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-klaro-orange)]">
            New payment link
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Create a Klaro Link.
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            A reusable, fixed-amount payment page at{" "}
            <span className="font-mono">myklaro.app/pay/&lt;slug&gt;</span>. Share it
            anywhere — every payer pays the same amount in USDC.{" "}
            {simulated
              ? "This simulator creates a demo link without moving funds."
              : "You authorize it once; Klaro publishes each payment on Arc to your wallet."}
          </p>
        </header>
        <div className="md:mt-8">
          <LinkForm vendorWallet={vendorWallet} />
        </div>
      </section>
    </div>
  );
}
