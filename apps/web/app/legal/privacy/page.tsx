import type { Metadata } from "next";
import { LegalLayout } from "@/components/klaro/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy · Klaro",
  description:
    "Klaro privacy policy — what we collect, what we hash, what stays off-chain, and how to exercise your rights.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="2026-05-24">
      <p>
        <strong>Principle 11 — no PII on-chain.</strong> Klaro stores only
        hashes of identity bundles, payout-account routing details, and KYB
        documents on Arc. Your name, address, bank details, and government IDs
        stay in encrypted Supabase storage, never on a public chain.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        What we collect
      </h2>
      <ul className="list-disc pl-5">
        <li>Account: email, display name, country, wallet address.</li>
        <li>
          KYB: legal entity name, principal-officer ID, bank/UPI routing, AML
          policy (≥ T2 LPs only).
        </li>
        <li>
          Activity: invoice + cashout + dispute metadata, anonymised event logs.
        </li>
        <li>
          Cookies:{" "}
          <a
            className="text-[var(--color-brand)] hover:underline"
            href="/legal/cookies"
          >
            see cookie policy
          </a>
          .
        </li>
      </ul>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        What we don&apos;t collect
      </h2>
      <ul className="list-disc pl-5">
        <li>Browsing history outside Klaro surfaces.</li>
        <li>Third-party advertising identifiers.</li>
        <li>Behavioral profiles for ad targeting (we run no advertising).</li>
      </ul>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Your rights
      </h2>
      <p>
        GDPR + CCPA grant you access, rectification, erasure, and portability.
        Use{" "}
        <a
          className="text-[var(--color-brand)] hover:underline"
          href="/account/privacy"
        >
          /account/privacy
        </a>{" "}
        to export or delete your data. On-chain hashes are immutable but contain
        no PII — only the off-chain bundle holds your data.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Subprocessors
      </h2>
      <p>
        See{" "}
        <a
          className="text-[var(--color-brand)] hover:underline"
          href="/legal/subprocessors"
        >
          the subprocessors list
        </a>{" "}
        for every vendor that touches your data.
      </p>
    </LegalLayout>
  );
}
