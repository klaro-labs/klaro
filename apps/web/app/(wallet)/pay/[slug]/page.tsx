import { notFound } from "next/navigation";
import { Logo } from "@/components/klaro/Logo";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { PayFromLink } from "@/components/klaro/PayFromLink";
import { getLinkBySlug, incrementLinkView } from "@/lib/repo/links";
import { isValidSlug } from "@/lib/slugs";
import { formatUSDC, shortAddress } from "@/lib/money";

/**
 * Public Klaro Link checkout — `myklaro.app/pay/<slug>`. No auth. A link is a
 * reusable, fixed-amount payment page; the backing invoice is created + published
 * on-chain only when the buyer pays (see PayFromLink → /pay/[slug]/actions). The
 * page is server-rendered for fast first paint; the wallet flow is client-side.
 */
export default async function PayLinkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Cheap format pre-filter: reject malformed/scanning input before a DB
  // round-trip. A well-formed slug is exactly 8 base58 chars.
  if (!isValidSlug(slug)) notFound();
  const link = await getLinkBySlug(slug);
  if (!link) notFound();

  // Best-effort view count — never block the page on analytics.
  try {
    await incrementLinkView(slug);
  } catch {
    /* analytics is non-critical */
  }

  const off = Boolean(link.deactivatedAt);
  const expired = Boolean(
    link.expiresAt && link.expiresAt.getTime() < Date.now(),
  );
  const notReady = !link.vendorWallet;
  const vendorName =
    link.vendorDisplayName ??
    (link.vendorWallet
      ? `Vendor ${shortAddress(link.vendorWallet)}`
      : "Vendor");
  const initials = vendorName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (off || expired || notReady) {
    const title = off
      ? "This link has been turned off."
      : expired
        ? "This link has expired."
        : "This seller isn't ready yet.";
    const body = off
      ? "The seller deactivated this payment link. Ask them for a fresh one."
      : expired
        ? "The seller set an expiry that has passed. Ask them to send a new link."
        : "The seller hasn't finished wallet setup. Try again shortly.";
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center text-[var(--color-ink)]">
        <Eyebrow>Payment link</Eyebrow>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-3 max-w-md text-sm text-[var(--color-ink-muted)]">
          {body}
        </p>
        <p className="mt-6 font-mono text-xs text-[var(--color-ink-subtle)]">
          myklaro.app/pay/{slug}
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-ink)]">
      <header className="flex items-center justify-between px-5 pt-5 md:px-8">
        <Logo size={20} />
        <span className="font-mono text-[11px] text-[var(--color-ink-subtle)]">
          myklaro.app/pay/{slug}
        </span>
      </header>

      <section className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-16 pt-8">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-[var(--color-klaro-orange-deep)] font-display text-lg font-semibold text-white">
            {initials}
          </span>
          <div>
            <p className="text-xs text-[var(--color-ink-subtle)]">Pay</p>
            <p className="font-medium">{vendorName}</p>
          </div>
        </div>

        <article className="mt-5 rounded-2xl border border-[var(--color-line)] bg-white p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
            Amount
          </p>
          <p className="mt-1 font-display text-[clamp(2rem,9vw,3rem)] font-semibold tracking-tight tabular-nums break-words">
            {formatUSDC(link.amount)}
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            {(Number(link.amount) / 1_000_000).toLocaleString()} USDC
            {link.label ? ` · ${link.label}` : ""}
          </p>
        </article>

        <div className="mt-5">
          <PayFromLink slug={slug} />
        </div>

        <p className="mt-6 text-center text-[11px] text-[var(--color-ink-subtle)]">
          Powered by Klaro — USDC payments on Arc.
        </p>
      </section>
    </main>
  );
}
