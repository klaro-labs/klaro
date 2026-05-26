import { SectionHeader } from "../SectionHeader";

/**
 * §9 Corridors — 11-row table with country, currency, route, partner, status.
 * One LIVE corridor (USDC native US), one PILOT (INR), one ACCESS-GATED (EUR
 * StableFX), the rest are simulations. Honest labeling is the whole point.
 */

type Status = "live" | "pilot" | "access-gated" | "sim";

interface Corridor {
  code: string;
  country: string;
  ccy: string;
  route: string;
  partner: string;
  status: Status;
}

const ROWS: Corridor[] = [
  {
    code: "IN",
    country: "India",
    ccy: "INR",
    route: "Partner Cashout",
    partner: "Partner integration pending",
    status: "pilot",
  },
  {
    code: "BR",
    country: "Brazil",
    ccy: "BRL",
    route: "BRLA · simulation",
    partner: "Avenia",
    status: "sim",
  },
  {
    code: "MX",
    country: "Mexico",
    ccy: "MXN",
    route: "MXN · simulation",
    partner: "Juno",
    status: "sim",
  },
  {
    code: "PH",
    country: "Philippines",
    ccy: "PHP",
    route: "PHP · simulation",
    partner: "Coins.ph",
    status: "sim",
  },
  {
    code: "KE",
    country: "Kenya",
    ccy: "KES",
    route: "KES · simulation",
    partner: "Partner-pending",
    status: "sim",
  },
  {
    code: "NG",
    country: "Nigeria",
    ccy: "NGN",
    route: "NGN · simulation",
    partner: "Partner-pending",
    status: "sim",
  },
  {
    code: "ZA",
    country: "South Africa",
    ccy: "ZAR",
    route: "ZAR · simulation",
    partner: "Luno",
    status: "sim",
  },
  {
    code: "JP",
    country: "Japan",
    ccy: "JPY",
    route: "JYPC · simulation",
    partner: "JPYC",
    status: "sim",
  },
  {
    code: "KR",
    country: "South Korea",
    ccy: "KRW",
    route: "KRW · simulation",
    partner: "BDACS",
    status: "sim",
  },
  {
    code: "EU",
    country: "Eurozone",
    ccy: "EUR",
    route: "EURC · StableFX",
    partner: "Circle",
    status: "access-gated",
  },
  {
    code: "US",
    country: "United States",
    ccy: "USD",
    route: "USDC native",
    partner: "Circle",
    status: "live",
  },
];

const STATUS_PILL: Record<Status, string> = {
  live: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pilot:
    "bg-[var(--color-brand-soft)] text-[var(--color-brand)] ring-[color-mix(in_oklab,var(--color-brand)_15%,transparent)]",
  "access-gated":
    "bg-[var(--color-brand-soft)] text-[var(--color-brand)] ring-[color-mix(in_oklab,var(--color-brand)_15%,transparent)]",
  sim: "bg-[var(--color-bg)] text-[var(--color-ink-muted)] ring-[var(--color-line)]",
};

const STATUS_DOT: Record<Status, string> = {
  live: "bg-emerald-500",
  pilot: "bg-[var(--color-brand)]",
  "access-gated": "bg-[var(--color-brand)]",
  sim: "bg-[var(--color-ink-subtle)]",
};

const STATUS_LABEL: Record<Status, string> = {
  live: "LIVE",
  pilot: "INR PILOT",
  "access-gated": "ACCESS-GATED",
  sim: "SIMULATION",
};

export function Corridors() {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-6 py-28 md:mt-[118px] md:py-40">
      <SectionHeader
        eyebrow="Corridors"
        title={
          <>
            One pilot. Ten simulations.
            <br />
            Zero pretending.
          </>
        }
        lede="India is the first cashout simulation corridor. Partner integrations and licensed payout activation are pending; other corridors remain clearly marked simulations."
        className="max-w-3xl"
      />

      <div className="mt-12 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-line)] bg-[var(--color-bg)]">
            <tr className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              <th className="px-5 py-3 text-left">Country</th>
              <th className="px-5 py-3 text-left"></th>
              <th className="px-5 py-3 text-left">Currency</th>
              <th className="px-5 py-3 text-left">Route</th>
              <th className="px-5 py-3 text-left">Partner</th>
              <th className="px-5 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr
                key={r.code}
                className="border-b border-[var(--color-line)] last:border-b-0"
              >
                <td className="px-5 py-3">
                  <span className="inline-flex items-center justify-center rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 font-mono text-xs text-[var(--color-ink-muted)]">
                    {r.code}
                  </span>
                </td>
                <td className="px-5 py-3 text-[var(--color-ink)]">
                  {r.country}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-[var(--color-ink-muted)]">
                  {r.ccy}
                </td>
                <td className="px-5 py-3 text-[var(--color-ink)]">{r.route}</td>
                <td className="px-5 py-3 text-[var(--color-ink-muted)]">
                  {r.partner}
                </td>
                <td className="px-5 py-3 text-right">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${STATUS_PILL[r.status]}`}
                  >
                    <span
                      aria-hidden
                      className={`size-1.5 rounded-full ${STATUS_DOT[r.status]}`}
                    />
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-[var(--color-ink-subtle)]">
        Klaro is not a bank · partner payout availability and fees depend on the
        licensed partner
      </p>
    </section>
  );
}
