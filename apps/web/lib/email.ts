/**
 * Email adapter — env-gated.
 * Live path uses Resend (RESEND_API_KEY env). Mock path appends to an
 * in-memory log so QA + tests can assert "email X would have been sent."
 * Templates are kept as plain HTML strings here; M11 swaps to React Email
 * components once `react-email` is added. Keeping HTML inline now means
 * zero new deps + the body is auditable in one place.
 * **All template copy obeys (honest labels):** every email
 * footer carries the "Testnet · No real money moves" disclaimer when the
 * environment is not mainnet.
 */

import { resendLive, RESEND_API_KEY, RESEND_FROM } from "./env";
import { formatUSDC } from "./money";

interface SendResult {
  ok: true;
  id: string;
  simulated: boolean;
}

/// unbounded module-scope array
/// of `{ to, subject, at, bodyPreview }` was a slow PII leak. Every
/// magic-link, lifecycle reminder, dispute notice appended forever —
/// raw recipient + 120 chars of body. A diagnostic memory dump or
/// long-tail error route surfaces every customer email ever sent.
/// Bound to the last `SENT_LOG_CAP` and gate writes to non-production.
const SENT_LOG_CAP = 50;
const _sentLog: Array<{
  to: string;
  subject: string;
  at: Date;
  bodyPreview: string;
}> = [];

/** Inspectable in tests / dev to assert lifecycle emails fired. */
export function mockSentEmails() {
  return [..._sentLog];
}

async function sendRaw(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  // Skip the log in production — there's no reason to retain recipient
  // PII in memory once Resend has actually sent the email.
  if (process.env.NODE_ENV !== "production") {
    _sentLog.push({
      to: opts.to,
      subject: opts.subject,
      at: new Date(),
      bodyPreview: opts.html.replace(/<[^>]+>/g, "").slice(0, 120),
    });
    if (_sentLog.length > SENT_LOG_CAP) {
      _sentLog.splice(0, _sentLog.length - SENT_LOG_CAP);
    }
  }

  if (!resendLive()) {
    // silent simulation in PROD means
    // vendors think an invoice email shipped when nothing reached the buyer.
    // Fail-closed in prod so misconfig surfaces at deploy, not in the field.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RESEND_API_KEY required in production — refusing to silently simulate email send",
      );
    }
    return { ok: true, id: `mock_${Date.now()}`, simulated: true };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(RESEND_API_KEY!);
  const { data, error } = await resend.emails.send({
    from: RESEND_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) throw error;
  return { ok: true, id: data?.id ?? "unknown", simulated: false };
}

// ─── Templates ──────────────────────────────────────────────────────

/**
 * HTML-escape user-controlled text before interpolating into an email body.
 * EMAIL1 closure : every template below
 * interpolated `vendorName`, `customerName`, `description`, `invoiceId`
 * raw into the HTML — a vendor or buyer could submit `<script>` or
 * break out of an attribute. Resend itself doesn't sanitize. Now
 * every user-controlled field flows through `esc()`. Trusted-source
 * fields (`hostedUrl`, `receiptUrl`) come from server-built URLs and
 * are left as-is, but live inside `href=""` so we still escape `"` to
 * prevent attribute breakouts.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FOOTER = `
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px;">
  <p style="font-size:12px;color:#a3a3a3;line-height:1.5;">
    Klaro is not a bank. Testnet preview. No real money moves on testnet.<br>
    <a href="https://www.myklaro.app/trust" style="color:#a3a3a3;">myklaro.app/trust</a>
    &nbsp;·&nbsp;
    <a href="https://www.myklaro.app/legal/privacy" style="color:#a3a3a3;">privacy</a>
  </p>
`;

const wrap = (title: string, body: string) => `
  <!doctype html><html><body style="font-family:-apple-system,sans-serif;color:#0a0a0a;background:#fafaf7;margin:0;padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:32px;">
      <h1 style="font-size:24px;font-weight:600;letter-spacing:-0.02em;margin:0 0 16px;">${title}</h1>
      ${body}
      ${FOOTER}
    </div>
  </body></html>
`;

export async function sendInvoiceLinkEmail(opts: {
  customerEmail: string;
  vendorName: string;
  amount: bigint;
  hostedUrl: string;
  description: string;
}) {
  const vendor = esc(opts.vendorName);
  const desc = esc(opts.description);
  const url = esc(opts.hostedUrl);
  return sendRaw({
    to: opts.customerEmail,
    subject: `${opts.vendorName} sent you an invoice for ${formatUSDC(opts.amount)}`,
    html: wrap(
      `Pay ${vendor} ${formatUSDC(opts.amount)}`,
      `
        <p>You've received an invoice for <strong>${desc}</strong>.</p>
        <p>Pay with USDC from any chain — Klaro settles on Arc in seconds, then mints a public receipt you can verify yourself.</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${url}" style="display:inline-block;background:#0a0a0a;color:#fff;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:500;">Pay invoice →</a>
        </p>
        <p style="font-size:13px;color:#525252;">No account needed. No card details stored. Buyer signature recorded on-chain.</p>
      `,
    ),
  });
}

export async function sendReminderEmail(opts: {
  customerEmail: string;
  vendorName: string;
  amount: bigint;
  hostedUrl: string;
  daysUntilDue: number;
}) {
  const vendor = esc(opts.vendorName);
  const url = esc(opts.hostedUrl);
  const subject =
    opts.daysUntilDue > 0
      ? `Reminder: invoice from ${opts.vendorName} due in ${opts.daysUntilDue} day${opts.daysUntilDue === 1 ? "" : "s"}`
      : `Past due: invoice from ${opts.vendorName}`;
  return sendRaw({
    to: opts.customerEmail,
    subject,
    html: wrap(
      "Just a quick reminder",
      `
        <p>Your invoice from <strong>${vendor}</strong> for ${formatUSDC(opts.amount)} is ${opts.daysUntilDue > 0 ? `due in ${opts.daysUntilDue} day${opts.daysUntilDue === 1 ? "" : "s"}` : "past due"}.</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${url}" style="display:inline-block;background:#0a0a0a;color:#fff;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:500;">Pay now →</a>
        </p>
      `,
    ),
  });
}

export async function sendSettledEmail(opts: {
  vendorEmail: string;
  amount: bigint;
  customerName: string;
  receiptUrl: string;
}) {
  const customer = esc(opts.customerName);
  const url = esc(opts.receiptUrl);
  return sendRaw({
    to: opts.vendorEmail,
    subject: `${formatUSDC(opts.amount)} settled from ${opts.customerName}`,
    html: wrap(
      `You got paid ${formatUSDC(opts.amount)}`,
      `
        <p><strong>${customer}</strong> just settled your invoice. USDC is in your Klaro balance.</p>
        <p>Your Klaro Proof receipt is live and shareable:</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="${url}" style="display:inline-block;background:#1b6bff;color:#fff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:500;">View receipt →</a>
        </p>
      `,
    ),
  });
}

export async function sendWelcomeEmail(opts: {
  vendorEmail: string;
  vendorName: string;
}) {
  const vendor = esc(opts.vendorName);
  return sendRaw({
    to: opts.vendorEmail,
    subject: "Welcome to Klaro — your first invoice in 90 seconds",
    html: wrap(
      `Welcome, ${vendor}`,
      `
        <p>You're set up. Klaro is the Arc-native invoice + receipt rail — vendors anywhere get paid in USDC, settle in seconds, and build on-chain financial reputation.</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="https://www.myklaro.app/vendor/invoices/new" style="display:inline-block;background:#0a0a0a;color:#fff;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:500;">Create your first invoice →</a>
        </p>
        <p style="font-size:13px;color:#525252;">Need help? <a href="https://www.myklaro.app/trust" style="color:#1b6bff;">myklaro.app/trust</a> · Reply to this email and we'll get back within 4 hours.</p>
      `,
    ),
  });
}

// ─── M9 lifecycle reminders (3d/7d/14d before due, 1d/7d after) ──────────

/** Off-chain scheduler (apps/daemon) picks invoices by due-date window + fires the
 * matching template. This module owns the copy + the send mechanics. */
export type ReminderWindow =
  | "due_14d"
  | "due_7d"
  | "due_3d"
  | "overdue_1d"
  | "overdue_7d";

const REMINDER_SUBJECTS: Record<ReminderWindow, (vendor: string) => string> = {
  due_14d: (v) => `Heads up — ${v} invoice due in 14 days`,
  due_7d: (v) => `${v} invoice due in 7 days`,
  due_3d: (v) => `${v} invoice due in 3 days`,
  overdue_1d: (v) => `${v} invoice now overdue`,
  overdue_7d: (v) => `${v} invoice 7 days overdue — escalation`,
};

const REMINDER_TONE: Record<ReminderWindow, string> = {
  due_14d: "Sending a friendly heads-up — no action needed yet.",
  due_7d: "Quick reminder before the week wraps.",
  due_3d: "Last gentle nudge before due date.",
  overdue_1d:
    "We didn't see the payment by the due date. A quick tap on the link below settles it.",
  overdue_7d:
    "This is the final automated reminder before we hand the case to support.",
};

export async function sendLifecycleReminder(opts: {
  buyerEmail: string;
  vendorName: string;
  invoiceId: string;
  amountUsdc: bigint;
  dueAtIso: string;
  hostedUrl: string;
  window: ReminderWindow;
}) {
  const subject = REMINDER_SUBJECTS[opts.window](opts.vendorName);
  const tone = REMINDER_TONE[opts.window];
  const invShort = esc(opts.invoiceId.slice(0, 10));
  const due = esc(opts.dueAtIso);
  const url = esc(opts.hostedUrl);
  return sendRaw({
    to: opts.buyerEmail,
    subject,
    html: wrap(
      esc(subject),
      `
        <p>${esc(tone)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0;border-collapse:collapse;">
          <tr>
            <td style="font-size:13px;color:#525252;padding:6px 0;">Invoice</td>
            <td style="font-size:13px;color:#0a0a0a;padding:6px 0;text-align:right;font-family:monospace;">${invShort}…</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#525252;padding:6px 0;">Amount</td>
            <td style="font-size:13px;color:#0a0a0a;padding:6px 0;text-align:right;">${formatUSDC(opts.amountUsdc)} USDC</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#525252;padding:6px 0;">Due</td>
            <td style="font-size:13px;color:#0a0a0a;padding:6px 0;text-align:right;">${due}</td>
          </tr>
        </table>
        <p style="text-align:center;margin:28px 0;">
          <a href="${url}" style="display:inline-block;background:#0a0a0a;color:#fff;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:500;">Pay invoice →</a>
        </p>
        <p style="font-size:12px;color:#737373;">Klaro never asks for your password or seed phrase. Trust the link from the email or paste the invoice id into your dashboard manually.</p>
      `,
    ),
  });
}
