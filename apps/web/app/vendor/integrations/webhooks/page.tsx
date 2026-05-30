import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { getCurrentSession } from "@/lib/auth";
import { mockListWebhooks } from "@/lib/mockData";
import { relativeTime } from "@/lib/money";
import { queueLive } from "@/lib/env";
import { getT } from "@/lib/i18n";
import { createWebhookAction } from "./actions";
import { TestPingButton } from "./TestPingButton";

export default async function WebhooksPage() {
  const t = await getT();
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const endpoints = await mockListWebhooks(session.vendor.id);

  return (
    <div>
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-subtle)]">
              {t("webhooks.title")}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              {t("webhooks.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              {t("webhooks.description")}
            </p>
          </div>
          <Badge tone={queueLive() ? "live" : "sim"}>
            {queueLive() ? "BullMQ live" : "Inline queue · REDIS_URL not set"}
          </Badge>
        </div>

        <form
          action={createWebhookAction}
          className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-line)] bg-white p-6 md:grid-cols-[1fr_auto] md:items-end"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              {t("webhooks.urlLabel")}
            </span>
            <input
              name="url"
              type="url"
              required
              placeholder="https://yourapp.com/klaro-webhook"
              className="rounded border border-[var(--color-line)] px-3 py-2 outline-none focus:border-[var(--color-brand)]"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white hover:bg-black"
          >
            {t("webhooks.addEndpoint")}
          </button>
        </form>

        <div className="mt-3 rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-ink-muted)]">
          <p className="font-medium text-[var(--color-ink)]">
            Verifying signatures
          </p>
          <p className="mt-1">
            Each delivery carries header{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono">
              Klaro-Signature: t=&lt;ts&gt;,v1=&lt;hmac&gt;
            </code>
            . Recompute <code>HMAC-SHA256(secret, "${"{ts}.{rawBody}"}")</code>{" "}
            and constant-time-compare. Reject deliveries older than 5 minutes.
          </p>
        </div>

        <h2 className="mt-10 mb-3 font-display text-xl font-semibold">
          Active endpoints
        </h2>
        {endpoints.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            {t("webhooks.noEndpoints")}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-white">
            {endpoints.map((w) => (
              <li key={w.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm">{w.url}</div>
                    <div className="mt-1 text-xs text-[var(--color-ink-subtle)]">
                      Signing secret:{" "}
                      <code className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 font-mono">
                        {w.signingSecret}
                      </code>
                    </div>
                    {w.lastDeliveryAt && (
                      <div className="mt-1 text-xs text-[var(--color-ink-subtle)]">
                        Last delivery {relativeTime(w.lastDeliveryAt)} ·{" "}
                        <span
                          className={
                            w.lastStatus === "ok"
                              ? "text-green-700"
                              : "text-red-700"
                          }
                        >
                          {w.lastStatus}
                        </span>
                      </div>
                    )}
                  </div>
                  <TestPingButton id={w.id} url={w.url} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
