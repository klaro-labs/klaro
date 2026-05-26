import { redirect } from "next/navigation";
import { VendorNav } from "@/components/klaro/VendorNav";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { PrivacyClient } from "./PrivacyClient";

export default async function PrivacyAccountPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <VendorNav vendorName={session.vendor.displayName} />
      <section className="mx-auto w-full max-w-[900px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Privacy controls · GDPR + CCPA
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Your data
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Klaro holds the minimum needed to run your account. Two controls
              below: export everything we have, or request deletion. On-chain
              hashes are immutable but carry no PII per principle 11.
            </p>
          </div>
          <Badge tone="info">v1 export schema</Badge>
        </div>
        <PrivacyClient />
      </section>
    </main>
  );
}
