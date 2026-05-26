import { redirect } from "next/navigation";
import { VendorNav } from "@/components/klaro/VendorNav";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { ExportsClient } from "./ExportsClient";

export default async function ExportsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <VendorNav vendorName={session.vendor.displayName} />
      <section className="mx-auto w-full max-w-[1000px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Exports
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Tax + audit packs
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Built from the same source the chain reads — no off-chain ledger
              drift. Both packs include on-chain hashes so auditors can
              re-verify against Arc explorer.
            </p>
          </div>
          <Badge tone="info">v1 schema</Badge>
        </div>
        <ExportsClient />
      </section>
    </main>
  );
}
