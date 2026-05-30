import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { LinkDetailActions } from "@/components/klaro/LinkDetailActions";
import { getCurrentSession } from "@/lib/auth";
import { getLinkById } from "@/lib/repo/links";
import { formatUSDC } from "@/lib/money";
import { PUBLIC_ORIGIN } from "@/lib/env";

/** Vendor → Klaro Link detail. Share URL, live status, pay/view counts, and
 *  the turn-off control. Ownership is enforced (RLS + an explicit check). */
export default async function LinkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const link = await getLinkById(id);
  if (!link || link.vendorId !== session.vendor.id) notFound();

  const off = Boolean(link.deactivatedAt);
  const expired = Boolean(link.expiresAt && link.expiresAt.getTime() < Date.now());
  const publicUrl = new URL(`/pay/${link.slug}`, PUBLIC_ORIGIN).toString();

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-6 md:py-10">
      <Link
        href="/vendor/links"
        className="text-sm font-medium text-[var(--color-klaro-orange)]"
      >
        ‹ All links
      </Link>

      <header className="mt-4 flex items-center gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {formatUSDC(link.amount)}
        </h1>
        {off ? (
          <Badge tone="sim">Off</Badge>
        ) : expired ? (
          <Badge tone="sim">Expired</Badge>
        ) : (
          <Badge tone="live">Active</Badge>
        )}
      </header>
      {link.label ? (
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{link.label}</p>
      ) : null}

      <section className="mt-6 rounded-2xl border border-[var(--color-line)] bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
          Shareable link
        </p>
        <p className="mt-1 break-all font-mono text-sm text-[var(--color-ink)]">{publicUrl}</p>
        <div className="mt-4">
          <LinkDetailActions id={link.id} publicUrl={publicUrl} deactivated={off} />
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            Paid
          </p>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight">
            {link.paidCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            Views
          </p>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight">
            {link.viewCount}
          </p>
        </div>
      </section>

      <p className="mt-4 text-xs text-[var(--color-ink-subtle)]">
        Created {link.createdAt.toLocaleDateString()}
        {link.expiresAt ? ` · expires ${link.expiresAt.toLocaleDateString()}` : " · no expiry"}
      </p>
    </div>
  );
}
