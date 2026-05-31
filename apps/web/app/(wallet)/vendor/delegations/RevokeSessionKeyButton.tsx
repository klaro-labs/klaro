"use client";

import { useState, useTransition } from "react";
import { revokeSessionKeyAction } from "./actions";

/** Revoke a session key the vendor owns. */
export function RevokeSessionKeyButton({ id }: { id: string }) {
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
            try {
              await revokeSessionKeyAction(id);
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Couldn't revoke");
            }
          });
        }}
        className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:border-rose-300 disabled:opacity-50"
      >
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {err ? <span className="text-[11px] text-rose-600">{err}</span> : null}
    </div>
  );
}
