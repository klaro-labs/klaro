"use server";

import { revalidatePath } from "next/cache";
import { mockGetBill, mockMarkBillPaid } from "@/lib/mockData";
import { requireVendor } from "@/lib/auth";
import { captureError } from "@/lib/sentry";

/** Mark a bill paid. Audit finding #2: previously took only `billId`, no
 * session check, no ownership check — any URL fired the mutation. Now
 * requires a vendor session AND verifies the bill belongs to that vendor. */
export async function payBillAction(billId: string): Promise<void> {
  const session = await requireVendor();
  try {
    const bill = await mockGetBill(billId);
    if (!bill) throw new Error("bill not found");
    if (bill.vendorId !== session.vendor.id)
      throw new Error("bill belongs to a different vendor");
    await mockMarkBillPaid(billId);
    revalidatePath("/vendor/bills");
    revalidatePath(`/vendor/bills/${billId}`);
  } catch (e) {
    captureError(e, {
      action: "bill.pay",
      vendorId: session.vendor.id,
      billId,
    });
    throw e;
  }
}
