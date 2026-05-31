"use client";

import { useState, useTransition } from "react";
import { deactivateWebhookAction } from "./actions";

/** Soft-delete (remove) an endpoint the vendor owns. */
export function DeactivateWebhookButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setErr(null);
          start(async () => {
            const r = await deactivateWebhookAction(id);
            if (!r.ok) setErr(r.error ?? "Couldn't remove");
          });
        }}
        className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:border-rose-300 disabled:opacity-50"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {err ? <span className="text-[11px] text-rose-600">{err}</span> : null}
    </div>
  );
}
