import type { Metadata } from "next";
import { LegalLayout } from "@/components/klaro/LegalLayout";

export const metadata: Metadata = {
  title: "Disclosures · Klaro",
  description:
    "Material disclosures about Klaro's testnet build — simulated surfaces, operator role, and pending partner integrations.",
};

export default function DisclosuresPage() {
  return (
    <LegalLayout title="Disclosures" lastUpdated="2026-05-24">
      <h2 className="mt-4 font-display text-xl font-semibold text-[var(--color-ink)]">
        Klaro is not a bank
      </h2>
      <p>
        Klaro does not accept deposits, hold customer fiat, issue loans,
        originate credit, or otherwise act as a financial institution. USDC is a
        digital dollar issued by Circle Internet Financial; Klaro is a software
        platform vendors use to invoice, escrow, and settle in USDC on Arc.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Testnet preview
      </h2>
      <p>
        This build runs on <strong>Arc Testnet only</strong> (chain id 5042002).
        No real money moves. Receipts are signal-only; cashout to local currency
        is simulated except for the INR pilot which goes live at mainnet.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Financing readiness preview
      </h2>
      <p>
        The <code className="font-mono text-xs">/vendor/financing</code> score
        is{" "}
        <strong>
          not a loan offer, not approval, not a commitment from any lender
        </strong>
        . Klaro does not hold lending capital. The score reflects only your
        Klaro history and is shared at your discretion with third-party
        financing partners.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        No investment advice
      </h2>
      <p>
        Nothing on Klaro is investment, tax, legal, or accounting advice.
        Consult a qualified professional before deploying capital.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Smart-contract risk
      </h2>
      <p>
        Klaro contracts are under testnet development and have not been
        independently audited for live funds. Complete contract testing,
        security review and a disclosure program are production-readiness gates.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Issuer / regulatory
      </h2>
      <p>
        Klaro is an early-stage software company. Specific licenses + entity
        registration land as we onboard regulated counterparties. Current
        status: pre-incorporation, soliciting Circle Developer Grant + Arc
        Builders Fund.
      </p>
    </LegalLayout>
  );
}
