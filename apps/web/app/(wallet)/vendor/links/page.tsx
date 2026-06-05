import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { listLinksForVendor } from "@/lib/repo/links";
import { formatUSDC } from "@/lib/money";

/** Vendor → Klaro Links. Lists the vendor's reusable payment links with live
 *  status + pay/view counts. RLS scopes the query to the session vendor. */
export default async function LinksPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const links = await listLinksForVendor(session.vendor.id);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6 md:py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
            Payment links
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Reusable, fixed-amount pages. Share once, get paid in USDC many times.
          </p>
        </div>
        <Link
          href="/vendor/links/new"
          className="hidden shrink-0 items-center gap-1.5 rounded-pill bg-[var(--color-ink)] px-4 py-2 text-xs font-medium text-white hover:bg-[color-mix(in_oklab,var(--color-ink)_88%,white)] md:inline-flex"
        >
          + New link
        </Link>
      </header>

      {links.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-10 text-center">
          <p className="font-display text-lg font-semibold tracking-tight">No links yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--color-ink-muted)]">
            Create a link for a fixed price — a consult, a product, a tip jar — and
            share it. Anyone can pay it in USDC without an invoice.
          </p>
          <Link
            href="/vendor/links/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-pill bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-black"
          >
            + Create your first link
          </Link>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-[var(--color-line)] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
          {links.map((l) => {
            const off = Boolean(l.deactivatedAt);
            const expired = Boolean(l.expiresAt && l.expiresAt.getTime() < Date.now());
            return (
              <li key={l.id}>
                <Link
                  href={`/vendor/links/${l.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[var(--color-bg-elevated)]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg font-semibold tracking-tight">
                        {formatUSDC(l.amount)}
                      </span>
                      {off ? (
                        <Badge tone="sim">Off</Badge>
                      ) : expired ? (
                        <Badge tone="sim">Expired</Badge>
                      ) : (
                        <Badge tone="live">Active</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-[var(--color-ink-muted)]">
                      {l.label ?? "—"}{" "}
                      <span className="font-mono text-xs text-[var(--color-ink-subtle)]">
                        · myklaro.app/pay/{l.slug}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-medium">{l.paidCount} paid</p>
                    <p className="text-xs text-[var(--color-ink-subtle)]">{l.viewCount} views</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
