import { redirect } from "next/navigation";
import { AppShell } from "@/components/klaro/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { getCurrentSession } from "@/lib/auth";
import { listInvoicesForVendor } from "@/lib/repo/invoices";
import { listForVendor } from "@/lib/repo/disputes";
import { PrivacyClient } from "./PrivacyClient";

export default async function PrivacyAccountPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  const { vendor } = session;

  // Resolve the same shell chrome the /vendor/* routes use so this account
  // surface no longer switches navigation mid-session (was the lone legacy
  // VendorNav consumer). Counts + identity come from the session/server, never
  // synthesized client-side.
  const [invoices, disputes] = await Promise.all([
    listInvoicesForVendor(vendor.id),
    listForVendor(vendor.id),
  ]);
  const pendingInvoiceCount = invoices.filter(
    (i) => i.status === "CREATED" || i.status === "ACCEPTED",
  ).length;
  const openDisputeCount = disputes.filter(
    (d) => d.status !== "DECIDED",
  ).length;

  const initials =
    vendor.displayName
      .split(/\s+/)
      .map((p) => p[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "V";
  const subtitle = vendor.country ? `Vendor · ${vendor.country}` : "Vendor";

  return (
    <AppShell
      vendorName={vendor.displayName}
      vendorSubtitle={subtitle}
      initials={initials}
      notifCount={openDisputeCount}
      pendingInvoiceCount={pendingInvoiceCount}
    >
      <section className="mx-auto w-full max-w-[900px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Privacy controls · GDPR + CCPA</Eyebrow>
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
    </AppShell>
  );
}
