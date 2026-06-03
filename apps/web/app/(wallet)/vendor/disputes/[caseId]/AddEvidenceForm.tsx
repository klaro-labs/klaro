"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { CheckIcon } from "@/components/ui/CheckIcon";
import { addEvidenceAction } from "../actions";
import type { Hex } from "@/lib/types";

/**
 * Add-evidence form for a dispute case. Converted from a bare server-action
 * <form> to a client submit so the most-pressed control in a high-stress
 * dispute has the states it was missing: it disables + shows "Submitting…"
 * while pending (no silent double-submit), surfaces a "Evidence added"
 * confirmation, and refreshes the timeline. Mirrors CashoutActions.
 */
export function AddEvidenceForm({ caseId }: { caseId: Hex }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <form
      id="add-evidence"
      onSubmit={(e) => {
        e.preventDefault();
        const note = String(
          new FormData(e.currentTarget).get("note") ?? "",
        ).trim();
        const formEl = e.currentTarget;
        start(async () => {
          setErr(null);
          try {
            await addEvidenceAction(caseId, note);
            setDone(true);
            formEl.reset();
            router.refresh();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not add evidence.");
          }
        });
      }}
      className="scroll-mt-24 rounded-lg border border-[var(--color-line)] bg-white p-5"
    >
      <h2 className="font-medium">Add evidence</h2>
      <textarea
        name="note"
        required
        minLength={5}
        rows={3}
        onChange={() => done && setDone(false)}
        placeholder="Attach demo evidence details for operator review."
        className="mt-2 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm transition-colors placeholder:text-[var(--color-ink-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Submitting…" : "Submit evidence"}
        </Button>
        {done && !pending ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-[var(--color-success)]">
            <CheckIcon className="size-4" /> Evidence added
          </span>
        ) : null}
      </div>
      {err ? (
        <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {err}
        </p>
      ) : null}
    </form>
  );
}
