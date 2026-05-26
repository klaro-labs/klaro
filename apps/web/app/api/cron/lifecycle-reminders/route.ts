import { NextRequest } from "next/server";
import { listAllInvoices } from "@/lib/repo/invoices";
import { getVendorById } from "@/lib/repo/vendors";
import { sendLifecycleReminder, type ReminderWindow } from "@/lib/email";
import { CRON_SECRET } from "@/lib/env";
import { isFlagOn } from "@/lib/featureFlags";
import { seenOnce } from "@/lib/seenOnce";

/**
 * Lifecycle reminder cron. Called by Vercel Cron (or any external scheduler)
 * once an hour. Per v2 M11: 3d/7d/14d before due, 1d/7d after due.
 * Vercel cron config (live):
 * { "path": "/api/cron/lifecycle-reminders", "schedule": "0 * * * *" }
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}` header. Mock mode
 * accepts any caller — local dev convenience.
 */

const WINDOWS: {
  window: ReminderWindow;
  minDaysOut: number;
  maxDaysOut: number;
}[] = [
  { window: "due_14d", minDaysOut: 13, maxDaysOut: 14 },
  { window: "due_7d", minDaysOut: 6, maxDaysOut: 7 },
  { window: "due_3d", minDaysOut: 2, maxDaysOut: 3 },
  { window: "overdue_1d", minDaysOut: -2, maxDaysOut: -1 },
  { window: "overdue_7d", minDaysOut: -8, maxDaysOut: -7 },
];

const IS_PROD = process.env.NODE_ENV === "production";

export async function GET(req: NextRequest) {
  // prod with no secret silently allowed any caller
  // to fire the cron — a public endpoint that emails buyers.
  if (IS_PROD && !CRON_SECRET) {
    return Response.json(
      { ok: false, error: "CRON_SECRET required in production" },
      { status: 500 },
    );
  }
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return Response.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }
  }
  if (!(await isFlagOn("lifecycle_reminders_enabled"))) {
    return Response.json({ ok: true, skipped: "feature flag off" });
  }

  // was `mockListInvoices("vendor-asha")`
  // — single-vendor only. Live mode iterates every vendor's invoices via
  // Supabase, so the simulator must too — otherwise the per-vendor name
  // cache added in is single-element by construction and the
  // multi-vendor branch is never exercised.
  // swapped mockListAllInvoices →
  // dual-mode `listAllInvoices` so live Supabase mode actually iterates
  // every vendor (previously the cron was mock-only — in live mode the
  // import would have iterated nothing or the wrong shape).
  const invoices = await listAllInvoices();
  const now = Date.now();

  // previous version passed
  // `inv.customer.name` as `vendorName` — that's the BUYER's name, so the
  // email subject would render "Reminder from <buyer's own name>" instead
  // of the vendor's brand. Resolve the real vendor displayName from the
  // invoice's vendorId. Cache by id to avoid re-fetching the same vendor
  // 50 times when one vendor has many invoices.
  // cache against the dual-mode `getVendorById` so live mode
  // resolves the real vendor row by id (was `mockGetVendor` only, which
  // in live mode would have always returned Asha or null depending on
  // the mock fallback path).
  const vendorNameCache = new Map<string, string>();
  async function vendorNameFor(vendorId: string): Promise<string> {
    const cached = vendorNameCache.get(vendorId);
    if (cached) return cached;
    const v = await getVendorById(vendorId);
    const name = v?.displayName ?? "Klaro vendor";
    vendorNameCache.set(vendorId, name);
    return name;
  }

  // hourly cron + WINDOWS that
  // span 2 days (e.g., due_7d covers daysOut 6 and 7) meant each
  // invoice in a window got ~48 emails over the 48-hour eligibility
  // — buyer-spam class defect. Dedup per `(invoiceId, window)` via
  // the cross-replica `seenOnce` primitive. TTL = 14 days, longer
  // than the longest window so a buyer never re-receives the same
  // reminder.
  const REMINDER_TTL_SECONDS = 14 * 24 * 60 * 60;

  let sent = 0;
  let skipped = 0;
  for (const inv of invoices) {
    if (inv.status !== "CREATED" && inv.status !== "ACCEPTED") continue;
    const daysOut = Math.round((+inv.dueAt - now) / 86_400_000);
    const hit = WINDOWS.find(
      (w) => daysOut >= w.minDaysOut && daysOut <= w.maxDaysOut,
    );
    if (!hit) continue;

    const dedupKey = `lifecycle:${inv.id}:${hit.window}`;
    if (await seenOnce(dedupKey, REMINDER_TTL_SECONDS)) {
      skipped++;
      continue;
    }

    await sendLifecycleReminder({
      buyerEmail: inv.customer.email,
      vendorName: await vendorNameFor(inv.vendorId),
      invoiceId: inv.id,
      amountUsdc: inv.amount,
      dueAtIso: inv.dueAt.toISOString(),
      hostedUrl: `https://klaro.so/i/${inv.id}`,
      window: hit.window,
    });
    sent++;
  }

  return Response.json({
    ok: true,
    sent,
    skipped,
    considered: invoices.length,
  });
}
