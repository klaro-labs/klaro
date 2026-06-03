"use client";

import { useState, useTransition } from "react";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { submitContactAction } from "./actions";

type Status = "idle" | "sending" | "sent" | "error";

const FIELD_INPUT =
  "mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-klaro-orange)]";
const FIELD_LABEL =
  "block text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    message: "",
  });

  function onChange<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    startTransition(async () => {
      const res = await submitContactAction(form);
      if (!res.ok) {
        setStatus("error");
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setStatus("sent");
      setForm({ name: "", email: "", company: "", message: "" });
    });
  }

  if (status === "sent") {
    return (
      <div className="rounded-[var(--klaro-tile-radius)] border border-emerald-500/30 bg-emerald-50 p-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700">
          Received
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">
          We have your message.
        </h2>
        <p className="mt-3 text-sm text-emerald-900/80">
          A founder reads everything in this inbox. Expect a reply from a real
          klaro.so address within one business day.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 text-sm font-medium text-emerald-800 underline"
        >
          Send another
        </button>
      </div>
    );
  }

  const busy = pending || status === "sending";

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <label htmlFor="contact-name" className={FIELD_LABEL}>Name</label>
        <input
          id="contact-name"
          name="name"
          required
          autoComplete="name"
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          className={FIELD_INPUT}
        />
      </div>
      <div>
        <label htmlFor="contact-email" className={FIELD_LABEL}>Work email</label>
        <input
          id="contact-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
          className={FIELD_INPUT}
        />
      </div>
      <div>
        <label htmlFor="contact-company" className={FIELD_LABEL}>Company</label>
        <input
          id="contact-company"
          name="company"
          autoComplete="organization"
          value={form.company}
          onChange={(e) => onChange("company", e.target.value)}
          className={FIELD_INPUT}
        />
      </div>
      <div>
        <label htmlFor="contact-message" className={FIELD_LABEL}>What's on your mind?</label>
        <textarea
          id="contact-message"
          name="message"
          required
          minLength={10}
          rows={5}
          value={form.message}
          onChange={(e) => onChange("message", e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-klaro-orange)]"
        />
      </div>

      {status === "error" && error && (
        <div
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className={cn(buttonVariants({ size: "md" }))}
      >
        {busy ? "Sending…" : "Send message"}
      </button>
      <p className="text-[11px] text-[var(--color-muted)]">
        We store name, email, optional company, message, and a hashed IP for spam
        prevention. Nothing else. See{" "}
        <a href="/legal/privacy" className="underline">privacy notice</a>.
      </p>
    </form>
  );
}
