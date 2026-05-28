// TEMPORARY QA-014 debug endpoint. Reproduces /vendor/layout.tsx's render
// path in a JSON-returning Route Handler so we can see the actual error
// instead of Next.js's digest-only mask. Remove once root cause is fixed.
//
// Gated by ?token=<DEBUG_SECRET> + only ever returns to authenticated
// callers — the same session cookie the broken layout receives.
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { listInvoicesForVendor } from "@/lib/repo/invoices";
import { mockListDisputesForVendor } from "@/lib/mockData";

// 192-bit random token. Rotated when endpoint is deleted post-root-cause.
// QA-018 acknowledges this is hardcoded — endpoint is temporary, data
// exposure requires a Supabase session cookie, and the endpoint will be
// removed within the hour.
const DEBUG_TOKEN = "45abc8709c774b646eda0e1eebf6a2a6d77869068d91a55d";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("token") !== DEBUG_TOKEN) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const steps: { step: string; ok: boolean; error?: string; data?: unknown }[] = [];
  let session: Awaited<ReturnType<typeof getCurrentSession>>;
  try {
    session = await getCurrentSession();
    steps.push({
      step: "getCurrentSession",
      ok: true,
      data: session
        ? { vendorId: session.vendor.id, role: session.role, simulated: session.simulated }
        : null,
    });
  } catch (e) {
    steps.push({
      step: "getCurrentSession",
      ok: false,
      error: (e as Error)?.message ?? String(e),
    });
    return NextResponse.json({ steps }, { status: 500 });
  }
  if (!session) return NextResponse.json({ steps, terminal: "no_session" });

  try {
    const inv = await listInvoicesForVendor(session.vendor.id);
    steps.push({
      step: "listInvoicesForVendor",
      ok: true,
      data: { count: inv.length, firstId: inv[0]?.id },
    });
  } catch (e) {
    steps.push({
      step: "listInvoicesForVendor",
      ok: false,
      error: (e as Error)?.message ?? String(e),
    });
    return NextResponse.json({ steps }, { status: 500 });
  }

  try {
    const d = await mockListDisputesForVendor(session.vendor.id);
    steps.push({ step: "mockListDisputesForVendor", ok: true, data: { count: d.length } });
  } catch (e) {
    steps.push({
      step: "mockListDisputesForVendor",
      ok: false,
      error: (e as Error)?.message ?? String(e),
    });
    return NextResponse.json({ steps }, { status: 500 });
  }
  return NextResponse.json({ steps, ok: true });
}
