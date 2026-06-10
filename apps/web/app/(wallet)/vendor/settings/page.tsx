import Image from "next/image";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Input } from "@/components/ui/Input";
import { getCurrentSession } from "@/lib/auth";
import { mockGetVendor } from "@/lib/mockData";
import { getKybStatus, sumsubConfigured } from "@/lib/sumsub";
import { updateBrandingAction } from "./actions";
import { SumsubKyb } from "./SumsubKyb";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const v = (await mockGetVendor(session.vendor.id)) ?? session.vendor;
  const color = v.brandColor ?? "#1B6BFF";
  const kybConfigured = sumsubConfigured();
  const kybStatus = kybConfigured
    ? await getKybStatus(session.vendor.id)
    : "error";

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6 md:px-6 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Settings</Eyebrow>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Branding
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
            Logo + color show on your hosted invoice page — the branded page
            your customers open to pay.{" "}
            {session.simulated
              ? "This screen updates demo branding only; no template version is written onchain."
              : "Every save bumps the onchain template version so historical receipts keep their original branding."}
          </p>
        </div>
        <Badge tone="info">v{v.invoiceTemplateVersion ?? 1}</Badge>
      </header>

      <form
        action={updateBrandingAction}
        className="mt-8 grid grid-cols-1 gap-4 rounded-lg border border-[var(--color-line)] bg-white p-6 md:grid-cols-2"
      >
        <label className="flex flex-col gap-1.5 text-sm md:col-span-2">
          <span className="text-[var(--color-ink-muted)]">Display name</span>
          <Input name="displayName" defaultValue={v.displayName} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[var(--color-ink-muted)]">
            Brand color (hex)
          </span>
          <Input
            name="brandColor"
            defaultValue={color}
            pattern="^#[0-9a-fA-F]{6}$"
            placeholder="#1B6BFF"
            className="font-mono"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[var(--color-ink-muted)]">
            Logo URL (public https only — data: URIs rejected to avoid
            injection)
          </span>
          <Input
            name="brandLogoUrl"
            defaultValue={v.brandLogoUrl ?? ""}
            placeholder="https://acme.com/logo.png"
          />
        </label>
        <div className="md:col-span-2">
          <Button type="submit" size="sm">
            Save branding
          </Button>
        </div>
      </form>

      <h2 className="mt-10 mb-3 font-display text-xl font-semibold">Preview</h2>
      <div className="rounded-lg border border-[var(--color-line)] bg-white p-6">
        <div className="flex items-center gap-4 border-b border-[var(--color-line)] pb-4">
          <div
            className="inline-flex size-12 items-center justify-center rounded-md text-sm font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            {v.brandLogoUrl ? (
              <Image
                src={v.brandLogoUrl}
                alt=""
                width={48}
                height={48}
                unoptimized
                className="h-12 w-12 rounded-md object-cover"
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
            type="button"
            style={{ backgroundColor: color }}
            className="ml-auto rounded-pill px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Pay with USDC
          </button>
        </div>
        <p className="mt-4 text-xs text-[var(--color-ink-subtle)]">
          The same logo + color ship on your{" "}
          <code className="font-mono">/i/[id]</code> hosted invoice. The public{" "}
          <code className="font-mono">/receipt/[hash]</code> stays Klaro-neutral
          so anyone can verify it without trusting your brand.
        </p>
      </div>

      <h2 className="mt-10 mb-3 font-display text-xl font-semibold">Account</h2>
      <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
        <SettingRow
          label="Email"
          value={v.email}
          hint="Sign-in identity. Change requires re-verification."
        />
        <SettingRow
          label="Country"
          value={v.country ?? "Not set"}
          hint="Affects KYB tier and corridor eligibility."
        />
        <SettingRow
          label="Wallet"
          value={
            v.wallet
              ? `${v.wallet.slice(0, 6)}…${v.wallet.slice(-4)}`
              : "Not yet provisioned"
          }
          hint="Circle Wallets payout address."
          mono
        />
      </ul>

      <h2 className="mt-10 mb-3 font-display text-xl font-semibold">
        Business verification (KYB)
      </h2>
      <div className="rounded-lg border border-[var(--color-line)] bg-white">
        {kybConfigured ? (
          <SumsubKyb status={kybStatus} />
        ) : (
          <p className="px-6 py-4 text-sm text-[var(--color-ink-muted)]">
            KYB verification isn&apos;t configured on this environment.
          </p>
        )}
      </div>
    </div>
  );
}

function SettingRow({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint: string;
  mono?: boolean;
}) {
  return (
    <li className="grid grid-cols-1 gap-1 px-5 py-4 md:grid-cols-[180px_1fr] md:items-center">
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-ink-subtle)]">
        {label}
      </span>
      <div>
        <p className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</p>
        <p className="text-xs text-[var(--color-ink-muted)]">{hint}</p>
      </div>
    </li>
  );
}
