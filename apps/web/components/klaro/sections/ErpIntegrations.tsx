import { SectionHeader } from "../SectionHeader";
import { Badge } from "@/components/ui/Badge";

/**
 * §11 ERP integrations — six cards in a 3×2 grid. Three live, three
 * adapter-ready (per honest labeling).
 */

interface Erp {
  initials: string;
  name: string;
  region: string;
  protocol: string;
  status: "sandbox" | "adapter";
}

const ERPS: Erp[] = [
  {
    initials: "TP",
    name: "Tally Prime",
    region: "IN",
    protocol: "TallyConnect REST",
    status: "sandbox",
  },
  {
    initials: "QO",
    name: "QuickBooks Online",
    region: "US",
    protocol: "Intuit Apps",
    status: "sandbox",
  },
  {
    initials: "X",
    name: "Xero",
    region: "AU/NZ/UK",
    protocol: "OAuth 2",
    status: "sandbox",
  },
  {
    initials: "ZB",
    name: "Zoho Books",
    region: "IN/Global",
    protocol: "OAuth 2",
    status: "adapter",
  },
  {
    initials: "MA",
    name: "MYOB AccountRight",
    region: "AU",
    protocol: "API v2",
    status: "adapter",
  },
  {
    initials: "f",
    name: "freee",
    region: "JP",
    protocol: "OAuth 2",
    status: "adapter",
  },
];

export function ErpIntegrations() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,56px)] py-[clamp(80px,12vw,160px)]">
      <SectionHeader
        eyebrow="Integrations"
        title={
          <>
            Books still match.
            <br /> Even when the rails change.
          </>
        }
        lede="The integration design writes payment results back to accounting software with double-entry vouchers, idempotency keys, and a tax-pack PDF. Current connections remain sandbox or adapter-ready."
        className="max-w-2xl"
      />

      <ul className="mt-12 grid gap-5 md:grid-cols-3">
        {ERPS.map((e) => (
          <li
            key={e.name}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04)]"
          >
            <div className="flex items-start justify-between">
              <span className="inline-flex size-10 items-center justify-center rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] text-sm font-semibold text-[var(--color-ink-muted)]">
                {e.initials}
              </span>
              {e.status === "sandbox" ? (
                <Badge tone="sim">Sandbox</Badge>
              ) : (
                <Badge tone="neutral">Adapter-ready</Badge>
              )}
            </div>
            <h3 className="mt-6 font-display text-lg font-semibold tracking-tight">
              {e.name}
            </h3>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              {e.region} · {e.protocol}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-xs text-[var(--color-ink-subtle)]">
        Three ERP surfaces are represented for sandbox integration work. Three
        more remain adapter-ready pending real marketplace connections.
      </p>
    </section>
  );
}
