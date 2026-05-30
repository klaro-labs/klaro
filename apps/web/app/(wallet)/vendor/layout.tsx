import { redirect } from "next/navigation";
import { AppShell } from "@/components/klaro/AppShell";
import { getCurrentSession } from "@/lib/auth";
import { listInvoicesForVendor } from "@/lib/repo/invoices";
import { listForVendor } from "@/lib/repo/disputes";

/**
 * Vendor app shell — wraps every /vendor/* route.
 * Replaces the per-page VendorNav + MobileShell pair with one responsive tree:
 * desktop = sidebar+topbar+content (240px grid), mobile = top bar + bottom
 * tabs + FAB + More drawer. Session, vendor identity, and badge counts are
 * resolved server-side so the shell never shows the wrong tenant or a flash
 * of "0" badges on hydration.
 *
 * Pages still rendering their own VendorNav / MobileShell will visibly
 * double-stack until they migrate; the LOVABLE_PORT_PLAN §6 schedules §4
 * (this work) last for exactly that reason.
 */
export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/signin?redirectTo=/vendor");

  const { vendor } = session;
  const [invoices, disputes] = await Promise.all([
    listInvoicesForVendor(vendor.id),
    listForVendor(vendor.id),
  ]);

  const pendingInvoiceCount = invoices.filter(
    (i) => i.status === "CREATED" || i.status === "ACCEPTED",
  ).length;
  const openDisputeCount = disputes.filter((d) => d.status !== "DECIDED").length;

  const initials =
    vendor.displayName
      .split(/\s+/)
      .map((p) => p[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "V";

  const subtitle = vendor.country
    ? `Vendor · ${vendor.country}`
    : "Vendor";

  return (
    <AppShell
      vendorName={vendor.displayName}
      vendorSubtitle={subtitle}
      initials={initials}
      notifCount={openDisputeCount}
      pendingInvoiceCount={pendingInvoiceCount}
    >
      {children}
    </AppShell>
  );
}
