import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorNav } from "@/components/klaro/VendorNav";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";

export const metadata = { title: "Trust center · Klaro" };

const COMPLIANCE_DOCS = [
  {
    label: "SOC 2 Type II",
    status: "in-progress" as const,
    href: null,
    note: "Audit kicks off Q3 2026 once we have 90d of mainnet flow.",
  },
  {
    label: "DPA (Data Processing Agreement)",
    status: "in-progress" as const,
    href: "/legal/dpa",
    note: "Draft page for review; signed operating agreement not yet published.",
  },
  {
    label: "Sub-processors",
    status: "in-progress" as const,
    href: "/legal/subprocessors",
    note: "Vercel, Supabase, Sentry, PostHog, Resend, Cloudflare.",
  },
  {
    label: "Acceptable use policy",
    status: "in-progress" as const,
    href: "/legal/acceptable-use",
    note: "What you cannot use Klaro to settle.",
  },
  {
    label: "Privacy notice",
    status: "in-progress" as const,
    href: "/legal/privacy",
    note: "What we collect, why, how to delete.",
  },
  {
    label: "Terms of service",
    status: "in-progress" as const,
    href: "/legal/terms",
    note: "The full contract.",
  },
];

const SECURITY_CONTROLS = [
  {
    label: "Production database controls",
    body: "Required for launch: RLS-scoped storage, migration review and cross-tenant access tests. Demo state is not production storage.",
  },
  {
    label: "EIP-712 acceptance",
    body: "Required in live mode: buyer signs typed data without exposing a private key. Demo checkout does not create this signature.",
  },
  {
    label: "HMAC SHA-256 webhooks",
    body: "Required before integrations launch: signed delivery, replay protection and constant-time verification tests.",
  },
  {
    label: "ReentrancyGuard everywhere",
    body: "Contract control requiring complete Foundry verification before live-funds deployment.",
  },
  {
    label: "Echidna 5M-run",
    body: "Required security evidence before live funds; no completed fuzz report is published here.",
  },
  {
    label: "Halmos symbolic exec",
    body: "Required security evidence before live funds; no completed symbolic report is published here.",
  },
];

const COMPLIANCE_EVIDENCE = [
  {
    label: "Screening evidence bundle",
    body: "Demo preview only. Live screening evidence and anchoring remain disabled until providers are integrated.",
  },
  {
    label: "On-chain receipt",
    body: "Demo receipt preview only. On-chain minting is a live-mode requirement, not a current claim.",
  },
  {
    label: "Vendor reputation history",
    body: "Demo reputation preview only. On-chain score events require verified deployment.",
  },
];

export default async function VendorTrustCenterPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <VendorNav vendorName={session.vendor.displayName} />
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <header className="mb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            Compliance & trust
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Trust center
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
            A preview of the compliance pack Klaro must complete before a live
            launch. Items below are marked accurately as available or pending.
          </p>
        </header>

        <h2 className="mb-3 font-display text-xl font-semibold">
          Compliance documents
        </h2>
        <ul className="mb-10 divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
          {COMPLIANCE_DOCS.map((d) => (
            <li
              key={d.label}
              className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[1.4fr_auto_2fr_auto] md:items-center"
            >
              <span className="font-medium">{d.label}</span>
              <Badge tone="sim">In progress</Badge>
              <span className="text-xs text-[var(--color-ink-muted)]">
                {d.note}
              </span>
              {d.href ? (
                <Link
                  href={d.href as never}
                  className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs hover:border-[var(--color-brand)]"
                >
                  Open
                </Link>
              ) : (
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  —
                </span>
              )}
            </li>
          ))}
        </ul>

        <h2 className="mb-3 font-display text-xl font-semibold">
          Security controls
        </h2>
        <div className="mb-10 grid gap-3 md:grid-cols-2">
          {SECURITY_CONTROLS.map((c) => (
            <div
              key={c.label}
              className="rounded-lg border border-[var(--color-line)] bg-white p-5"
            >
              <h3 className="font-display text-base font-semibold">
                {c.label}
              </h3>
              <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                {c.body}
              </p>
            </div>
          ))}
        </div>

        <h2 className="mb-3 font-display text-xl font-semibold">
          Per-payment evidence
        </h2>
        <div className="mb-10 grid gap-3 md:grid-cols-3">
          {COMPLIANCE_EVIDENCE.map((c) => (
            <div
              key={c.label}
              className="rounded-lg border border-[var(--color-line)] bg-white p-5"
            >
              <h3 className="font-display text-base font-semibold">
                {c.label}
              </h3>
              <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                {c.body}
              </p>
            </div>
          ))}
        </div>

        <h2 className="mb-3 font-display text-xl font-semibold">Bug bounty</h2>
        <div className="rounded-lg border border-[var(--color-line)] bg-white p-6">
          <p className="text-sm text-[var(--color-ink-muted)]">
            A coordinated vulnerability disclosure channel and funded bounty are
            required before live funds. No active Immunefi program is claimed in
            this testnet demo.
          </p>
          <a
            href="https://immunefi.com/"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block text-sm text-[var(--color-brand)] hover:underline"
          >
            View Immunefi platform →
          </a>
        </div>
      </section>
    </main>
  );
}
