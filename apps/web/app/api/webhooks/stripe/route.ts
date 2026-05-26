import { makeWebhookReceiver } from "@/lib/webhookReceiver";
import { STRIPE_WEBHOOK_SECRET } from "@/lib/env";

export const POST = makeWebhookReceiver({
  provider: "stripe",
  headerName: "stripe-signature",
  format: "stripe",
  secret: STRIPE_WEBHOOK_SECRET,
});
