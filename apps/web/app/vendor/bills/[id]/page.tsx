import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { VendorNav } from "@/components/klaro/VendorNav";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { mockGetBill } from "@/lib/mockData";
import { formatUSDC, relativeTime, shortAddress } from "@/lib/money";
import { payBillAction } from "./actions";

const STATUS_TONE: Record<string, "live" | "info" | "neutral" | "sim"> = {
  received: "info",
  scheduled: "info",
  paid: "live",
  rejected: "neutral",
};

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const { id } = await params;
  const bill = await mockGetBill(id);
  // same cross-tenant read gap
  // as the dispute detail page. `payBillAction` already checks
  // ownership; the read didn't. notFound rather than 403 so the
  // route doesn't leak bill existence.
  if (!bill || bill.vendorId !== session.vendor.id) notFound();

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <VendorNav vendorName={session.vendor.displayName} />
      <section className="mx-auto w-full max-w-[900px] px-6 py-10">
        <Link
          href="/vendor/bills"
          className="text-xs text-[var(--color-brand)] hover:underline"
        >
          ← Back to all bills
        </Link>

        <div className="mt-3 mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Bill from {bill.fromName}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              {formatUSDC(bill.amountUsdc)}
            </h1>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              {bill.description}
            </p>
          </div>
          <Badge tone={STATUS_TONE[bill.status]}>
            {bill.status.toUpperCase()}
          </Badge>
        </div>

        <dl className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-[var(--color-line)] bg-white p-6 text-sm">
          <div>
            <dt className="text-[var(--color-ink-subtle)]">From</dt>
            <dd>
              {bill.fromName}{" "}
              <span className="text-[var(--color-ink-subtle)]">
                · {bill.fromEmail}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-ink-subtle)]">Due</dt>
            <dd>{relativeTime(bill.dueAt)}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-ink-subtle)]">Received</dt>
            <dd>{relativeTime(bill.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-ink-subtle)]">Bill ID</dt>
            <dd className="font-mono">
              {shortAddress(
                ("0x" + bill.id.padEnd(64, "0").slice(0, 64)) as `0x${string}`,
              )}
            </dd>
          </div>
        </dl>

        {bill.status === "paid" ? (
          <div className="rounded-lg border border-[var(--color-brand)] bg-white p-5 text-sm">
            <p className="font-medium">Paid in full.</p>
            <p className="mt-1 text-[var(--color-ink-muted)]">
              Demo bill marked paid · preview visible at{" "}
              <Link
                href="/vendor"
                className="text-[var(--color-brand)] hover:underline"
              >
                vendor dashboard
              </Link>
              .
            </p>
          </div>
        ) : (
          <form
            action={async () => {
              "use server";
              await payBillAction(bill.id);
            }}
            className="rounded-lg border border-[var(--color-line)] bg-white p-6"
          >
            <p className="text-sm">
              Simulate payment of {formatUSDC(bill.amountUsdc)}. This records a
              demo result only; no wallet signature, escrow transfer, or receipt
              mint occurs.
            </p>
            <button
              type="submit"
              className="mt-3 rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Simulate {formatUSDC(bill.amountUsdc)} payment →
            </button>
            <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
              Simulator mode: marks the bill paid in demo state only. The hosted
              buyer route will handle live payments only after live mode is
              enabled and verified.
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
