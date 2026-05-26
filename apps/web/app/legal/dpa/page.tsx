import { LegalLayout } from "@/components/klaro/LegalLayout";

export default function DPAPage() {
  return (
    <LegalLayout title="Data Processing Agreement" lastUpdated="2026-05-24">
      <p>
        This draft Data Processing Agreement (DPA) is provided for testnet
        review and is not represented as a signed production agreement. It would
        supplement our{" "}
        <a
          className="text-[var(--color-brand)] hover:underline"
          href="/legal/terms"
        >
          Terms of Service
        </a>{" "}
        and governs Klaro&apos;s processing of personal data on behalf of
        vendors and their customers.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Roles
      </h2>
      <p>
        Vendor = data controller for invoice-line customer data. Klaro =
        processor for that data; controller for our own platform account data +
        KYB records.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Subject matter + duration
      </h2>
      <p>
        Klaro processes personal data only as needed to provide the platform —
        for as long as the vendor account exists, plus a 7-year retention window
        for AML records per FATF guidance.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Security
      </h2>
      <p>
        Production requirement: encrypted storage and transit, reviewed
        subprocessors, least-privilege internal access and strong multi-factor
        authentication. Control evidence must be completed before launch.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        International transfers
      </h2>
      <p>
        EU↔US transfers covered by Standard Contractual Clauses (Module 2 + 3).
        Indian + Filipino + Brazilian vendor data hosted in regional Supabase
        clusters.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Breach notification
      </h2>
      <p>
        72-hour controller notification per GDPR Art. 33. Affected end-users
        notified per applicable local law (e.g. CPRA, DPDP in India).
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Audits + signed copy
      </h2>
      <p>
        Questions about the planned signed DPA and future assurance reports can
        be sent to{" "}
        <a
          className="text-[var(--color-brand)] hover:underline"
          href="mailto:dpa@klaro.so"
        >
          dpa@klaro.so
        </a>
        . Public availability for &lt; 100-vendor accounts is via this page.
      </p>
    </LegalLayout>
  );
}
