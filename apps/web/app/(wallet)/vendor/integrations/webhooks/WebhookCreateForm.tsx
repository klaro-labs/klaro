"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createWebhookAction, type CreateWebhookState } from "./actions";

/**
 * Webhook create form + one-time signing-secret reveal. A plain
 * `<form action={serverAction}>` can't return data to the client, so the
 * webhook_create RPC's secret (generated + encrypted server-side, returned
 * exactly once) would be lost. `useActionState` returns the action result as
 * `state`, letting us show the secret once — in memory, never in the URL or a
 * cookie — with a copy button and a "you won't see this again" warning.
 */
export function WebhookCreateForm({
  urlLabel,
  addLabel,
}: {
  urlLabel: string;
  addLabel: string;
}) {
  const [state, action, pending] = useActionState<
    CreateWebhookState | null,
    FormData
  >(createWebhookAction, null);

  return (
    <div className="space-y-3">
      <form
        action={action}
        className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-line)] bg-white p-6 md:grid-cols-[1fr_auto] md:items-end"
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[var(--color-ink-muted)]">{urlLabel}</span>
          <Input
            name="url"
            type="url"
            required
            placeholder="https://yourapp.com/klaro-webhook"
          />
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding…" : addLabel}
        </Button>
      </form>

      {state && !state.ok && state.error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {state.error}
        </p>
      ) : null}

      {state?.ok && state.secret ? (
        <OneTimeSecret secret={state.secret} url={state.url} />
      ) : null}
    </div>
  );
}

function OneTimeSecret({ secret, url }: { secret: string; url?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">
        Copy your signing secret now — it won&rsquo;t be shown again.
      </p>
      <p className="mt-1 text-xs text-amber-800">
        {url ? (
          <>
            <span className="font-mono">{url}</span> is live.{" "}
          </>
        ) : null}
        Store this in your server and verify the{" "}
        <code className="rounded bg-white/70 px-1 py-0.5 font-mono">
          Klaro-Signature
        </code>{" "}
        HMAC on every delivery.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5 font-mono text-xs">
          {secret}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(secret);
            setCopied(true);
          }}
          className="shrink-0 rounded border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium hover:border-amber-400"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
