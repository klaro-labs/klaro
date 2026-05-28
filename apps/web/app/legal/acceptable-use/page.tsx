import type { Metadata } from "next";
import { LegalLayout } from "@/components/klaro/LegalLayout";

export const metadata: Metadata = {
  title: "Acceptable Use · Klaro",
  description:
    "What you can and can't do with Klaro — prohibited categories, abuse handling, and contact paths.",
};

export default function AcceptableUsePage() {
  return (
    <LegalLayout title="Acceptable Use Policy" lastUpdated="2026-05-24">
      <p>
        Klaro is for legitimate vendor invoicing, settlement, and cashout. The
        following are prohibited and trigger account suspension + reporting to
        relevant authorities.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Prohibited categories
      </h2>
      <ul className="list-disc pl-5">
        <li>
          Money laundering, terrorist financing, sanctions evasion (3-of-3
          screening enforces).
        </li>
        <li>
          Sale of controlled substances, weapons, child sexual abuse material —
          zero tolerance.
        </li>
        <li>Unlicensed gambling, lotteries, or sweepstakes.</li>
        <li>Pyramid schemes, get-rich-quick programs, deceptive trading.</li>
        <li>
          Securities offerings without proper exemption (no token sales via
          Klaro invoices).
        </li>
        <li>
          Adult content and services per Visa/Mastercard MCC restrictions.
        </li>
      </ul>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Disputed sectors (escalate)
      </h2>
      <p>
        Cannabis, firearms accessories, high-risk crypto OTC, online gaming:
        contact{" "}
        <a
          className="text-[var(--color-brand)] hover:underline"
          href="mailto:compliance@klaro.so"
        >
          compliance@klaro.so
        </a>{" "}
        before onboarding. Live decisions depend on your jurisdiction +
        corridor.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Enforcement
      </h2>
      <p>
        Violations are recorded as{" "}
        <code className="font-mono text-xs">SLASH_PENALTY</code> events on{" "}
        <code className="font-mono text-xs">VendorReputation</code> with an
        immutable evidence hash. Severe cases trigger{" "}
        <code className="font-mono text-xs">KILL_FRAUD</code> via ReasonCodes,
        deactivating the agent / LP / vendor.
      </p>

      <h2 className="mt-6 font-display text-xl font-semibold text-[var(--color-ink)]">
        Report abuse
      </h2>
      <p>
        Tip line:{" "}
        <a
          className="text-[var(--color-brand)] hover:underline"
          href="mailto:abuse@klaro.so"
        >
          abuse@klaro.so
        </a>
        . We respond within 4 hours during business hours.
      </p>
    </LegalLayout>
  );
}
