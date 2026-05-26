import { redirect } from "next/navigation";
import { VendorNav } from "@/components/klaro/VendorNav";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { BulkImportClient } from "./BulkImportClient";

export default async function BulkImportPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <VendorNav vendorName={session.vendor.displayName} />
      <section className="mx-auto w-full max-w-[1000px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              {t("bulk.title")}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              {t("bulk.title")}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[var(--color-ink-muted)]">
              {t("bulk.description")}
            </p>
          </div>
          <Badge tone="info">Up to 1,000 rows / file</Badge>
        </div>

        <div className="mb-6 rounded-lg border border-[var(--color-line)] bg-white p-4 text-sm">
          <p className="font-medium">CSV format</p>
          <pre className="mt-2 overflow-x-auto rounded bg-[var(--color-bg)] p-3 font-mono text-xs">
            {`customerEmail,amount,description,dueAt
lina@buyerco.com,500.00,Design sprint,2026-06-15
karim@ops.io,1250.50,Q2 retainer,2026-06-30`}
          </pre>
          <a
            href="data:text/csv;charset=utf-8,customerEmail%2Camount%2Cdescription%2CdueAt%0Alina%40buyerco.com%2C500.00%2CDesign%20sprint%2C2026-06-15"
            download="klaro-bulk-template.csv"
            className="mt-3 inline-block text-[var(--color-brand)] hover:underline"
          >
            ↓ {t("bulk.downloadTemplate")}
          </a>
        </div>

        <BulkImportClient />
      </section>
    </main>
  );
}
