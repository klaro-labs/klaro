"use server";

// dual-mode via repo for the 3 wrapped mocks.
import { listInvoicesForVendor } from "@/lib/repo/invoices";
import { listForVendor as listCashoutsForVendor } from "@/lib/repo/cashouts";
import { getVendorById } from "@/lib/repo/vendors";
import { requireVendor } from "@/lib/auth";
import { captureError } from "@/lib/sentry";
import {
  buildTaxPackCsv,
  buildAuditPackJson,
  taxPackSummary,
} from "@/lib/exports";

export async function getTaxPackAction(input: {
  fromIso: string;
  toIso: string;
}): Promise<{
  csv: string;
  summary: ReturnType<typeof taxPackSummary>;
}> {
  const session = await requireVendor();
  try {
    const invoices = await listInvoicesForVendor(session.vendor.id);
    // QA-051: bare `new Date(input.fromIso)` returns Invalid Date for any
    // bad string — downstream date filters silently produce empty CSV
    // with no error. Vendor exports "no income this period" tax pack and
    // files wrong return. Validate explicitly at the boundary.
    const from = new Date(input.fromIso);
    const to = new Date(input.toIso);
    if (Number.isNaN(+from) || Number.isNaN(+to))
      throw new Error("validation_invalid_date_range: from/to must be ISO datetimes");
    if (from >= to)
      throw new Error("validation_invalid_date_range: from must be before to");
    return {
      csv: buildTaxPackCsv({ invoices, from, to }),
      summary: taxPackSummary({ invoices, from, to }),
    };
  } catch (e) {
    captureError(e, { action: "export.taxPack", vendorId: session.vendor.id });
    throw e;
  }
}

export async function getAuditPackAction(): Promise<{ json: string }> {
  const session = await requireVendor();
  try {
    const vendor = (await getVendorById(session.vendor.id)) ?? session.vendor;
    const invoices = await listInvoicesForVendor(session.vendor.id);
    const cashouts = await listCashoutsForVendor(session.vendor.id);
    return { json: buildAuditPackJson({ vendor, invoices, cashouts }) };
  } catch (e) {
    captureError(e, {
      action: "export.auditPack",
      vendorId: session.vendor.id,
    });
    throw e;
  }
}
