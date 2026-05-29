import type { Metadata } from "next";
import { LegalLayout } from "@/components/klaro/LegalLayout";

export const metadata: Metadata = {
  title: "Terms of Service · Klaro",
  description:
    "Klaro Terms of Service for the testnet preview build. No real money moves; production terms ship before mainnet.",
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="2026-05-24">
      <p>
        <strong>Klaro is testnet preview.</strong> No real money moves on this
        build. Production terms ship before mainnet.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        1. What Klaro is
      </h2>
      <p>
        Klaro is an Arc-native USDC invoicing, escrow, and cashout platform — on
        testnet, cashout to local currency is simulated (the INR corridor is a
        pilot) and no real fiat moves; live fiat cashout is mainnet-only. We
        do not custody fiat. We do not originate loans. We are not a bank,
        broker-dealer, money services business, or payment processor in any
        jurisdiction during the testnet phase.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        2. Who can use Klaro
      </h2>
      <p>
        You must be 18+, not on any sanctions list, and not located in an
        OFAC-restricted territory. KYB is required on mainnet; testnet is
        permissionless.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        3. Smart-contract risk
      </h2>
      <p>
        Klaro contracts on Arc are open source and unaudited at testnet. You
        bear the risk of bugs, exploits, or unintended behavior. We intend to
        publish audit reports and stand up a public bug-bounty program (Immunefi
        or equivalent) before mainnet.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        4. Disputes
      </h2>
      <p>
        Disputes are governed by the on-chain DisputeManager state machine +
        Klaro&apos;s review panel. Outcomes are final at testnet; mainnet adds
        an appeal window per jurisdiction.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        5. Termination
      </h2>
      <p>
        We may pause individual contracts or your account if you violate{" "}
        <a
          className="text-[var(--color-brand)] underline"
          href="/legal/acceptable-use"
        >
          acceptable use
        </a>{" "}
        or if a regulator instructs us to.
      </p>
    </LegalLayout>
  );
}
