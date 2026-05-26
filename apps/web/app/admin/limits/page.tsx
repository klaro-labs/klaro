import { AdminNav } from "@/components/klaro/AdminNav";
import { Badge } from "@/components/ui/Badge";
import {
  listProtocolLimits,
  type ProtocolLimit,
} from "@/lib/repo/protocolLimits";

export const metadata = { title: "Limits · Klaro admin" };

export default async function AdminLimitsPage() {
  const { rows, source } = await listProtocolLimits();
  const groups = (["vendor", "lp", "protocol"] as const).map((category) => ({
    category,
    title:
      category === "vendor"
        ? "Vendor limits"
        : category === "lp"
          ? "LP limits"
          : "Protocol ceilings",
    items: rows.filter((r) => r.category === category),
  }));

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <AdminNav />
      <section className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              Admin · v2 §29.5
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Limits & ceilings
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Every number that bounds a money flow. Vendor + LP + protocol
              ceilings. Editable by operator via multisig change-control on
              mainnet; testnet is service-role write.
            </p>
          </div>
          <Badge tone={source === "live" ? "live" : "sim"}>
            {source === "live"
              ? "live · protocol_limits"
              : "fallback · canonical config"}
          </Badge>
        </header>

        {groups.map((g) => (
          <LimitGroup key={g.category} title={g.title} items={g.items} />
        ))}
      </section>
    </main>
  );
}

function LimitGroup({
  title,
  items,
}: {
  title: string;
  items: ProtocolLimit[];
}) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <Badge tone="info">{items.length}</Badge>
      </div>
      <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
        {items.map((it) => (
          <li
            key={it.label}
            className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[1.5fr_auto_2fr] md:items-center"
          >
            <span className="font-medium">{it.label}</span>
            <span className="font-mono text-sm">
              <strong>{it.value}</strong>{" "}
              <span className="text-[var(--color-ink-subtle)]">{it.unit}</span>
            </span>
            <span className="text-xs text-[var(--color-ink-muted)]">
              {it.why}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
