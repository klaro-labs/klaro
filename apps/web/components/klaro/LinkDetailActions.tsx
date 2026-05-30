"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { deactivateLinkAction } from "@/app/(wallet)/vendor/links/[id]/actions";

/**
 * Client actions for a Klaro Link detail page: copy the shareable URL and
 * deactivate the link. Deactivation is irreversible from the UI (a new link
 * must be created), so it asks for confirmation first.
 */
export function LinkDetailActions({
  id,
  publicUrl,
  deactivated,
}: {
  id: string;
  publicUrl: string;
  deactivated: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy — select and copy the URL manually.");
    }
  }

  function deactivate() {
    setError(null);
    start(async () => {
      try {
        await deactivateLinkAction(id);
        setConfirming(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to deactivate.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="md" onClick={() => void copy()}>
          {copied ? "Copied ✓" : "Copy link"}
        </Button>
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-pill border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-medium hover:border-[var(--color-line-2)]"
        >
          Open ↗
        </a>
        {!deactivated ? (
          confirming ? (
            <span className="inline-flex items-center gap-2">
              <Button
                size="md"
                onClick={deactivate}
                disabled={pending}
                className="bg-rose-600 hover:bg-rose-700"
              >
                {pending ? "Turning off…" : "Confirm off"}
              </Button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-xs text-[var(--color-ink-subtle)] hover:text-[var(--color-ink)]"
              >
                cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center rounded-pill border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-medium text-rose-600 hover:border-rose-300"
            >
              Turn off
            </button>
          )
        ) : null}
      </div>
      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
