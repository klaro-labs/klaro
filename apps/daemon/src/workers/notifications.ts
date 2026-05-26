/**
 * Notification fanout - vendor / lp / admin / buyer channels.
 * Inputs: queue('notify-vendor'), queue('notify-lp'), queue('notify-admin'), queue('notify-buyer').
 * Channels: email (Resend), Web Push (when subscribed). SMS/WhatsApp later.
 * the prior version had two
 * silent defects:
 * 1. `notify-buyer` only rendered `kind: "invoice.created"`; every
 * `lifecycle.due_X` / `lifecycle.overdue_X` job from
 * `lifecycleReminders` and every `invoice.refunded` job from
 * `arcSubscriber` was dropped with no log, no DLQ.
 * 2. `makeWorker` only ever called `emailVendor(job.data.vendorId)` -
 * buyer-bound jobs (which carry `invoiceId`, not `vendorId`) had
 * no recipient lookup path. Even if render returned non-null the
 * email never fired.
 * Now: explicit `recipient: "vendor" | "buyer" | "lp" | "admin"` per
 * worker; new `emailBuyer(invoiceId)` resolves from `invoices.customer_email`;
 * notify-buyer renders every kind the producers emit.
 */
import { createHash } from "node:crypto";
import { Resend } from "resend";
import { startWorker } from "../queue.js";
import { env } from "../env.js";
import { sb } from "../db.js";
import { log } from "../log.js";

export interface NotifyJob {
  invoiceId?: string;
  orderId?: string;
  vendorId?: string;
  lpId?: string;
  jobId?: string;
  receiptHash?: string;
  // arcSubscriber.OrderReleased enqueues `usdcAmount`
  // (6-dec USDC string) — the LP "released" email arm should surface
  // the amount instead of a generic "USDC has been released".
  amountUsdc?: string;
  kind: string;
  detail?: Record<string, unknown>;
}

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

async function sendEmail(to: string, subject: string, html: string) {
  if (!resend) {
    // previously logged the raw recipient email. A
    // centralized log scoop ingested PII addresses every send. Same
    // class as WHD2 URL-hash redaction. Hash the recipient
    // so operators can correlate by hash if needed; the actual
    // address only ever lives in Resend's audit log on the live path.
    const toHash = createHash("sha256").update(to).digest("hex").slice(0, 16);
    log.info("notify.email.mock", { toHash, subject });
    return;
  }
  await resend.emails.send({ from: env.RESEND_FROM, to, subject, html });
}

async function emailVendor(vendorId: string, subject: string, html: string) {
  // previously destructured `data` only. A transient
  // PostgREST failure rendered v as null → `no_email` warn + silent
  // notification drop with no DLQ. Same class as .
  const { data: v, error: vErr } = await sb()
    .from("vendors")
    .select("email,display_name")
    .eq("id", vendorId)
    .maybeSingle();
  if (vErr) throw vErr;
  if (!v?.email) {
    log.warn("notify.vendor.no_email", { vendorId, subject });
    return;
  }
  await sendEmail(v.email, subject, html);
}

async function emailBuyer(invoiceId: string, subject: string, html: string) {
  const { data: inv, error: invErr } = await sb()
    .from("invoices")
    .select("customer_email")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr) throw invErr;
  const to = inv?.customer_email as string | undefined;
  if (!to) {
    log.warn("notify.buyer.no_email", { invoiceId, subject });
    return;
  }
  await sendEmail(to, subject, html);
}

// notify-lp queue had a worker registered but the
// dispatcher had no `lp` branch — every `cashout.released` job (fired
// by both cashoutAdvancer.release AND the OrderReleased listener)
// fell through to notify.no_recipient and was silently dropped. LPs
// never learned their USDC was released. Producers pass `orderId`
// (not `lpId`) so we resolve via `cashout_orders.lp_id` → `lp_profiles
// .contact_email`. lpId override path stays for future callers that
// already have it.
async function emailLp(args: {
  lpId?: string;
  orderId?: string;
  subject: string;
  html: string;
}) {
  let lpId = args.lpId;
  if (!lpId && args.orderId) {
    const { data: order, error: oErr } = await sb()
      .from("cashout_orders")
      .select("lp_id")
      .eq("id", args.orderId)
      .maybeSingle();
    if (oErr) throw oErr;
    lpId = (order?.lp_id as string | undefined) ?? undefined;
  }
  if (!lpId) {
    log.warn("notify.lp.no_lp_resolved", {
      orderId: args.orderId,
      subject: args.subject,
    });
    return;
  }
  const { data: lp, error: lpErr } = await sb()
    .from("lp_profiles")
    .select("contact_email,legal_entity_name")
    .eq("lp_id", lpId)
    .maybeSingle();
  if (lpErr) throw lpErr;
  const to = lp?.contact_email as string | undefined;
  if (!to) {
    log.warn("notify.lp.no_email", { lpId, subject: args.subject });
    return;
  }
  await sendEmail(to, args.subject, args.html);
}

type Recipient = "vendor" | "buyer" | "lp" | "admin";

function makeWorker(
  name: string,
  recipient: Recipient,
  render: (job: NotifyJob) => { subject: string; html: string } | null,
) {
  startWorker<NotifyJob>(
    name,
    async (job) => {
      const out = render(job.data);
      if (!out) {
        log.warn("notify.unhandled_kind", {
          worker: name,
          kind: job.data.kind,
        });
        return;
      }
      if (recipient === "vendor" && job.data.vendorId) {
        await emailVendor(job.data.vendorId, out.subject, out.html);
      } else if (recipient === "vendor" && job.data.invoiceId) {
        // agent/receipt arms below pass invoiceId, not
        // vendorId — resolve the owner via invoices table so the email
        // still fires.
        // surface PostgREST error.
        const { data: inv, error: invErr } = await sb()
          .from("invoices")
          .select("vendor_id")
          .eq("id", job.data.invoiceId)
          .maybeSingle();
        if (invErr) throw invErr;
        if (inv?.vendor_id)
          await emailVendor(inv.vendor_id, out.subject, out.html);
        else log.warn("notify.vendor.no_vendor_resolved", { ...job.data });
      } else if (recipient === "vendor" && job.data.orderId) {
        // cashout.lp_assigned + cashout.confirm_receipt
        // arms carry only orderId (no vendorId / no invoiceId). Same
        // pattern as the invoiceId resolver — look up the
        // cashout_orders row to find the vendor that owns the cashout
        // so the email actually fires instead of falling through to
        // notify.no_recipient.
        // surface PostgREST error.
        const { data: ord, error: ordErr } = await sb()
          .from("cashout_orders")
          .select("vendor_id")
          .eq("id", job.data.orderId)
          .maybeSingle();
        if (ordErr) throw ordErr;
        if (ord?.vendor_id)
          await emailVendor(ord.vendor_id, out.subject, out.html);
        else log.warn("notify.vendor.no_vendor_resolved", { ...job.data });
      } else if (recipient === "vendor" && job.data.jobId) {
        // agent.job.completed jobs carry only `jobId`.
        // added the render arm but the dispatcher had
        // no resolver — every completed agent job notification fell
        // through silently. Look up the principal vendor via the
        // agent_jobs row so the email actually fires.
        // surface PostgREST error.
        const { data: aj, error: ajErr } = await sb()
          .from("agent_jobs")
          .select("principal_vendor_id")
          .eq("id", job.data.jobId)
          .maybeSingle();
        if (ajErr) throw ajErr;
        if (aj?.principal_vendor_id)
          await emailVendor(aj.principal_vendor_id, out.subject, out.html);
        else log.warn("notify.vendor.no_vendor_resolved", { ...job.data });
      } else if (recipient === "buyer" && job.data.invoiceId) {
        await emailBuyer(job.data.invoiceId, out.subject, out.html);
      } else if (recipient === "lp") {
        await emailLp({
          lpId: job.data.lpId,
          orderId: job.data.orderId,
          subject: out.subject,
          html: out.html,
        });
      } else if (recipient === "admin") {
        // Admin queue is not email-fanned-out today; logged for the ops
        // console + future PagerDuty integration.
        log.info("notify.admin.queued", { subject: out.subject });
      } else {
        log.warn("notify.no_recipient", {
          worker: name,
          recipient,
          hasVendor: Boolean(job.data.vendorId),
          hasInvoice: Boolean(job.data.invoiceId),
        });
      }
    },
    4,
  );
}

const LIFECYCLE_LABEL: Record<string, string> = {
  "lifecycle.due_14d": "due in 14 days",
  "lifecycle.due_7d": "due in 7 days",
  "lifecycle.due_3d": "due in 3 days",
  "lifecycle.overdue_1d": "now overdue",
  "lifecycle.overdue_7d": "7 days overdue",
};

export function startNotifications() {
  makeWorker("notify-vendor", "vendor", (d) => {
    if (d.kind === "invoice.settled") {
      return {
        subject: `Invoice ${d.invoiceId?.slice(0, 8)}... settled`,
        html: `<p>Klaro settled this invoice on Arc.</p>`,
      };
    }
    if (d.kind === "invoice.refunded") {
      return {
        subject: `Invoice ${d.invoiceId?.slice(0, 8)}... refunded`,
        html: `<p>The buyer's USDC was returned to their wallet. The invoice is closed.</p>`,
      };
    }
    if (d.kind === "cashout.lp_assigned") {
      return {
        subject: `Cashout ${d.orderId?.slice(0, 8)}... picked up`,
        html: `<p>An LP accepted your cashout.</p>`,
      };
    }
    if (d.kind === "cashout.confirm_receipt") {
      return {
        subject: `Confirm INR received for ${d.orderId?.slice(0, 8)}...`,
        html: `<p>Check your bank then confirm in the app.</p>`,
      };
    }
    // arcSubscriber enqueues these two kinds on
    // AgentEscrow.JobCompleted + AuditReceipt.ReceiptMinted; the
    // worker used to return null and silently drop both. Vendor now
    // hears about completed agent jobs + minted receipts.
    if (d.kind === "agent.job.completed") {
      return {
        subject: `Agent job ${d.jobId?.slice(0, 8)}... completed`,
        html: `<p>The agent finished its work and the deliverable is on-chain. Review it in the Klaro app.</p>`,
      };
    }
    if (d.kind === "receipt.minted") {
      return {
        subject: `Receipt minted for invoice ${d.invoiceId?.slice(0, 8)}...`,
        html: `<p>The Stenn-Proof receipt is now public at /receipt/${d.receiptHash}.</p>`,
      };
    }
    return null;
  });
  makeWorker("notify-lp", "lp", (d) => {
    if (d.kind !== "cashout.released") return null;
    // surface the released amount in the email. The
    // listener passes `amountUsdc` as a 6-decimal string from
    // `ev.args.usdcAmount.toString()`; format as dollars with 2dp
    // for the human-readable subject.
    const amountDollars = d.amountUsdc
      ? (Number(BigInt(d.amountUsdc)) / 1_000_000).toFixed(2)
      : null;
    return {
      subject: amountDollars
        ? `$${amountDollars} released to your wallet (cashout ${d.orderId?.slice(0, 8)}...)`
        : `Cashout released to your wallet (${d.orderId?.slice(0, 8)}...)`,
      html: amountDollars
        ? `<p>$${amountDollars} USDC has been released from escrow to your registered wallet.</p>`
        : `<p>USDC has been released from escrow to your registered wallet.</p>`,
    };
  });
  makeWorker("notify-admin", "admin", (d) => ({
    subject: `Admin queue: ${d.kind}`,
    html: `<p>${d.kind} for ${d.invoiceId ?? d.orderId ?? "?"} needs review.</p>`,
  }));
  makeWorker("notify-buyer", "buyer", (d) => {
    if (d.kind === "invoice.created") {
      return {
        subject: `New invoice from your vendor`,
        html: `<p>You have a new Klaro invoice to review.</p>`,
      };
    }
    if (d.kind === "invoice.refunded") {
      return {
        subject: `Refund issued for invoice ${d.invoiceId?.slice(0, 8)}...`,
        html: `<p>Your USDC has been returned to the wallet that paid.</p>`,
      };
    }
    if (LIFECYCLE_LABEL[d.kind]) {
      return {
        subject: `Invoice ${d.invoiceId?.slice(0, 8)}... - ${LIFECYCLE_LABEL[d.kind]}`,
        html: `<p>Reminder: your Klaro invoice is ${LIFECYCLE_LABEL[d.kind]}. Open the hosted page to pay.</p>`,
      };
    }
    return null;
  });
}
