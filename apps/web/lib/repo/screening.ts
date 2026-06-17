/**
 * Screening repository — reads the REAL 3-of-3 screening results the daemon's
 * screen-and-settle worker writes (sanctions/OFAC, behavioral, Sumsub KYB).
 * Live via Supabase; mock/dev returns [] (no screening runs without a daemon).
 *
 * Replaces the old hardcoded "simulated · provider access pending" placeholders
 * in the invoice + screening-detail pages, which kept claiming demo mode after
 * real OFAC + Sumsub screening went live and even rendered a false
 * "buyer wallet flagged in sanctions refresh" reason on every held invoice.
 */
import { tryDb } from "../db";

export interface ScreeningLeg {
  provider: string; // raw key, e.g. "ofac.sanctions"
  label: string; // display label
  result: "pass" | "fail" | "review";
  detail: string;
  evidenceHash: string;
  ranAt: string; // ISO
}

const PROVIDER_LABELS: Record<string, string> = {
  "ofac.sanctions": "OFAC SDN · sanctions",
  "klaro.behavioral": "Klaro behavioral",
  "sumsub.kyb": "Sumsub · KYB liveness",
};

interface RawScreenRow {
  provider: string;
  result: "pass" | "fail" | "review";
  detail_md: string | null;
  evidence_hash: string;
  ran_at: string;
}

/** Real screening legs for an invoice (live only). RLS scopes rows to the
 * vendor via the invoice FK, so a vendor only ever reads their own. */
export async function getInvoiceScreening(
  invoiceId: string,
): Promise<ScreeningLeg[]> {
  const c = await tryDb();
  if (!c) return [];
  // screening_results isn't in the generated typed-client surface; narrow-cast
  // the query (same pattern as lp/settings loadPrefs).
  const db = c as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          k: string,
          v: string,
        ) => {
          order: (
            k: string,
            o: { ascending: boolean },
          ) => Promise<{ data: RawScreenRow[] | null; error: unknown }>;
        };
      };
    };
  };
  const { data, error } = await db
    .from("screening_results")
    .select("provider,result,detail_md,evidence_hash,ran_at")
    .eq("invoice_id", invoiceId)
    .order("ran_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    provider: r.provider,
    label: PROVIDER_LABELS[r.provider] ?? r.provider,
    result: r.result,
    detail: r.detail_md ?? "",
    evidenceHash: r.evidence_hash,
    ranAt: r.ran_at,
  }));
}

export interface ScreeningSummary {
  tone: "danger" | "warn" | "info";
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}

/**
 * Derive the honest banner for a paid-but-not-yet-settled invoice from its real
 * screening legs. Returns null when there's nothing to surface (settled,
 * refunded, cancelled, or still awaiting the buyer).
 */
export function summarizeScreening(
  legs: ScreeningLeg[],
  status: string,
): ScreeningSummary | null {
  if (status !== "PAID" && status !== "ACCEPTED") return null;

  const fail = legs.find((l) => l.result === "fail");
  if (fail) {
    if (fail.provider.includes("sanctions"))
      return {
        tone: "danger",
        title: "Payment blocked",
        message:
          "The buyer's wallet matched a sanctions list, so funds stay in escrow pending review. We'll follow up at the address on file.",
      };
    if (fail.provider.includes("kyb"))
      return {
        tone: "danger",
        title: "Settlement blocked",
        message:
          (fail.detail ||
            "Your business verification was declined, so funds can't be released.") +
          " Reach us at prateek@myklaro.app.",
      };
    return {
      tone: "danger",
      title: "Held for review",
      message:
        fail.detail ||
        "A screening check failed; funds stay in escrow pending review.",
    };
  }

  const review = legs.find((l) => l.result === "review");
  if (review) {
    if (review.provider.includes("kyb"))
      return {
        tone: "warn",
        title: "Settlement pending verification",
        message:
          "Payment received and held in escrow. Complete your business verification (KYB) to release funds to your balance.",
        actionHref: "/vendor/settings",
        actionLabel: "Complete verification",
      };
    if (review.provider.includes("sanctions"))
      return {
        tone: "warn",
        title: "Screening in progress",
        message:
          "Verifying the buyer against sanctions lists. Funds release automatically once the check clears.",
      };
    return {
      tone: "warn",
      title: "Held for review",
      message: review.detail || "A screening check needs manual review.",
    };
  }

  if (legs.length === 0)
    return {
      tone: "info",
      title: "Payment received",
      message:
        "Screening runs now (sanctions, behavioral, KYB). Funds release to your balance once every check passes.",
    };

  // All legs passed but the settle tx hasn't landed yet — transient.
  return {
    tone: "info",
    title: "Payment received",
    message: "All screening checks passed — releasing to your balance.",
  };
}
