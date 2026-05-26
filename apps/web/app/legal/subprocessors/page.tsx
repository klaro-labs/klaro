import { LegalLayout } from "@/components/klaro/LegalLayout";

const SUBPROCESSORS = [
  {
    name: "Vercel",
    purpose: "Frontend hosting + edge functions",
    region: "Global edge",
    data: "Logs, request metadata",
  },
  {
    name: "Supabase",
    purpose: "Auth, Postgres, file storage",
    region: "EU + IN + US",
    data: "Vendor account, KYB docs, invoice metadata",
  },
  {
    name: "Upstash",
    purpose: "Redis queue (BullMQ)",
    region: "US + EU",
    data: "Job payloads (transient)",
  },
  {
    name: "Railway",
    purpose: "Operator daemon hosting",
    region: "US",
    data: "Operator logs",
  },
  {
    name: "Circle Internet Financial",
    purpose: "Modular Wallets, CCTP, Gateway, Stable FX",
    region: "Global",
    data: "Wallet metadata, FX quotes",
  },
  {
    name: "Resend",
    purpose: "Transactional + lifecycle email",
    region: "EU + US",
    data: "Recipient email + invoice link",
  },
  {
    name: "Sentry",
    purpose: "Error tracking",
    region: "EU + US",
    data: "Stack traces + request context",
  },
  {
    name: "PostHog",
    purpose: "Product analytics (opt-in)",
    region: "EU",
    data: "Anonymised events",
  },
  {
    name: "BetterStack",
    purpose: "Status page + uptime monitoring",
    region: "Global",
    data: "Service heartbeats",
  },
  {
    name: "GrowthBook (self-host)",
    purpose: "Feature flags",
    region: "US",
    data: "Feature-flag eval keys",
  },
  {
    name: "PagerDuty",
    purpose: "Incident escalation",
    region: "Global",
    data: "Alert metadata only",
  },
  {
    name: "Mudrex / Onmeta / TransFi (pilot)",
    purpose: "INR cashout payout (mainnet only)",
    region: "IN",
    data: "Cashout recipient name + bank/UPI",
  },
];

export default function SubprocessorsPage() {
  return (
    <LegalLayout title="Subprocessors" lastUpdated="2026-05-24">
      <p>
        Every vendor that processes data on Klaro&apos;s behalf is listed here.
        Material changes notified 30 days in advance per the DPA.
      </p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-[var(--color-line)] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-line)] text-xs uppercase text-[var(--color-ink-subtle)]">
            <tr>
              <th className="px-4 py-2 text-left">Vendor</th>
              <th className="px-4 py-2 text-left">Purpose</th>
              <th className="px-4 py-2 text-left">Region</th>
              <th className="px-4 py-2 text-left">Data</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((s) => (
              <tr
                key={s.name}
                className="border-b border-[var(--color-line)] last:border-0"
              >
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className="px-4 py-2">{s.purpose}</td>
                <td className="px-4 py-2">{s.region}</td>
                <td className="px-4 py-2">{s.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LegalLayout>
  );
}
