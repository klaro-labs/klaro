import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { VendorNav } from "@/components/klaro/VendorNav";
import { MobileShell } from "@/components/klaro/MobileShell";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { mockGetVendor } from "@/lib/mockData";
import { updateBrandingAction } from "./actions";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const v = (await mockGetVendor(session.vendor.id)) ?? session.vendor;
  const color = v.brandColor ?? "#1B6BFF";

  return (
    <>
      <div className="md:hidden">
        <MobileShell active="profile">
          <header>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Profile
            </h1>
          </header>

          <article className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-line)] bg-white p-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-11 place-items-center rounded-full bg-[var(--color-brand)] font-display text-sm font-semibold text-white"
              >
                {v.displayName
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-medium">{v.displayName}</p>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {v.email}
                </p>
              </div>
            </div>
            <span aria-hidden className="text-[var(--color-ink-subtle)]">
              ›
            </span>
          </article>

          <p className="mt-6 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-ink-subtle)]">
            Account
          </p>
          <ul className="mt-3 divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-white">
            <SetRow
              title="Business"
              sub={`${v.country ?? "—"} · verification pending`}
            />
            <SetRow
              title="KYC tier"
              sub="Tier 2 · upgrade for mainnet"
              subTone="amber"
              badge
            />
          </ul>

          <p className="mt-6 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-ink-subtle)]">
            Wallet
          </p>
          <ul className="mt-3 divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-white">
            <SetRow
              title="Receive"
              sub={
                v.wallet
                  ? `${v.wallet.slice(0, 6)}…${v.wallet.slice(-4)}`
                  : "Not yet provisioned"
              }
            />
            <SetRow
              title="Bank"
              sub="HDFC ••5421 · simulated"
              subTone="amber"
              badge
            />
          </ul>

          <p className="mt-6 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-ink-subtle)]">
            Help
          </p>
          <ul className="mt-3 divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-white">
            <SetRow title="Docs" sub="docs.klaro.so" subTone="brand" />
            <SetRow title="Talk to us" sub="hello@klaro.so" subTone="brand" />
          </ul>
        </MobileShell>
      </div>

      <main className="hidden min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)] md:block">
        <VendorNav vendorName={v.displayName} />
        <section className="mx-auto w-full max-w-[1000px] px-6 py-10">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
                Settings
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
                Branding
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
                Logo + color show on your hosted invoice page, receipt PDF, and
                Apple/Google Wallet passes.{" "}
                {session.simulated
                  ? "This screen updates demo branding only; no template version is written onchain."
                  : "Every save bumps the onchain template version so historical receipts keep their original branding."}
              </p>
            </div>
            <Badge tone="info">v{v.invoiceTemplateVersion ?? 1}</Badge>
          </div>

          <form
            action={updateBrandingAction}
            className="grid grid-cols-1 gap-4 rounded-lg border border-[var(--color-line)] bg-white p-6 md:grid-cols-2"
          >
            <label className="flex flex-col gap-1.5 text-sm md:col-span-2">
              <span className="text-[var(--color-ink-muted)]">
                Display name
              </span>
              <input
                name="displayName"
                defaultValue={v.displayName}
                className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-[var(--color-ink-muted)]">
                Brand color (hex)
              </span>
              <input
                name="brandColor"
                defaultValue={color}
                pattern="^#[0-9a-fA-F]{6}$"
                placeholder="#1B6BFF"
                className="rounded border border-[var(--color-line)] px-3 py-2 font-mono outline-none focus:border-[var(--color-brand)]"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-[var(--color-ink-muted)]">
                Logo URL (public https only — data: URIs rejected to avoid
                injection)
              </span>
              <input
                name="brandLogoUrl"
                defaultValue={v.brandLogoUrl ?? ""}
                placeholder="https://acme.com/logo.png"
                className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
              >
                Save branding
              </button>
            </div>
          </form>

          <h2 className="mt-10 mb-3 font-display text-xl font-semibold">
            Preview
          </h2>
          <div className="rounded-lg border border-[var(--color-line)] bg-white p-6">
            <div className="flex items-center gap-4 border-b border-[var(--color-line)] pb-4">
              <div
                className="inline-flex size-12 items-center justify-center rounded text-sm font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {v.brandLogoUrl ? (
                  // swap raw <img> for
                  // next/image. `unoptimized` because brand logos are vendor-
                  // uploaded with arbitrary remote domains — adding each to
                  // next.config remotePatterns would gate every brand upload.
                  <Image
                    src={v.brandLogoUrl}
                    alt=""
                    width={48}
                    height={48}
                    unoptimized
                    className="h-12 w-12 rounded object-cover"
                  />
                ) : (
                  v.displayName.slice(0, 2).toUpperCase()
                )}
              </div>
              <div>
                <div className="font-medium">{v.displayName}</div>
                <div className="text-xs text-[var(--color-ink-subtle)]">
                  Invoice header preview
                </div>
              </div>
              <button
                style={{ backgroundColor: color }}
                className="ml-auto rounded px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Pay with USDC
              </button>
            </div>
            <p className="mt-4 text-xs text-[var(--color-ink-subtle)]">
              Same primitives ship on <code className="font-mono">/i/[id]</code>{" "}
              hosted invoice +{" "}
              <code className="font-mono">/receipt/[hash]</code> public receipt.
              Apple/Google Wallet passes pick up the color as the strip color.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

function SetRow({
  title,
  sub,
  subTone,
  badge,
}: {
  title: string;
  sub: string;
  subTone?: "amber" | "brand";
  badge?: boolean;
}) {
  const subClass =
    subTone === "amber"
      ? "text-amber-700"
      : subTone === "brand"
        ? "text-[var(--color-brand)]"
        : "text-[var(--color-ink-muted)]";
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className={`text-xs ${subClass}`}>{sub}</p>
      </div>
      <span className="flex items-center gap-2">
        {badge ? (
          <span aria-hidden className="size-2 rounded-full bg-amber-400" />
        ) : null}
        <span aria-hidden className="text-[var(--color-ink-subtle)]">
          ›
        </span>
      </span>
    </li>
  );
}
