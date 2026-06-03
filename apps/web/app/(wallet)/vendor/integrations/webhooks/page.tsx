import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { getCurrentSession } from "@/lib/auth";
import { listWebhooks } from "@/lib/repo/webhooks";
import { relativeTime } from "@/lib/money";
import { queueLive } from "@/lib/env";
import { getT } from "@/lib/i18n";
import { WebhookCreateForm } from "./WebhookCreateForm";
import { DeactivateWebhookButton } from "./DeactivateWebhookButton";
import { TestPingButton } from "./TestPingButton";

/** Mask a webhook signing secret on the list view — the full value is shown
 *  exactly once at creation (see WebhookCreateForm). We surface only the
 *  `whsec_` prefix and the last 4 chars so a row never leaks a usable credential. */
function maskSecret(secret: string): string {
  const last4 = secret.slice(-4);
  return `whsec_••••••••${last4}`;
}

export default async function WebhooksPage() {
  const t = await getT();
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const endpoints = await listWebhooks(session.vendor.id);

  return (
    <div>
      <section className="mx-auto w-full max-w-[1100px] px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Webhooks</Eyebrow>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              {t("webhooks.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              {t("webhooks.description")}
            </p>
          </div>
          <Badge tone={queueLive() ? "live" : "sim"}>
            {queueLive()
              ? "BullMQ live"
              : "Test mode (deliveries queued inline)"}
          </Badge>
        </div>

        <WebhookCreateForm
          urlLabel={t("webhooks.urlLabel")}
          addLabel={t("webhooks.addEndpoint")}
        />

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
                        {maskSecret(w.signingSecret)}
                      </code>{" "}
                      <span className="text-[var(--color-ink-muted)]">
                        (revealed once at creation)
                      </span>
                    </div>
                    {w.lastDeliveryAt && (
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-ink-subtle)]">
                        <span>Last delivery {relativeTime(w.lastDeliveryAt)}</span>
                        <Badge tone={w.lastStatus === "ok" ? "live" : "sim"}>
                          {w.lastStatus === "ok" ? "Delivered" : "Failed"}
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <TestPingButton id={w.id} url={w.url} />
                    <DeactivateWebhookButton id={w.id} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
