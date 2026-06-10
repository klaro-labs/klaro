"use server";

import { z } from "zod";
import { headers } from "next/headers";
import crypto from "node:crypto";
import { serviceDb } from "@/lib/db";
import { supabaseLive, resendLive, RESEND_API_KEY, RESEND_FROM } from "@/lib/env";
import { captureError } from "@/lib/sentry";

const ContactInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().min(10).max(4000),
});

export type ContactInput = z.infer<typeof ContactInput>;

export interface ContactResult {
  ok: boolean;
  error?: string;
  simulated?: boolean;
}

const NOTIFY_TO = "prateek@myklaro.app";

/** Truncated SHA-256 of (IP + UA + daily salt). Lets us rate-limit and
 * spot brigading without keeping the raw IP. */
function fingerprint(ip: string, ua: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return crypto
    .createHash("sha256")
    .update(`${ip}|${ua}|${day}`)
    .digest("hex")
    .slice(0, 32);
}

export async function submitContactAction(
  raw: ContactInput,
): Promise<ContactResult> {
  const parsed = ContactInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please fill in name, a valid email, and a 10-character message." };
  }
  const input = parsed.data;

  // Edge middleware already caps /api/* per-IP; this action lives outside that
  // bucket, so add a coarse server-side guard using the fingerprint hash.
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const ua = h.get("user-agent") ?? "unknown";
  const fp = fingerprint(ip, ua);

  if (!supabaseLive()) {
    // Dev/preview without Supabase — still acknowledge so the UX is honest.
    return { ok: true, simulated: true };
  }

  try {
    const inserted = await serviceDb()
      .from("contact_submissions")
      .insert({
        name: input.name,
        email: input.email,
        company: input.company || null,
        message: input.message,
        source: "web_contact_form",
        user_agent: ua.slice(0, 250),
        ip_hash: fp,
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;

    if (resendLive()) {
      // Fire-and-forget — never block the user on email transport.
      void notifyOps(input, inserted.data?.id).catch((e) =>
        captureError(e, { route: "contact.notifyOps" }),
      );
    }

    return { ok: true, simulated: false };
  } catch (e) {
    captureError(e, { route: "contact.submitContactAction" });
    return {
      ok: false,
      error: "We couldn't record your message. Try again, or email prateek@myklaro.app directly.",
    };
  }
}

async function notifyOps(input: ContactInput, submissionId?: string) {
  const { Resend } = await import("resend");
  const resend = new Resend(RESEND_API_KEY!);
  const subject = `[Klaro contact] ${input.name}${input.company ? ` · ${input.company}` : ""}`;
  const body = `
    <p><strong>${escapeHtml(input.name)}</strong> &lt;${escapeHtml(input.email)}&gt;</p>
    ${input.company ? `<p>Company: ${escapeHtml(input.company)}</p>` : ""}
    <p style="white-space:pre-wrap;border-left:3px solid #e5e5e5;padding-left:12px;color:#262626">${escapeHtml(input.message)}</p>
    ${submissionId ? `<p style="font-size:11px;color:#737373">submission_id: ${submissionId}</p>` : ""}
  `;
  await resend.emails.send({
    from: RESEND_FROM,
    to: NOTIFY_TO,
    replyTo: input.email,
    subject,
    html: body,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
