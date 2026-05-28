import type { Metadata } from "next";
import { LegalLayout } from "@/components/klaro/LegalLayout";

export const metadata: Metadata = {
  title: "Cookies · Klaro",
  description:
    "Cookies Klaro sets, why each is set, and how to opt out of the optional analytics ones.",
};

const COOKIES = [
  {
    name: "klaro.cookie.consent.v1",
    category: "Essential",
    purpose: "Stores your consent choice",
    retention: "12 months",
  },
  {
    name: "sb-access-token",
    category: "Essential",
    purpose: "Keeps you signed in (Supabase Auth)",
    retention: "Session + 14 days",
  },
  {
    name: "sb-refresh-token",
    category: "Essential",
    purpose: "Refresh of access token",
    retention: "30 days",
  },
  {
    name: "ph_*",
    category: "Analytics",
    purpose: "PostHog product analytics (opt-in)",
    retention: "12 months",
  },
];

export default function CookiesPage() {
  return (
    <LegalLayout title="Cookie Policy" lastUpdated="2026-05-24">
      <p>
        Klaro uses the minimum cookies needed for sign-in + your consent record.
        Analytics cookies are strictly opt-in via the site-wide banner.
      </p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-[var(--color-line)] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-line)] text-xs uppercase text-[var(--color-ink-subtle)]">
            <tr>
              <th className="px-4 py-2 text-left">Cookie</th>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-left">Purpose</th>
              <th className="px-4 py-2 text-left">Retention</th>
            </tr>
          </thead>
          <tbody>
            {COOKIES.map((c) => (
              <tr
                key={c.name}
                className="border-b border-[var(--color-line)] last:border-0"
              >
                <td className="px-4 py-2 font-mono">{c.name}</td>
                <td className="px-4 py-2">{c.category}</td>
                <td className="px-4 py-2">{c.purpose}</td>
                <td className="px-4 py-2">{c.retention}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6">
        Change your choice anytime at{" "}
        <a
          className="text-[var(--color-brand)] hover:underline"
          href="/account/privacy"
        >
          /account/privacy
        </a>
        .
      </p>
    </LegalLayout>
  );
}
