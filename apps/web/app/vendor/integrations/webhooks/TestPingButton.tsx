"use client";

import { useState, useTransition } from "react";
import { testWebhookAction } from "./actions";

export function TestPingButton({ id }: { id: string; url?: string }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function onClick() {
    setStatus(null);
    startTransition(async () => {
      // Audit fix (loop ): action ignores any client-supplied URL and
      // uses the webhook's stored URL — closes the SSRF that let any caller
      // tell Klaro to ping arbitrary URLs.
      const res = await testWebhookAction(id);
      setStatus(
        res.ok ? `${res.mode} · ok` : `failed · ${res.error ?? "unknown"}`,
      );
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={onClick}
        disabled={pending}
        className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs font-medium hover:border-[var(--color-brand)] disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send test ping"}
      </button>
      {status && (
        <span className="text-[11px] text-[var(--color-ink-subtle)]">
          {status}
        </span>
      )}
    </div>
  );
}
